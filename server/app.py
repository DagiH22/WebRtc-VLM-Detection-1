import os
import json
import time
import asyncio
from typing import List, Optional
from pathlib import Path

import numpy as np
import av
import cv2
import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
from aiortc.contrib.media import MediaBlackhole

# -------------------- Config --------------------
INFER_EVERY_N_FRAMES = int(os.getenv("INFER_EVERY_N_FRAMES", "3"))
METRICS_FILE = Path("metrics.json")  # metrics output

# -------------------- Load YOLO once --------------------
print("Loading YOLOv5 model...")
_yolo_model = torch.hub.load("ultralytics/yolov5", "custom", path="yolov5n.pt", force_reload=False)
_yolo_model.eval()
print("YOLOv5 model loaded.")

# -------------------- Web server --------------------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Offer(BaseModel):
    sdp: str
    type: str

pcs: List[RTCPeerConnection] = []

# -------------------- YOLO Overlay Track with metrics --------------------
class YOLOOverlayTrack(MediaStreamTrack):
    kind = "video"

    def __init__(self, source_track: MediaStreamTrack, target_fps: float = 15.0):
        super().__init__()
        self.track = source_track
        self.frame_id = 0
        self.target_fps = target_fps
        self._last_send_time = 0.0

        # Metrics collection
        self.metrics = []
        self.bench_start_time = time.time()

    async def recv(self) -> av.VideoFrame:
        while True:
            frame: av.VideoFrame = await self.track.recv()
            now = time.time()
            interval = 1.0 / self.target_fps

            # Only process/send if enough time has passed
            if now - self._last_send_time < interval:
                continue

            self.frame_id += 1
            self._last_send_time = now

            # Convert to ndarray
            img_bgr = frame.to_ndarray(format="bgr24")
            recv_ts = int(time.time() * 1000)  # ms

            # YOLO inference
            t0 = time.time()
            results = _yolo_model(img_bgr)
            t1 = time.time()
            inference_ts = int(t1 * 1000)

            # Draw detections
            drawn = results.render()[0]

            # Record metrics
            self.metrics.append({
                "frame_id": self.frame_id,
                "capture_ts": int(frame.pts * frame.time_base * 1000),  # approximate
                "recv_ts": recv_ts,
                "inference_ts": inference_ts,
                "detections": [
                    {
                        "label": results.names[int(cls)],
                        "score": float(conf),
                        "xmin": float(box[0] / frame.width),
                        "ymin": float(box[1] / frame.height),
                        "xmax": float(box[2] / frame.width),
                        "ymax": float(box[3] / frame.height)
                    }
                    for *box, conf, cls in results.xyxy[0].cpu().numpy()
                ],
            })

            # Save metrics every 30s
            if time.time() - self.bench_start_time >= 30:
                with METRICS_FILE.open("w") as f:
                    json.dump(self.metrics, f, indent=2)
                self.bench_start_time = time.time()
                self.metrics = []

            # Convert back to VideoFrame
            out = av.VideoFrame.from_ndarray(drawn, format="bgr24")
            out.pts = frame.pts
            out.time_base = frame.time_base
            return out

# -------------------- WebRTC offer endpoint --------------------
@app.post("/offer")
async def offer(offer: Offer):
    pc = RTCPeerConnection()
    pcs.append(pc)

    # Audio blackhole
    blackhole = MediaBlackhole()
    await blackhole.start()

    @pc.on("connectionstatechange")
    async def on_conn_state_change():
        print("PC connection state:", pc.connectionState)
        if pc.connectionState in ("failed", "closed", "disconnected"):
            try:
                await blackhole.stop()
            except Exception:
                pass

    @pc.on("track")
    def on_track(track: MediaStreamTrack):
        print("Track received:", track.kind)
        if track.kind == "video":
            processed = YOLOOverlayTrack(track)
            pc.addTrack(processed)
        elif track.kind == "audio":
            blackhole.addTrack(track)

        @track.on("ended")
        async def on_ended():
            print("Track ended:", track.kind)

    await pc.setRemoteDescription(RTCSessionDescription(sdp=offer.sdp, type=offer.type))
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

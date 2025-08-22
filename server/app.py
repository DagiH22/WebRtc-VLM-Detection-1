import os
import json
import time
import asyncio
from typing import List, Optional

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

# -------------------- Load YOLO once --------------------
# Using ultralytics/yolov5 via torch.hub (same as you had), small model for speed
# If you have yolov5n.pt locally, point to it with `path="yolov5n.pt"`
print("Loading YOLOv5 model...")
_yolo_model = torch.hub.load("ultralytics/yolov5", "custom", path="yolov5n.pt", force_reload=False)
_yolo_model.eval()
print("YOLOv5 model loaded.")

# -------------------- Web server --------------------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # dev-friendly; tighten in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Offer(BaseModel):
    sdp: str
    type: str

pcs: List[RTCPeerConnection] = []


class YOLOOverlayTrack(MediaStreamTrack):
    kind = "video"

    def __init__(self, source_track: MediaStreamTrack, target_fps: float = 15.0):
        super().__init__()
        self.track = source_track
        self.frame_id = 0
        self.target_fps = target_fps
        self._last_send_time = 0.0

    async def recv(self) -> av.VideoFrame:
        while True:
            frame: av.VideoFrame = await self.track.recv()
            now = time.time()
            interval = 1.0 / self.target_fps

            # Only process/send if enough time has passed
            if now - self._last_send_time < interval:
                continue  # drop this frame completely (never processed or sent)

            self.frame_id += 1
            self._last_send_time = now

            # Convert to ndarray for YOLO
            img_bgr = frame.to_ndarray(format="bgr24")

            # Run YOLO overlay only on selected frames
            results = _yolo_model(img_bgr)
            drawn = results.render()[0]

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

    # Audio blackhole to avoid warnings
    blackhole = MediaBlackhole()
    await blackhole.start()

    # Diagnostics
    @pc.on("connectionstatechange")
    async def on_conn_state_change():
        print("PC connection state:", pc.connectionState)
        if pc.connectionState in ("failed", "closed", "disconnected"):
            try:
                await blackhole.stop()
            except Exception:
                pass

    # Track handling: when we receive a video track from the host,
    # wrap it with YOLOOverlayTrack and send the processed track back.
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

    # Set remote description & generate answer
    await pc.setRemoteDescription(RTCSessionDescription(sdp=offer.sdp, type=offer.type))
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}


if __name__ == "__main__":
    # Run on all interfaces for local LAN testing if needed
    uvicorn.run(app, host="0.0.0.0", port=8000)

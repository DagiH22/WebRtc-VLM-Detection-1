# Real-time WebRTC VLM — Multi-Object Detection Demo

A reproducible demo performing **real-time multi-object detection** from a phone camera to a PC browser using **WebRTC**. Mobile camera video is streamed to the PC, processed on a server (or in-browser WASM), and bounding boxes + labels are overlayed in near real-time. Metrics are collected to evaluate latency, FPS, and bandwidth.  

---

## Features

- Phone → Browser live streaming via WebRTC (no app required, just browser).
- YOLOv5n-based object detection (lightweight, low-resource).
- Server-side processing with real-time overlay.
- Metrics collection (`metrics.json`) including:
  - Median & P95 E2E latency
  - Processed FPS
  - Network uplink/downlink (kbps)
- Simple QR / short URL join for phone.
- Dockerized for reproducible local deployment.
- `start.sh` script with mode-switch: `MODE=server` (current) or `MODE=wasm` (future).

---

## Design Choices

### Model

- **YOLOv5n** selected for its **lightweight** architecture.
- Low-resource friendly: can run on a modest CPU laptop (Intel i5, 8GB RAM).
- Provides sufficient accuracy for near-real-time detection.

### Code Structure

- **Frontend (React + TypeScript)**: host & join pages, video overlays, QR links, WEBRTC.
- **Backend (Python + FastAPI + aiortc)**: YOLO inference, metrics.
- **Metrics**: stored in `metrics.json` every 30s for benchmarking.
- **Frame Limiting**: limits processed FPS to ~15 to reduce CPU load.
- **WebRTC**: separate peer connections for mobile → host and host → backend.
- **Data Channel**: detection results sent per frame as JSON for overlay alignment.

### Low-Resource Strategy

- Frame thinning via **fixed FPS and latest-frame processing**.
- Downscale input to reduce computation (server can use `640x480` or smaller).
- WASM inference mode planned for future in-browser processing.

---

## Requirements

- **Phone**: Chrome (Android) or Safari (iOS). No app required.
- **Laptop / Server**:
  - Docker & Docker Compose (recommended)
  - Node.js >= 16
  - Python 3.9+ (server-mode)
  - Optional: ngrok/localtunnel for phone connectivity behind NAT

---

## Quick Start (Server Mode)

1. Clone repo:  
   ```bash
   git clone https://github.com/DagiH22/WebRtc-VLM-Detection-1[]
   cd WebRtc-VLM-Detection-1
   ```
2. Start locally:
   ```bash
   ./start.sh   #for linux / macos
   start.bat    #for windows
   ```
3. Open host page:
    -Open host page by clicking 
    Network: https://192.168.x.x:5173/ or similar LAN ip
4. Scan QR with phone, allow camera access. You should see:
    -Mobile video mirrored on PC
    -YOLO overlays in near real-time

## Metrics JSON Format

Each frame produces a JSON message saved in metrics.json inside ./server:
{
  "frame_id": 123,
  "capture_ts": 1690000000000,
  "recv_ts": 1690000000100,
  "inference_ts": 1690000000120,
  "detections": [
    { "label": "person", "score": 0.93, "xmin": 0.12, "ymin": 0.08, "xmax": 0.34, "ymax": 0.67 }
  ]
}
    -Coordinates normalized [0..1] for overlay alignment across resolutions.
    -frame_id and capture_ts used to compute end-to-end latency.
    -Metrics include median & P95 latency, FPS, and network bandwidth.

## Troubleshooting
Phone won’t connect → ensure same network or use ngrok/localtunnel.
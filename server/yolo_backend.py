import torch
import numpy as np

# Load YOLOv5 detection model
model = torch.hub.load("ultralytics/yolov5", "custom", path="yolov5n.pt", force_reload=True)

def run_yolo_seg(img_bgr: np.ndarray):
    """
    Run YOLOv5n detection on a single frame (BGR numpy array).
    Returns JSON-serializable detections.
    """
    results = model(img_bgr)

    detections = []
    for *box, conf, cls in results.xyxy[0].cpu().numpy():
        detections.append({
            "x1": float(box[0]),
            "y1": float(box[1]),
            "x2": float(box[2]),
            "y2": float(box[3]),
            "confidence": float(conf),
            "class": int(cls),
            "label": results.names[int(cls)]
        })
    return detections
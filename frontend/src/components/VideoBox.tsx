import { useEffect, useRef } from "react";

interface Detection {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  score: number;
}

interface Props {
  stream?: MediaStream;
  label?: string;
  detections?: Detection[];
  mirrored?: boolean;
}

export default function VideoBox({ stream, label, detections = [], mirrored }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Attach stream to video
  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl && stream) {
      videoEl.srcObject = stream;
      videoEl.muted = true; // <-- important for autoplay
      videoEl.onloadedmetadata = () => {
        videoEl.play().catch(() => console.log("Failed to autoplay video"));
      };
    }
  }, [stream]);

  // Draw bounding boxes
  useEffect(() => {
    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;
    if (!videoEl || !canvasEl) return;

    canvasEl.width = videoEl.videoWidth || 640;
    canvasEl.height = videoEl.videoHeight || 480;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    detections.forEach((d) => {
      ctx.strokeStyle = "red";
      ctx.lineWidth = 2;
      ctx.strokeRect(d.x, d.y, d.width, d.height);

      ctx.fillStyle = "red";
      ctx.font = "16px Arial";
      ctx.fillText(`${d.label} (${(d.score * 100).toFixed(0)}%)`, d.x, d.y - 5);
    });
  }, [detections]);

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoRef}
        className={`rounded-lg w-full h-full object-cover ${mirrored ? "scale-x-[-1]" : ""}`}
        playsInline
      />
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 pointer-events-none"
        style={{ width: "100%", height: "100%" }}
      />
      {label && (
        <div className="absolute bottom-0 left-0 p-1 text-white bg-black bg-opacity-50">
          {label}
        </div>
      )}
    </div>
  );
}

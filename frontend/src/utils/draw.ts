export type BBox = { x: number; y: number; w: number; h: number }
export type Detection = { id: number; label: string; conf: number; bbox: BBox }

export function drawDetections(
  ctx: CanvasRenderingContext2D,
  detections: Detection[]
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.lineWidth = 2;
  ctx.font = "14px sans-serif";

  detections.forEach((d) => {
    const { x, y, w, h } = d.bbox;
    ctx.strokeStyle = "#00ff00";
    ctx.strokeRect(x, y, w, h);

    const label = `${d.label} ${(d.conf * 100).toFixed(1)}%`;
    const tw = ctx.measureText(label).width + 8;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x, y - 18, tw, 18);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x + 4, y - 5);
  });
}

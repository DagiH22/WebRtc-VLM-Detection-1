import * as ort from "onnxruntime-web";

let session: ort.InferenceSession;

export async function loadModel() {
  session = await ort.InferenceSession.create("/models/yolov5n.onnx", {
    executionProviders: ["wasm"], // or "webgl"
  });
}

export async function runInference(tensor: ort.Tensor) {
  if (!session) throw new Error("Model not loaded");
  const results = await session.run({ images: tensor });
  return results;
}

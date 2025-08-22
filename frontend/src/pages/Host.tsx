import { useEffect, useRef, useState } from "react";
import VideoBox from "../components/VideoBox";
import QR from "../components/QR";
import { createRoom, STUN_SERVERS } from "../signaling.ts";
import { connectToBackend } from "../utils/webrtc.ts";
import { Button } from "../ui/button";
import { Copy } from "lucide-react";

// ----------------- Frame limiter helper -----------------
function createFrameLimitedTrack(stream: MediaStream, targetFps: number = 15): MediaStreamTrack {
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.play().catch(() => {});

  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d")!;

  const outputStream = canvas.captureStream(targetFps);
  const [track] = outputStream.getVideoTracks();

  function drawFrame() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    requestAnimationFrame(drawFrame);
  }
  drawFrame();

  return track;
}

// ----------------- Host component -----------------
export default function Host() {
  const [remoteStream, setRemoteStream] = useState<MediaStream>();
  const [processedStream, setProcessedStream] = useState<MediaStream>();
  const [roomId, setRoomId] = useState<string>("");

  const pcMobileRef = useRef<RTCPeerConnection | null>(null);
  const pcBackendRef = useRef<RTCPeerConnection | null>(null);
  const backendConnectedRef = useRef(false);

  // Metrics buffer
  const metricsBuffer: any[] = [];
  (window as any).metricsBuffer = metricsBuffer;

  // ----- 1) Host <-> Mobile -----
  useEffect(() => {
    const pcMobile = new RTCPeerConnection(STUN_SERVERS);
    pcMobileRef.current = pcMobile;

    pcMobile.addEventListener("track", (e) => {
      if (e.streams && e.streams[0]) {
        setRemoteStream(e.streams[0]);
      }
    });

    (async () => {
      const { roomId } = await createRoom(pcMobile);
      console.log("🆔 Room created:", roomId);
      setRoomId(roomId);
    })();

    return () => {
      pcMobile.close();
    };
  }, []);

  // ----- 2) Host <-> Backend with frame-limiting -----
  useEffect(() => {
    if (!remoteStream || backendConnectedRef.current) return;

    const pcBackend = new RTCPeerConnection(STUN_SERVERS);
    pcBackendRef.current = pcBackend;

    const limitedTrack = createFrameLimitedTrack(remoteStream, 15);
    pcBackend.addTrack(limitedTrack);

    pcBackend.addTransceiver("video", { direction: "sendrecv" });

    pcBackend.ontrack = (event) => {
      const stream = event.streams && event.streams[0];
      if (stream) {
        console.log("✅ Received processed stream from backend");
        setProcessedStream(stream);
      }
    };

    backendConnectedRef.current = true;
    connectToBackend(pcBackend, (raw: any) => {
      try {
        const data = typeof raw === "string" ? JSON.parse(raw) : raw;
        const displayTs = Date.now();
        metricsBuffer.push({
          frame_id: data.frame_id,
          capture_ts: data.capture_ts,
          recv_ts: data.recv_ts,
          inference_ts: data.inference_ts,
          overlay_display_ts: displayTs,
        });
      } catch (err) {
        console.error("Failed to parse backend data:", err);
      }
    }).catch((err) => {
      console.error("connectToBackend error:", err);
      backendConnectedRef.current = false;
    });

    return () => {
      pcBackendRef.current?.close();
      pcBackendRef.current = null;
      backendConnectedRef.current = false;
    };
  }, [remoteStream]);

  const joinUrl = roomId ? `${location.origin}/join/${roomId}` : "";

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900 p-6">
      <header className="w-full text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">PC Host</h1>
        <p className="text-sm text-muted-foreground">
          Receive your mobile camera feed and view backend-processed detections
        </p>
      </header>

      <main className="flex flex-1 w-full max-w-6xl mx-auto gap-8 items-start">
        <div className="flex flex-col justify-center gap-6 flex-[2]">
          {roomId && (
            <>
              <p className="text-sm text-muted-foreground">Share this link with your phone:</p>
              <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-2">
                <a
                  href={joinUrl}
                  className="text-blue-600 dark:text-blue-400 underline break-all text-sm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {joinUrl}
                </a>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => navigator.clipboard.writeText(joinUrl)}
                  title="Copy link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow self-start">
                <QR value={joinUrl} />
              </div>
            </>
          )}
        </div>

        <div className="flex-[1] flex justify-center items-center relative w-full">
          <VideoBox
            stream={processedStream ?? remoteStream}
            label={processedStream ? "Processed (Backend YOLO)" : "Mobile Stream (raw)"}
          />
        </div>
      </main>
    </div>
  );
}

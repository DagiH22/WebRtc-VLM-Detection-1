import { useEffect, useRef, useState } from "react";
import { joinRoom, STUN_SERVERS } from "../signaling";
import VideoBox from "../components/VideoBox";
import { useParams } from "react-router-dom";

export default function Join() {
  const { roomId } = useParams<{ roomId: string }>();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!roomId) return;

    let pc: RTCPeerConnection | null = null;

    (async () => {
      try {
        // 1) Get media first
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: true,
        });
        setLocalStream(stream);
        localStreamRef.current = stream;

        // 2) Create PC
        pc = new RTCPeerConnection(STUN_SERVERS);
        pcRef.current = pc;

        // 3) Add tracks
        stream.getTracks().forEach((track) => {
          if (pc && pc.signalingState !== "closed") {
            pc.addTrack(track, stream);
          }
        });

        // 4) Join signaling room
        await joinRoom(roomId, pc);
      } catch (err: unknown) {
        console.error("Failed to get media:", err);
        setError(
          "Cannot access camera/microphone. Make sure your browser allows access and you're using HTTPS or localhost."
        );
      }
    })();

    return () => {
      if (pc && pc.signalingState !== "closed") {
        pc.close();
      }
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [roomId]);

  return (
    <div className="min-h-screen flex flex-col items-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Mobile — Send Camera to PC</h1>
      {error && <p className="text-red-600">{error}</p>}
      {!error && <p className="text-sm opacity-70">If asked, allow camera and microphone.</p>}
      <VideoBox stream={localStream} mirrored label="Your preview" />
    </div>
  );
}

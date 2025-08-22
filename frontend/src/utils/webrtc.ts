// Connect the given RTCPeerConnection to the Python backend
export async function connectToBackend(
  pc: RTCPeerConnection, // <-- use existing PC
  onDetections?: (detections: any) => void
) {
  console.log("🚀 Connecting backend...");

  // Listen for backend-created data channel
  pc.ondatachannel = (event) => {
    const channel = event.channel;
    if (channel.label === "detections") {
      channel.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (onDetections && data.detections) {
            const mapped = data.detections.map((d: any) => ({
              x: d.x1,
              y: d.y1,
              width: d.x2 - d.x1,
              height: d.y2 - d.y1,
              label: d.label,
              score: d.confidence,
            }));
            onDetections(mapped);
          }
        } catch {
          console.log("📩 Raw message from backend:", msg.data);
        }
      };
    }
  };

  // WebRTC handshake with backend
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const res = await fetch("http://localhost:8000/offer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sdp: offer.sdp, type: offer.type }),
  });

  const answer = await res.json();
  await pc.setRemoteDescription(new RTCSessionDescription(answer));

  console.log("✅ Backend connected (data channel ready)");
}

import {
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  addDoc,
  serverTimestamp,
  // Firestore,
} from "firebase/firestore";
import { db } from "./firebase"; // make sure db = getFirestore(app)
import { Timestamp } from "firebase/firestore";
interface RoomData {
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  createdAt?: Timestamp; // Firebase timestamp (can use Firestore.Timestamp if imported)
}

export const STUN_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
};

// Utility to clean ICE candidates for Firestore
function cleanCandidate(candidate: RTCIceCandidateInit) {
  return {
    candidate: candidate.candidate ?? "",
    sdpMid: candidate.sdpMid ?? "",
    sdpMLineIndex: candidate.sdpMLineIndex ?? 0,
    usernameFragment: candidate.usernameFragment ?? "",
  };
}


export type RoomRefs = {
  roomRef: ReturnType<typeof doc>;
  offerCandidates: ReturnType<typeof collection>;
  answerCandidates: ReturnType<typeof collection>;
};

// Returns references for an existing room
export function roomRefs(roomId: string): RoomRefs {
  const roomRef = doc(db, "rooms", roomId);
  const offerCandidates = collection(roomRef, "offerCandidates");
  const answerCandidates = collection(roomRef, "answerCandidates");
  return { roomRef, offerCandidates, answerCandidates };
}

export async function createRoom(pc: RTCPeerConnection) {
  const roomsCol = collection(db, "rooms");
  const roomDoc = doc(roomsCol); // auto-ID
  const roomId = roomDoc.id;

  // const offerCandidates = collection(roomDoc, "offerCandidates");

  const offerCandidates = collection(roomDoc, "offerCandidates");
const answerCandidates = collection(roomDoc, "answerCandidates");

// Host ICE candidates
pc.addEventListener("icecandidate", async (e) => {
  if (!e.candidate) return;
  try {
    // ❌ currently writes to answerCandidates
    // ✅ must write to offerCandidates
    await addDoc(offerCandidates, cleanCandidate(e.candidate.toJSON()));
  } catch (err) {
    console.error("Failed to add ICE candidate:", err, e.candidate);
  }
});


  

  // Create offer
  const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
  await pc.setLocalDescription(offer);

  // Save offer in Firestore
  await setDoc(roomDoc, { offer: { type: offer.type, sdp: offer.sdp }, createdAt: serverTimestamp() });

// ------------------- queue for remote ICE candidates -------------------
const pendingCandidates: RTCIceCandidateInit[] = [];
let remoteDescSet = false;


const unsubAnswer = onSnapshot(roomDoc, async (snap) => {
  const data = snap.data();
  if (!data) return;

  // ONLY set remote description once
  if (!remoteDescSet && data.answer) {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      remoteDescSet = true; // mark as set
    } catch (err) {
      console.warn("Failed to set remote description:", err);
    }

    // flush any queued ICE candidates
    for (const c of pendingCandidates) {
      await pc.addIceCandidate(new RTCIceCandidate(c));
    }
    pendingCandidates.length = 0;
  }
});


const unsubCandidates = onSnapshot(answerCandidates, (snap) => {
  snap.docChanges().forEach((change) => {
    if (change.type === "added") {
      const candidate = change.doc.data() as RTCIceCandidateInit;
      if (remoteDescSet) {
        pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        pendingCandidates.push(candidate); // queue until remote desc ready
      }
    }
  });
});

  return { roomId, cleanup: () => { unsubAnswer(); unsubCandidates(); } };
}

export async function joinRoom(roomId: string, pc: RTCPeerConnection) {
  const { roomRef, offerCandidates, answerCandidates } = roomRefs(roomId);

// Mobile ICE candidates
pc.addEventListener("icecandidate", async (e) => {
  if (e.candidate) {
    try {
      // ✅ correct: mobile writes into answerCandidates
      await addDoc(answerCandidates, cleanCandidate(e.candidate.toJSON()));
    } catch (err) {
      console.error("Failed to add mobile ICE candidate:", err, e.candidate);
    }
  }
});



  // Get room data
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) throw new Error("Room does not exist.");
  const roomData = roomSnap.data() as RoomData;

  const offer = roomData.offer;
  if (!offer) throw new Error("Room has no offer yet.");
  await pc.setRemoteDescription(new RTCSessionDescription(offer));

  // Create answer
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await setDoc(roomRef, { answer: { type: answer.type, sdp: answer.sdp } }, { merge: true });

  // Listen for host ICE candidates
  const unsub = onSnapshot(offerCandidates, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === "added") {
        pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
      }
    });
  });

  return { cleanup: () => unsub() };
}

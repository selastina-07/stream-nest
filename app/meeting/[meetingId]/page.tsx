"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";

type Peer = { id: string; stream: MediaStream; name: string };
type ChatMessage = { id: string; sender: string; text: string; mine?: boolean };
type Signal = { from: string; offer?: RTCSessionDescriptionInit; answer?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

const ICE_SERVERS: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }] };

function Icon({ name }: { name: "mic" | "camera" | "screen" | "chat" | "phone" | "copy" }) {
  const paths: Record<string, string> = {
    mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Zm6 10a6 6 0 0 1-12 0M12 19v3m-4 0h8",
    camera: "m15 10 5-3v10l-5-3M3 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z",
    screen: "M3 4h18v13H3zM8 21h8m-4-4v4",
    chat: "M20 11.5a7.5 7.5 0 0 1-8 7.5 8.3 8.3 0 0 1-3-.5L4 20l1.5-4A7.5 7.5 0 1 1 20 11.5Z",
    phone: "M5 4h3l2 5-2 1.5a12 12 0 0 0 5.5 5.5L15 14l5 2v3a2 2 0 0 1-2 2C10 21 3 14 3 6a2 2 0 0 1 2-2Z",
    copy: "M8 8h11v13H8zM5 16H3V3h13v2",
  };
  return <svg viewBox="0 0 24 24" className="icon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

function VideoCard({ stream, name, local, muted }: { stream: MediaStream | null; name: string; local?: boolean; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream; }, [stream]);
  return <div className={`video-card ${local ? "video-local" : ""}`}>
    {stream ? <video ref={ref} autoPlay playsInline muted={muted} /> : <div className="video-placeholder"><div>{name.slice(0, 2).toUpperCase()}</div></div>}
    <span className="video-name">{name}{local ? " (You)" : ""}</span>
    {local && <span className="video-badge">You</span>}
  </div>;
}

export default function MeetingRoom() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const router = useRouter();
  const [stage, setStage] = useState<"prejoin" | "room">("prejoin");
  const [name, setName] = useState("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [connection, setConnection] = useState("Connecting");
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const streamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);

  const displayName = useMemo(() => name.trim() || "Guest", [name]);
  const stopStream = useCallback(() => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; setLocalStream(null); }, []);

  async function prepareMedia() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      streamRef.current = stream; cameraTrackRef.current = stream.getVideoTracks()[0] ?? null; setLocalStream(stream); setMicOn(true); setCameraOn(true);
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream; setLocalStream(stream); setCameraOn(false);
      } catch {
        setLocalStream(null); setCameraOn(false); setMicOn(false);
      }
    }
  }

  async function enterRoom() {
    setStage("room");
    const socket = io(process.env.NEXT_PUBLIC_SIGNALING_URL || undefined, { autoConnect: true, transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => { setConnection("Connected"); socket.emit("join-room", { roomId: meetingId, name: displayName }); });
    socket.on("disconnect", () => setConnection("Reconnecting"));
    socket.on("connect_error", () => setConnection("Offline preview"));
    socket.on("user-joined", async ({ id, name: remoteName }: { id: string; name: string }) => {
      const pc = makePeer(id, remoteName);
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer); socket.emit("offer", { to: id, offer });
    });
    socket.on("offer", async ({ from, offer, name: remoteName }: Signal & { name?: string }) => {
      const pc = makePeer(from, remoteName || "Guest"); await pc.setRemoteDescription(offer!); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); socket.emit("answer", { to: from, answer });
    });
    socket.on("answer", async ({ from, answer }: Signal) => { await peersRef.current.get(from)?.setRemoteDescription(answer!); });
    socket.on("ice-candidate", async ({ from, candidate }: Signal) => { if (candidate) await peersRef.current.get(from)?.addIceCandidate(candidate).catch(() => undefined); });
    socket.on("user-left", (id: string) => removePeer(id));
    socket.on("chat-message", (message: ChatMessage) => setChat((current) => [...current, message]));
  }

  function makePeer(id: string, remoteName: string) {
    const existing = peersRef.current.get(id); if (existing) return existing;
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current.set(id, pc);
    streamRef.current?.getTracks().forEach((track) => pc.addTrack(track, streamRef.current!));
    pc.onicecandidate = (event) => { if (event.candidate) socketRef.current?.emit("ice-candidate", { to: id, candidate: event.candidate }); };
    pc.ontrack = (event) => { const stream = event.streams[0]; if (!stream) return; setPeers((current) => current.some((peer) => peer.id === id) ? current.map((peer) => peer.id === id ? { ...peer, stream } : peer) : [...current, { id, stream, name: remoteName }]); };
    return pc;
  }

  function removePeer(id: string) { peersRef.current.get(id)?.close(); peersRef.current.delete(id); setPeers((current) => current.filter((peer) => peer.id !== id)); }

  useEffect(() => {
    const peerConnections = peersRef.current;
    const timer = window.setTimeout(() => void prepareMedia(), 0);
    return () => {
      window.clearTimeout(timer);
      peerConnections.forEach((pc) => pc.close());
      socketRef.current?.disconnect();
      stopStream();
    };
  }, [stopStream]);

  function toggleMic() { const value = !micOn; streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = value; }); setMicOn(value); }
  function toggleCamera() { const value = !cameraOn; if (cameraTrackRef.current) cameraTrackRef.current.enabled = value; setCameraOn(value); }

  async function toggleShare() {
    if (sharing) { const camera = cameraTrackRef.current; if (camera) peersRef.current.forEach((pc) => pc.getSenders().find((sender) => sender.track?.kind === "video")?.replaceTrack(camera)); screenTrackRef.current?.stop(); setSharing(false); return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); const track = stream.getVideoTracks()[0]; screenTrackRef.current = track;
      peersRef.current.forEach((pc) => pc.getSenders().find((sender) => sender.track?.kind === "video")?.replaceTrack(track)); track.onended = () => { if (sharing) void toggleShare(); }; setSharing(true);
    } catch { setSharing(false); }
  }
  function leave() { peersRef.current.forEach((pc) => pc.close()); socketRef.current?.emit("leave-room", { roomId: meetingId }); socketRef.current?.disconnect(); stopStream(); router.push("/"); }
  function sendChat(event: React.FormEvent) { event.preventDefault(); const text = draft.trim(); if (!text) return; const message = { id: crypto.randomUUID(), sender: displayName, text, mine: true }; setChat((current) => [...current, message]); socketRef.current?.emit("chat-message", { roomId: meetingId, ...message, mine: undefined }); setDraft(""); }

  if (stage === "prejoin") return <main className="meeting-shell prejoin-shell"><div className="meeting-nav"><div className="brand"><span className="brand-mark">✦</span> StreamNest</div><span className="meeting-code">Room / {meetingId}</span></div><section className="prejoin-card"><div className="prejoin-preview"><VideoCard stream={localStream} name={displayName} local muted /></div><div className="prejoin-content"><div className="eyebrow">You&apos;re almost there</div><h1>Ready to join?</h1><p>Check your camera and microphone before entering the room.</p><label>Your name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="How should we call you?" /></label><div className="prejoin-actions"><button className="button button-primary" onClick={enterRoom}>Join meeting <span>→</span></button><button className={`mini-toggle ${micOn ? "active" : ""}`} onClick={toggleMic}><Icon name="mic" /> {micOn ? "Mic on" : "Mic off"}</button><button className={`mini-toggle ${cameraOn ? "active" : ""}`} onClick={toggleCamera}><Icon name="camera" /> {cameraOn ? "Camera on" : "Camera off"}</button></div><small>By joining, you agree to be respectful and kind.</small></div></section></main>;

  return <main className="room-shell"><header className="room-header"><div className="brand"><span className="brand-mark">✦</span> StreamNest</div><div className="room-meta"><span className={`connection ${connection === "Connected" ? "connected" : ""}`}><i /> {connection}</span><span className="meeting-code">Room / {meetingId}</span><button className="copy-code" onClick={() => navigator.clipboard?.writeText(window.location.href)}><Icon name="copy" /> Copy invite</button></div></header><div className="room-body"><section className={`video-stage count-${peers.length + 1}`}><VideoCard stream={localStream} name={displayName} local muted />{peers.map((peer) => <VideoCard key={peer.id} stream={peer.stream} name={peer.name} />)}{peers.length === 0 && <div className="empty-room"><div>✦</div><h2>Waiting for others to join</h2><p>Share the invite link to bring people in.</p></div>}</section>{chatOpen && <aside className="chat-panel"><div className="chat-title"><span>Chat</span><button onClick={() => setChatOpen(false)}>×</button></div><div className="chat-messages">{chat.length === 0 && <p className="chat-empty">Say hello to the room.</p>}{chat.map((message) => <div key={message.id} className={`chat-message ${message.mine ? "mine" : ""}`}><b>{message.sender}</b><span>{message.text}</span></div>)}</div><form className="chat-input" onSubmit={sendChat}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message..." /><button type="submit">↑</button></form></aside>}</div><footer className="control-bar"><div className="control-group"><button className={`control ${micOn ? "" : "off"}`} onClick={toggleMic}><Icon name="mic" /><span>{micOn ? "Mute" : "Unmute"}</span></button><button className={`control ${cameraOn ? "" : "off"}`} onClick={toggleCamera}><Icon name="camera" /><span>{cameraOn ? "Stop video" : "Start video"}</span></button><button className={`control ${sharing ? "selected" : ""}`} onClick={() => void toggleShare()}><Icon name="screen" /><span>{sharing ? "Stop sharing" : "Share screen"}</span></button><button className={`control ${chatOpen ? "selected" : ""}`} onClick={() => setChatOpen((value) => !value)}><Icon name="chat" /><span>Chat{chat.length > 0 ? ` (${chat.length})` : ""}</span></button></div><button className="leave-button" onClick={leave}><Icon name="phone" /> Leave</button></footer></main>;
}

"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

function Sparkle() {
  return <span className="brand-mark" aria-hidden="true">✦</span>;
}

export default function Home() {
  const router = useRouter();
  const [meetingId, setMeetingId] = useState("");
  const [showJoin, setShowJoin] = useState(false);

  function createMeeting() {
    const id = crypto.randomUUID().slice(0, 8).toUpperCase();
    router.push(`/meeting/${id}`);
  }

  function joinMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = meetingId.trim().replace(/[^a-zA-Z0-9-]/g, "");
    if (cleaned) router.push(`/meeting/${cleaned}`);
  }

  return (
    <main className="landing-shell">
      <nav className="topbar">
        <div className="brand"><Sparkle /> StreamNest</div>
        <div className="nav-note"><span className="status-dot" /> Private by design</div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Video calls, reimagined</div>
          <h1>Meet like you&apos;re<br /><em>in the same room.</em></h1>
          <p className="hero-description">
            Simple, beautifully focused video calls for the moments that matter.
            No downloads, no accounts, just a link.
          </p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={createMeeting}>
              Start a new meeting <span>→</span>
            </button>
            <button className="button button-secondary" onClick={() => setShowJoin((value) => !value)}>
              Join with a code
            </button>
          </div>
          {showJoin && (
            <form className="join-form" onSubmit={joinMeeting}>
              <input
                autoFocus
                value={meetingId}
                onChange={(event) => setMeetingId(event.target.value)}
                placeholder="Paste meeting code"
                aria-label="Meeting code"
              />
              <button className="button button-dark" type="submit">Join</button>
            </form>
          )}
          <div className="trust-row"><span>●</span> End-to-end peer connections <span>●</span> Works in your browser</div>
        </div>

        <div className="hero-visual" aria-label="StreamNest video call preview">
          <div className="orb orb-one" /><div className="orb orb-two" />
          <div className="preview-window">
            <div className="preview-top"><span className="preview-live"><i /> Live now</span><span>09:41</span></div>
            <div className="preview-grid">
              <div className="preview-person person-one"><div className="avatar">AB</div><span>Alex</span></div>
              <div className="preview-person person-two"><div className="avatar avatar-coral">JM</div><span>Jamie</span></div>
              <div className="preview-person person-three"><div className="avatar avatar-gold">SK</div><span>Sky</span></div>
              <div className="preview-person person-four"><div className="avatar avatar-lilac">MR</div><span>Morgan</span></div>
            </div>
            <div className="preview-controls"><span>◉</span><span>⌁</span><b>●</b><span>▣</span><span>•••</span></div>
          </div>
          <div className="floating-note note-top"><span>✦</span> crystal clear audio</div>
          <div className="floating-note note-bottom">4 people are here <span>→</span></div>
        </div>
      </section>

      <section className="feature-strip">
        <div><strong>01</strong><span><b>Just send a link</b><small>People join in one click</small></span></div>
        <div><strong>02</strong><span><b>Feel present</b><small>Rich video, low-latency audio</small></span></div>
        <div><strong>03</strong><span><b>Stay in control</b><small>Your privacy comes first</small></span></div>
      </section>
    </main>
  );
}

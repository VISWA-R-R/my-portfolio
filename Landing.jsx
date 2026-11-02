import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DuskBackdrop from "./Backdrop";
import { characters } from "./characters";
import "./landing.css";

const pickVideoQuality = () => {
  if (typeof window === "undefined") return "1080";
  const pixelWidth = window.screen.width * (window.devicePixelRatio || 1);
  const saveData = navigator.connection?.saveData;
  return !saveData && pixelWidth >= 2560 ? "2160" : "1080";
};

function CharacterMedia({ character, active, quality }) {
  const [videoState, setVideoState] = useState("idle");
  return (
    <div className="char-media">
      <img src={character.image} alt={character.name} loading="lazy" decoding="async" />
      {active && videoState !== "failed" && (
        <video
          className={videoState === "ready" ? "is-ready" : ""}
          src={`${character.video}-${quality}.mp4`}
          poster={character.image}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onLoadedData={() => setVideoState("ready")}
          onError={() => setVideoState("failed")}
        />
      )}
    </div>
  );
}

export default function Landing({ onStart }) {
  const [selectedId, setSelectedId] = useState(characters[0].id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const rootRef = useRef(null);
  const quality = useMemo(() => pickVideoQuality(), []);
  const selected = characters.find((character) => character.id === selectedId) || characters[0];

  const handleLaunch = useCallback(() => {
    if (isLaunching) return;
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      onStart(selected);
      return;
    }

    setIsLaunching(true);
    setTimeout(() => {
      onStart(selected);
    }, 380);
  }, [isLaunching, onStart, selected]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Enter" || event.repeat) return;
      if (
        event.target instanceof HTMLButtonElement ||
        event.target instanceof HTMLAnchorElement ||
        event.target instanceof HTMLInputElement
      ) {
        return;
      }
      handleLaunch();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleLaunch]);

  const handlePointerMove = (event) => {
    const root = rootRef.current;
    if (!root) return;
    root.style.setProperty("--mx", ((event.clientX / window.innerWidth) * 2 - 1).toFixed(3));
    root.style.setProperty("--my", ((event.clientY / window.innerHeight) * 2 - 1).toFixed(3));
  };

  const handleRadioKeys = (event) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
    if (!step) return;
    event.preventDefault();
    const index = characters.findIndex((character) => character.id === selectedId);
    const next = characters[(index + step + characters.length) % characters.length];
    setSelectedId(next.id);
    requestAnimationFrame(() =>
      rootRef.current?.querySelector(`[data-character="${next.id}"]`)?.focus()
    );
  };

  return (
    <div
      ref={rootRef}
      className={`landing ${isLaunching ? "is-launching" : ""}`}
      style={{ "--accent": selected.accent }}
      onPointerMove={handlePointerMove}
    >
      <DuskBackdrop variant="welcome" />

      {/* Cinematic Vignette Framing */}
      <div className="cinematic-vignette" aria-hidden="true" />

      {/* Top HUD Navigation Bar */}
      <header className="landing-top">
        <div className="brand-group">
          <span className="landing-mark" aria-hidden="true">VC</span>
          <div className="brand-text">
            <span className="brand-title">VISWA R R</span>
            <span className="brand-tag">Java Full Stack Developer</span>
          </div>
        </div>

        <a
          className="classic-link"
          href="https://viswa-portfolio-nine.vercel.app/"
          target="_blank"
          rel="noreferrer"
          aria-label="Open conventional classic portfolio in a new window"
        >
          <span>Classic Portfolio</span>
          <span className="link-arrow" aria-hidden="true">↗</span>
        </a>
      </header>

      {/* Main Cinematic Hero Scene Composition */}
      <main className="landing-main">
        <div className="hero-composition">
          {/* Eyebrow & Category Banner */}
          <div className="hero-kicker">
            <span className="kicker-edition">Interactive 3D Portfolio</span>
            <span className="kicker-sep" aria-hidden="true">/</span>
            <span className="kicker-tagline">Open World Showcase</span>
          </div>

          {/* Bold, Cinematic Title Centerpiece */}
          <h1 className="cinematic-title" aria-label="Viswa City">
            <span className="title-row title-viswa">VISWA</span>
            <span className="title-row title-city">CITY</span>
          </h1>

          {/* Clear Professional Introduction */}
          <div className="hero-bio">
            <div className="bio-nameplate">
              <span className="bio-name">Viswa R R</span>
              <span className="bio-divider" aria-hidden="true">—</span>
              <span className="bio-title">Java Full Stack Developer</span>
            </div>

            <p className="bio-description">
              Welcome to my interactive portfolio. Explore full stack applications, Java & Spring Boot backend services, and modern web interfaces by touring the open-world 3D city. Visit interactive landmarks to inspect my projects, technical skills, education, and experience.
            </p>

            {/* City Landmarks HUD Readout */}
            <div className="landmarks-hud" aria-label="Portfolio landmarks inside the city">
              <span className="hud-label">City Stops:</span>
              <div className="hud-tags">
                <span className="hud-tag">Projects</span>
                <span className="hud-dot" aria-hidden="true">·</span>
                <span className="hud-tag">Skills</span>
                <span className="hud-dot" aria-hidden="true">·</span>
                <span className="hud-tag">Education</span>
                <span className="hud-dot" aria-hidden="true">·</span>
                <span className="hud-tag">Experience</span>
                <span className="hud-dot" aria-hidden="true">·</span>
                <span className="hud-tag">Contact</span>
              </div>
            </div>
          </div>

          {/* Action Hub */}
          <div className="hero-actions">
            <button
              className="enter-city-btn"
              type="button"
              autoFocus
              onClick={handleLaunch}
              disabled={isLaunching}
            >
              <span className="btn-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="6 3 20 12 6 21 6 3" />
                </svg>
              </span>
              <span className="btn-copy">
                <span className="btn-main-label">Enter Viswa City</span>
                <span className="btn-sub-label">Launch 3D Portfolio</span>
              </span>
              <kbd className="btn-kbd" aria-hidden="true">↵ Enter</kbd>
            </button>

            <button
              className={`char-toggle-pill${pickerOpen ? " is-active" : ""}`}
              type="button"
              aria-expanded={pickerOpen}
              aria-controls="character-panel"
              onClick={() => setPickerOpen((open) => !open)}
            >
              <span
                className="char-dot"
                style={{ backgroundColor: selected.accent }}
                aria-hidden="true"
              />
              <span className="char-pill-label">
                Avatar: <strong>{selected.name}</strong>
              </span>
              <span className="char-pill-action">{pickerOpen ? "Close" : "Change"}</span>
            </button>
          </div>

          {/* Concise Controls Guidance */}
          <div className="controls-guidance">
            <span className="guidance-item">
              <kbd>WASD</kbd> or <kbd>Arrow keys</kbd> to navigate
            </span>
            <span className="guidance-sep" aria-hidden="true">·</span>
            <span className="guidance-item">Touch controls on mobile</span>
            <span className="guidance-sep" aria-hidden="true">·</span>
            <span className="guidance-item">Works offline</span>
          </div>
        </div>

        {/* Optional Avatar Selection Drawer */}
        {pickerOpen && (
          <section
            id="character-panel"
            className="avatar-drawer"
            aria-label="Choose avatar profile"
          >
            <div className="drawer-header">
              <div>
                <h3 className="drawer-heading">Choose Avatar Profile</h3>
                <p className="drawer-sub">
                  Each avatar represents a core facet of Viswa’s software engineering skill set
                </p>
              </div>
              <button
                type="button"
                className="drawer-close"
                onClick={() => setPickerOpen(false)}
                aria-label="Close avatar selector"
              >
                ✕ Close
              </button>
            </div>

            <div
              className="character-grid"
              role="radiogroup"
              aria-label="Avatar profiles"
              onKeyDown={handleRadioKeys}
            >
              {characters.map((character) => {
                const active = character.id === selectedId;
                return (
                  <button
                    key={character.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    tabIndex={active ? 0 : -1}
                    data-character={character.id}
                    className={`char-card${active ? " is-active" : ""}`}
                    style={{ "--card-accent": character.accent }}
                    onClick={() => setSelectedId(character.id)}
                  >
                    <CharacterMedia character={character} active={active} quality={quality} />
                    <span className="char-scrim" aria-hidden="true" />

                    {active && (
                      <span className="char-badge" aria-hidden="true">
                        Active
                      </span>
                    )}

                    <div className="char-details">
                      <span className="char-title">{character.name}</span>
                      <span className="char-specialty">{character.role}</span>
                      <p className="char-desc">{character.blurb}</p>
                      <div className="char-tags">
                        {character.stack.map((item) => (
                          <span key={item} className="tag-chip">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* Subtle Cinematic HUD Status Footer */}
      <footer className="landing-footer">
        <div className="footer-status-line">
          <span className="status-indicator" aria-hidden="true" />
          <span className="status-text">
            VISWA CITY 3D · EXPLORE PROJECTS, SKILLS & EXPERIENCE IN BROWSER
          </span>
        </div>
      </footer>

      {/* Cinematic Flash Overlay on Launch */}
      {isLaunching && <div className="cinematic-launch-overlay" aria-hidden="true" />}
    </div>
  );
}

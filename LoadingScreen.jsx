import { useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";
import DuskBackdrop from "./Backdrop";
import { loadingTips } from "./characters";
import "./landing.css";

// The bar never moves backwards, even if the number of tracked assets grows while loading.
function useNeverBackwards(value) {
  const [best, setBest] = useState(0);
  if (value > best) setBest(value);
  return Math.max(best, value);
}

export default function LoadingScreen({ character, status, stage, reveal, onEnter, onRetry, onBack }) {
  const { loaded, total, errors } = useProgress();
  const [slow, setSlow] = useState(false);
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * loadingTips.length));

  const ready = status === "ready";
  const blocked = status === "fallback" || status === "failed";
  const assetFraction = total === 0 ? (stage === "renderer" || ready ? 1 : 0) : Math.min(1, loaded / total);
  // Real stages: assets (60%), renderer created (25%), first 3D frame drawn (15%).
  const target = blocked || ready ? 100 : assetFraction * 60 + (stage === "renderer" || ready ? 25 : 0) + (ready ? 15 : 0);
  const percent = Math.round(useNeverBackwards(target));

  useEffect(() => {
    if (status !== "loading") return undefined;
    const timer = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    const timer = setInterval(() => setTipIndex((index) => (index + 1) % loadingTips.length), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!ready || reveal) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Enter" || event.repeat) return;
      if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) return;
      onEnter();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ready, reveal, onEnter]);

  const stageText = status === "failed" ? "The 3D city could not start on this device."
    : status === "fallback" ? "3D graphics are not available here, so a simplified city view is ready."
      : ready ? "The city is ready."
        : total > 0 && loaded < total ? `Loading city textures · ${loaded} of ${total}`
          : stage === "renderer" ? "Building streets and lighting…" : "Starting the 3D renderer…";
  const textureWarning = errors.length > 0 && !blocked ? " Some optional textures could not load, so roads use plain colours." : "";

  return (
    <div className={`loading-screen${reveal ? " is-reveal" : ""}`} style={{ "--accent": character.accent }} role="dialog" aria-modal="true" aria-label="Entering Viswa City" aria-busy={!ready && !blocked}>
      <DuskBackdrop variant="loading" />
      <div className="loading-body">
        <p className="loading-name">{character.name} · Viswa R R</p>
        <h2>Entering <span>Viswa City</span></h2>
        <p className={`loading-stage${blocked ? " is-error" : ""}`} role="status" aria-live="polite">{stageText}{textureWarning}</p>

        <div className="loading-actions">
          {ready && <button className="enter-button" type="button" autoFocus onClick={onEnter}>Enter the city <kbd>Enter</kbd></button>}
          {blocked && <>
            <button type="button" className="primary" autoFocus onClick={onEnter}>Continue with the simplified city</button>
            <button type="button" onClick={onRetry}>Try 3D again</button>
          </>}
          {!ready && !blocked && slow && <>
            <button type="button" onClick={onRetry}>Retry loading</button>
            <button type="button" onClick={onEnter}>Continue anyway</button>
          </>}
          {(blocked || (slow && !ready)) && <a href="https://viswa-portfolio-nine.vercel.app/" target="_blank" rel="noreferrer">Open the classic portfolio ↗</a>}
          {!reveal && <button type="button" onClick={onBack}>Back to welcome</button>}
        </div>

        {slow && !ready && !blocked && <p className="loading-stage">This is taking longer than usual. You can keep waiting, retry, or continue.</p>}
        <p className="loading-tip">{loadingTips[tipIndex]}</p>
      </div>
      <div className={`loading-bar${blocked ? " is-error" : ""}`} role="progressbar" aria-label="City loading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}>
        <span style={{ transform: `scaleX(${percent / 100})` }} />
        <b aria-hidden="true">{percent}%</b>
      </div>
    </div>
  );
}

import { characters } from "./characters";
import { outfits, vehicleColors, vehicleTypes } from "./looks";

const timeModes = ["DAY", "DUSK", "NIGHT"];
const timeIcons = { DAY: "☀", DUSK: "🌇", NIGHT: "🌙" };
const quickLinks = ["PROJECTS", "GITHUB", "CONTACT"];
const rideMessages = {
  idle: "Docked at Viswa Marina.",
  cruising: "Autopilot is cruising around the island.",
  paused: "Anchored. Press Resume to continue.",
  manual: "You have the helm.",
};
const phaseText = {
  starting: "Getting ready…",
  stopping: "Slowing to a stop beside the building",
  blocked: "Paused: the route is blocked",
  driving: "Driving to the stop",
  viewing: "Parked. Reading the details",
  paused: "Paused. You are driving",
  arrived: "Arrived",
  complete: "Tour complete",
  exited: "Tour ended",
  idle: "Not started",
};


function BlockedCard({ autoTour, onTour, full }) {
  return (
    <div className="sb-warning" role="alert">
      <p><strong>{full ? "Auto tour paused" : "Could not get there"}</strong></p>
      <p>{autoTour.issue}</p>
      <p>You are driving now. Choose what to do next:</p>
      <div className="sb-row sb-wrap">
        <button type="button" className="sb-primary" onClick={() => onTour("retry")}>Retry</button>
        {full && <button type="button" onClick={() => onTour("skip")}>Skip stop</button>}
        <button type="button" onClick={() => onTour("exit")}>{full ? "Exit tour" : "Cancel"}</button>
      </div>
    </div>
  );
}

function Section({ id, title, summary, open, onToggle, children }) {
  return (
    <section className={`sb-section${open ? " is-open" : ""}`}>
      <h2>
        <button type="button" className="sb-section-head" aria-expanded={open} aria-controls={`sb-${id}`} onClick={() => onToggle(id)}>
          <span className="sb-section-title">{title}</span>
          <span className="sb-section-summary">{summary}</span>
          <span className="sb-chevron" aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
      </h2>
      {open && <div className="sb-section-body" id={`sb-${id}`}>{children}</div>}
    </section>
  );
}

export default function Sidebar({
  open, onToggle, openSections, onToggleSection, scene3d,
  character, onCharacter, outfitId, onOutfit, vehicleMode, onVehicle, vehicleColorId, onVehicleColor,
  isDriving, places, visited, nearbyPlace, onOpenInfo,
  onVisit, visitState, onReturnToCity, autoTour, onTour,
  rideState, onRide, timeOfDay, onTime, calm, onCalm, movementMode, onMovement, onReset, keyHelp,
}) {
  const outfit = outfits.find((item) => item.id === outfitId) ?? outfits[0];
  const color = vehicleColors.find((item) => item.id === vehicleColorId) ?? vehicleColors[0];
  const onFootOnly = isDriving ? "Get out of the vehicle (press F) to change this." : "";
  const tourBusy = autoTour.active && !autoTour.paused;
  const vehicleLocked = isDriving || tourBusy;
  const tourIsFull = autoTour.kind === "tour";
  const tourLabel = autoTour.active && tourIsFull ? `Stop ${autoTour.index + 1} of ${autoTour.total}` : autoTour.phase === "complete" && tourIsFull ? "Complete" : "Not started";
  const nextStop = tourIsFull && autoTour.active && autoTour.index < autoTour.total - 1 ? places[autoTour.index + 1]?.label : "";
  const progress = tourIsFull ? Math.round((((autoTour.phase === "complete" ? autoTour.total : autoTour.index + (autoTour.phase === "viewing" ? 1 : 0)) / autoTour.total) || 0) * 100) : 0;
  const modeLabel = tourBusy ? "AUTOPILOT" : "MANUAL";
  const blocked = autoTour.active && autoTour.phase === "blocked";
  const destinationLabel = blocked ? `Route blocked: ${autoTour.label}` : autoTour.active ? autoTour.label : visitState.arrived ? `Arrived: ${visitState.arrived}` : "Free roam";

  return (
    <>
      <button type="button" className="menu-toggle" aria-expanded={open} aria-controls="city-sidebar" onClick={onToggle}>
        <span aria-hidden="true">{open ? "✕" : "☰"}</span> {open ? "Close menu" : "Menu"}
      </button>
      {open && <button type="button" className="sb-scrim" aria-label="Close menu" tabIndex={-1} onClick={onToggle} />}
      <aside id="city-sidebar" className={`sidebar${open ? " is-open" : ""}`} aria-label="Portfolio controls" inert={!open}>
        <header className="sb-header">
          <img src="/viswa-avatar.png" alt="Stylized game avatar based on Viswa's GitHub profile photo" width="56" height="56" />
          <div>
            <p className="sb-name">Viswa R R</p>
            <p className="sb-role">Java Full Stack Developer</p>
          </div>
        </header>

        <div className="sb-status" role="status" aria-live="polite">
          <span className={`sb-mode ${tourBusy ? "is-auto" : "is-manual"}`}>{modeLabel}</span>
          <span className="sb-status-text">{destinationLabel}</span>
          {nearbyPlace && !autoTour.active && <button type="button" className="sb-link" onClick={() => onOpenInfo(nearbyPlace)}>Open {nearbyPlace.toLowerCase()} info</button>}
        </div>

        <Section id="character" title="Character" summary={character.name} open={openSections.includes("character")} onToggle={onToggleSection}>
          <div className="sb-options" role="group" aria-label="Character">
            {characters.map((item) => (
              <button key={item.id} type="button" className="sb-option" style={{ "--swatch": item.accent }} aria-pressed={item.id === character.id} disabled={isDriving} onClick={() => onCharacter(item)}>
                <span className="sb-dot" aria-hidden="true" />
                <span><strong>{item.name}</strong><small>{item.role}</small></span>
                {item.id === character.id && <span className="sb-active-tag">Active</span>}
              </button>
            ))}
          </div>
          {onFootOnly && <p className="sb-note">{onFootOnly}</p>}
        </Section>

        <Section id="outfit" title="Outfit" summary={outfit.name} open={openSections.includes("outfit")} onToggle={onToggleSection}>
          <div className="sb-options" role="group" aria-label="Outfit">
            {outfits.map((item) => (
              <button key={item.id} type="button" className="sb-option" style={{ "--swatch": item.jacket }} aria-pressed={item.id === outfit.id} disabled={isDriving} onClick={() => onOutfit(item.id)}>
                <span className="sb-dot" aria-hidden="true" />
                <span><strong>{item.name}</strong><small>{item.note}</small></span>
                {item.id === outfit.id && <span className="sb-active-tag">Active</span>}
              </button>
            ))}
          </div>
          {onFootOnly && <p className="sb-note">Outfits can only be changed on foot. {onFootOnly}</p>}
        </Section>

        <Section id="vehicle" title="Vehicle" summary={`${vehicleTypes.find((item) => item.id === vehicleMode)?.name} · ${color.name}`} open={openSections.includes("vehicle")} onToggle={onToggleSection}>
          <div className="sb-segment" role="group" aria-label="Vehicle type">
            {vehicleTypes.map((item) => (
              <button key={item.id} type="button" aria-pressed={vehicleMode === item.id} disabled={vehicleLocked && vehicleMode !== item.id} onClick={() => onVehicle(item.id)}>
                <span aria-hidden="true">{item.icon}</span> {item.name}
              </button>
            ))}
          </div>
          {vehicleLocked && <p className="sb-note">{tourBusy ? "Autopilot is driving. Pause or exit the tour to change vehicle." : "Get out of the vehicle (press F) to change vehicle type."}</p>}
          <p className="sb-label">Colour · {color.name}</p>
          <div className="sb-swatches" role="group" aria-label="Vehicle colour">
            {vehicleColors.map((item) => (
              <button key={item.id} type="button" className="sb-swatch" style={{ background: item.swatch }} aria-label={item.name} title={item.name} aria-pressed={item.id === color.id} onClick={() => onVehicleColor(item.id)} />
            ))}
          </div>
          {vehicleMode === "YACHT" && (
            <div className="sb-ride">
              <p role="status" aria-live="polite"><strong>Harbor cruise</strong> · {rideMessages[rideState]}</p>
              <div className="sb-row">
                {rideState === "idle"
                  ? <button type="button" className="sb-primary" onClick={() => onRide("start")}>Start ride</button>
                  : <>
                    <button type="button" className="sb-primary" onClick={() => onRide(rideState === "paused" ? "resume" : "pause")}>{rideState === "paused" ? "Resume" : "Pause"}</button>
                    <button type="button" onClick={() => onRide("stop")}>Stop</button>
                  </>}
              </div>
            </div>
          )}
        </Section>

        <Section id="visit" title="Quick Visit" summary={visitState.travelling ? `Going to ${visitState.travelling}` : visitState.arrived ? `Arrived: ${visitState.arrived}` : "Choose a building"} open={openSections.includes("visit")} onToggle={onToggleSection}>
          {!scene3d && <p className="sb-note">3D is unavailable here, so choosing a destination shows its information directly.</p>}
          {visitState.arrived && (
            <div className="sb-arrival" role="status">
              <p><strong>Arrived at {visitState.arrived}</strong>{visitState.near ? ". Parked at the closest clear spot beside the building." : ""}</p>
              <div className="sb-row">
                <button type="button" className="sb-primary" onClick={() => onOpenInfo(visitState.arrived)}>Show info</button>
                <button type="button" onClick={onReturnToCity}>Return to city</button>
              </div>
            </div>
          )}
          {blocked && autoTour.kind === "visit" && <BlockedCard autoTour={autoTour} onTour={onTour} full={false} />}
          {visitState.travelling && !blocked && (
            <div className="sb-arrival" role="status">
              <p><strong>{autoTour.phase === "stopping" ? `Stopping at ${visitState.travelling}…` : `Driving to ${visitState.travelling}…`}</strong></p>
              <div className="sb-row"><button type="button" onClick={() => onTour("exit")}>Cancel</button></div>
            </div>
          )}
          <div className="sb-chips" role="group" aria-label="Quick links">
            {quickLinks.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  if (label === "CONTACT") {
                    onOpenInfo("CONTACT");
                  } else {
                    onVisit(label);
                  }
                }}
              >
                {label[0] + label.slice(1).toLowerCase()}
              </button>
            ))}
            <button type="button" onClick={() => onRide("start")}>⚓ Yacht ride</button>
          </div>
          <ul className="sb-list">
            {places.map((place) => {
              const isVisited = visited.includes(place.label);
              const isCurrent = visitState.travelling === place.label || visitState.arrived === place.label;
              return (
                <li key={place.label}>
                  <button type="button" className={`sb-item-btn${isCurrent ? " is-current" : ""}`} aria-current={isCurrent ? "true" : undefined} onClick={() => onVisit(place.label)}>
                    <span className="sb-dot" style={{ "--swatch": place.color }} aria-hidden="true" />
                    <span className="sb-list-name">{place.label}</span>
                    <span className="sb-list-state">{isCurrent ? (visitState.arrived === place.label ? "Here" : "Going") : isVisited ? "✓ Visited" : "Go"}</span>
                  </button>
                  <button type="button" className="sb-info-pill" aria-label={`Open ${place.label} details`} onClick={(e) => { e.stopPropagation(); onOpenInfo(place.label); }}>Info</button>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section id="tour" title="Auto Tour" summary={tourLabel} open={openSections.includes("tour")} onToggle={onToggleSection}>
          {!scene3d ? <p className="sb-note">Auto Tour needs the 3D city. Use Quick Visit to read each stop.</p> : <>
            <div className="sb-tour-status" role="status" aria-live="polite">
              <p><span className={`sb-mode ${tourBusy ? "is-auto" : "is-manual"}`}>{modeLabel}</span> {tourIsFull ? phaseText[autoTour.phase] ?? "" : "Not started"}</p>
              {tourIsFull && autoTour.active && <p>Now: <strong>{autoTour.label}</strong>{nextStop ? <> · Next: {nextStop}</> : " · Last stop"}</p>}
              <div className="sb-progress" role="progressbar" aria-label="Auto tour progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
            </div>
            {blocked && tourIsFull && <BlockedCard autoTour={autoTour} onTour={onTour} full />}
            <div className="sb-row sb-wrap">
              {blocked && tourIsFull ? null : !autoTour.active || !tourIsFull
                ? <button type="button" className="sb-primary" onClick={() => onTour("start")}>{autoTour.phase === "complete" && tourIsFull ? "Restart tour" : "Start tour"}</button>
                : <>
                  <button type="button" className="sb-primary" onClick={() => onTour(autoTour.paused ? "resume" : "pause")}>{autoTour.paused ? "Resume" : "Pause"}</button>
                  <button type="button" onClick={() => onTour("skip")}>Skip stop</button>
                  <button type="button" onClick={() => onTour("restart")}>Restart tour</button>
                  <button type="button" onClick={() => onTour("exit")}>Exit tour</button>
                </>}
            </div>
            <p className="sb-note">The tour drives your {vehicleMode === "BIKE" ? "bike" : "car"} to every stop and opens its details. Pause or exit to drive yourself.</p>
          </>}
        </Section>

        <Section id="display" title="Display and movement" summary={`${timeOfDay.toLowerCase()}${calm ? " · calm" : ""}`} open={openSections.includes("display")} onToggle={onToggleSection}>
          <p className="sb-label">Time of day</p>
          <div className="sb-segment" role="group" aria-label="Time of day">
            {timeModes.map((mode) => <button key={mode} type="button" aria-pressed={timeOfDay === mode} onClick={() => onTime(mode)}><span aria-hidden="true">{timeIcons[mode]}</span> {mode[0] + mode.slice(1).toLowerCase()}</button>)}
          </div>
          <div className="sb-row sb-wrap">
            <button type="button" aria-pressed={calm} onClick={onCalm}>{calm ? "◉ Calm mode on" : "○ Calm mode off"}</button>
            <button type="button" aria-pressed={movementMode === "RUN"} disabled={isDriving} onClick={() => onMovement(movementMode === "RUN" ? "WALK" : "RUN")}>{movementMode === "RUN" ? "Running" : "Walking"}</button>
            <button type="button" disabled={tourBusy} onClick={onReset}>Reset position</button>
          </div>
          <p className="sb-note">Calm mode removes moving traffic and people and lowers graphics detail.</p>
        </Section>

        <details className="sb-keys">
          <summary>Keyboard and mouse</summary>
          <ul>{keyHelp.map(([keys, text]) => <li key={text}><kbd>{keys}</kbd> {text}</li>)}</ul>
        </details>

      </aside>
    </>
  );
}

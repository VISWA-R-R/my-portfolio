import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CityScene from "./CityScene";
import Landing from "./Landing";
import LoadingScreen from "./LoadingScreen";
import Sidebar from "./Sidebar";
import ContactForm from "./components/ContactForm";
import { outfits, vehicleColors } from "./looks";
import { characters } from "./characters";
import { cityPlaces, residentialPlaces, fishingPondPosition } from "./cityData";
import "./App.css";
import "./hud.css";
import "./sidebar.css";

const districts = cityPlaces.map(({ label, position, color, style }) => ({
  label,
  x: (cityPlaces.find((place) => place.label === label)?.interactionPosition ?? position)[0],
  z: (cityPlaces.find((place) => place.label === label)?.interactionPosition ?? position)[2],
  color,
  kind: style === "shop" ? "shop" : "portfolio",
}));
const scenicMapPlaces = [
  ...residentialPlaces.filter((home) => home.showOnMinimap).map((home) => ({ label: home.type === "villa" ? "VILLA" : "HOMES", x: home.position[0], z: home.position[2], color: home.color, kind: "scenic" })),
  { label: "FISHING POND", x: fishingPondPosition[0], z: fishingPondPosition[2], color: "#43c7dc", kind: "scenic" },
];

const mapRoads = Array.from({ length: 9 }, (_, index) => -40 + index * 10);
const tourOrder = ["EDUCATION", "SKILLS", "PROJECTS", "EXPERIENCE", "CERTIFICATES", "GITHUB", "BYTE CAFE", "CAMPUS BOOKS", "CITY GARAGE", "CONTACT"];
const timeModes = ["DAY", "DUSK", "NIGHT"];
const snapToRoad = (coordinate) => Math.max(-40, Math.min(40, Math.round(coordinate / 10) * 10));

const portfolio = {
  EDUCATION: {
    title: "Education",
    intro: "Computer Science and Engineering",
    points: ["Bachelor of Technology (B.Tech)", "Dr. MGR Educational and Research Institute", "2022–2026 · CGPA 7.52", "Coursework: Java, DBMS, OOP, data structures, algorithms, and web development"],
  },
  SKILLS: {
    title: "Skills",
    intro: "Technologies I use to build applications",
    points: ["Languages: Java, SQL, HTML, CSS, JavaScript, TypeScript", "Frameworks: Spring Boot, Hibernate, Spring Data JPA, React", "Databases: MySQL, PostgreSQL", "Tools: Git, GitHub, VS Code, IntelliJ IDEA, Maven, Postman", "Concepts: OOP, DSA, DBMS, System Design", "Strengths: problem solving, teamwork, communication, and adaptability"],
  },
  PROJECTS: {
    title: "Projects",
    intro: "Applications and systems I have worked on",
    points: ["Job Portal: Java, JSP, Jakarta Servlet, PostgreSQL, and Maven.", "Night Motion Detection and Alert System: ESP8266, PIR sensor, GSM alerts, LCD, buzzer, and LED.", "Student Management System: React 19 and Vite interface with REST API operations using Axios and TanStack Query.", "Banking Management System: Java 17, Spring Boot, Spring Data JPA, and MySQL, with validation and Swagger documentation."],
  },
  EXPERIENCE: {
    title: "Experience",
    intro: "Java Programming Intern · CodeOrbit Tech",
    points: ["Aug–Sep 2026", "Practiced object-oriented programming, input handling, validation, conditional logic, and exception handling.", "Built console applications including a bank account simulation, simple calculator, and student grade management system."],
  },
  CERTIFICATES: {
    title: "Certificates",
    intro: "Training and learning milestones",
    points: ["HCL GUVI Employability Enhancement Program · 150 hours · Aug–Oct 2025", "Diploma in Computer Applications (DCA)", "Java (Basic) · HackerRank", "Frontend Developer (React) · HackerRank", "Software Engineer · HackerRank"],
  },
  GITHUB: {
    title: "GitHub Projects",
    intro: "Java practice, SQL notes, web experiments, and portfolio work",
    points: ["Profile: VISWA-R-R · Java Full Stack Developer", "Java and coding practice", "SQL notes and queries", "Web technology practice", "Portfolio project"],
  },
  "BYTE CAFE": {
    title: "Byte Cafe",
    intro: "A quick stop in Viswa City",
    points: ["This storefront is a city landmark on the map.", "Visit the Projects district to explore my Java, Spring Boot, React, and SQL work."],
  },
  "CAMPUS BOOKS": {
    title: "Campus Books",
    intro: "A neighborhood stop near Education",
    points: ["This shop marks the campus side of Viswa City.", "Visit Education for my B.Tech degree, university, CGPA, and coursework."],
  },
  "CITY GARAGE": {
    title: "City Garage",
    intro: "A vehicle stop in Viswa City",
    points: ["Switch between the car and bike with V.", "Walk up to either vehicle and press E to ride; press F to get off."],
  },
};

// Add your resume link here, for example "/resume.pdf" after placing the file in /public. Empty = no Resume button.
const resumeUrl = "/resume.pdf";
const contactEmail = "viswaoff03@gmail.com";

const contactLinks = [
  { label: "Email", href: "mailto:viswaoff03@gmail.com" },
  { label: "Call", href: "tel:+917604804446" },
  { label: "GitHub", href: "https://github.com/VISWA-R-R" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/viswa-r-r-02a53642a/" },
  ...(resumeUrl ? [{ label: "Resume", href: resumeUrl }] : []),
  { label: "Old Portfolio", href: "https://viswa-portfolio-nine.vercel.app/" },
  { label: "LeetCode", href: "https://leetcode.com/u/viswaRR_03/" },
];

const touchButtons = [
  { key: "left", label: "◀", title: "Steer left", className: "touch-left" },
  { key: "forward", label: "▲", title: "Drive forward", className: "touch-forward" },
  { key: "backward", label: "▼", title: "Reverse", className: "touch-backward" },
  { key: "right", label: "▶", title: "Steer right", className: "touch-right" },
];

const keyHelp = [
  ["W A S D", "Walk or drive"],
  ["Shift", "Hold to run"],
  ["Space", "Brake"],
  ["E", "Open building info, or ride"],
  ["F", "Get out of the vehicle"],
  ["V", "Switch car, bike, yacht"],
  ["T", "Change time of day"],
  ["M", "Open or close this menu"],
  ["Esc", "Close information"],
  ["Drag, scroll", "Look around and zoom"],
];
const initialTour = { active: false, paused: false, index: 0, total: tourOrder.length, kind: "tour", label: "", phase: "idle", steering: "manual", arrival: "exact" };

export default function App() {
  const [phase, setPhase] = useState("landing"); // landing → loading → reveal → city
  const [sceneStatus, setSceneStatus] = useState("loading"); // loading | ready | fallback | failed
  const [sceneStage, setSceneStage] = useState("booting"); // booting | renderer
  const [sceneKey, setSceneKey] = useState(0);
  const [notice, setNotice] = useState("");
  const [character, setCharacter] = useState(characters[0]);
  const [outfitId, setOutfitId] = useState(outfits[0].id);
  const [vehicleColorId, setVehicleColorId] = useState(vehicleColors[0].id);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || window.innerWidth > 900);
  const [openSections, setOpenSections] = useState(["visit"]);
  const [timeOfDay, setTimeOfDay] = useState("DUSK");
  const [passedDismissed, setPassedDismissed] = useState(false);
  const [rideState, setRideState] = useState("idle");
  const [yachtCommand, setYachtCommand] = useState(null);
  const [autoTourCommand, setAutoTourCommand] = useState(null);
  const [autoTour, setAutoTour] = useState(initialTour);
  const [calm, setCalm] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  const [selectedPlace, setSelectedPlace] = useState("");
  const [visited, setVisited] = useState([]);
  const [quickTarget, setQuickTarget] = useState("");
  const [nearbyPlace, setNearbyPlace] = useState("");
  const [nearbyVehicle, setNearbyVehicle] = useState(false);
  const [isDriving, setIsDriving] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [position, setPosition] = useState({ x: 0, z: 11 });
  const [vehicleMode, setVehicleMode] = useState("CAR");
  const [movementMode, setMovementMode] = useState("WALK");
  const [touchInput, setTouchInput] = useState({});
  const [interact, setInteract] = useState(() => () => {});
  const [resetPositionAction, setResetPositionAction] = useState(() => () => {});
  const [exitVehicle, setExitVehicle] = useState(() => () => {});
  const shareInteraction = useCallback((action) => setInteract(() => action), []);
  const shareExit = useCallback((action) => setExitVehicle(() => action), []);
  const shareReset = useCallback((action) => setResetPositionAction(() => action), []);

  // Refs let scene callbacks read the latest state without being re-created on every change.
  const drivingRef = useRef(false);
  const selectedRef = useRef("");
  const nearRef = useRef("");
  const dismissedNearRef = useRef("");
  useEffect(() => { drivingRef.current = isDriving; selectedRef.current = selectedPlace; });

  const inGame = phase === "reveal" || phase === "city";
  const scene3d = sceneStatus === "ready";
  const autopilotMoving = autoTour.active && !autoTour.paused;
  const look = useMemo(() => ({
    characterId: character.id,
    outfit: outfits.find((item) => item.id === outfitId) ?? outfits[0],
    vehicleColor: vehicleColors.find((item) => item.id === vehicleColorId)?.value ?? null,
  }), [character.id, outfitId, vehicleColorId]);

  // Opening a building's information also counts it as visited and clears a matching Quick Visit route.
  const openPlace = useCallback((place) => {
    if (!place) return;
    setSelectedPlace(place);
    setQuickTarget((current) => current === place ? "" : current);
    setVisited((current) => current.includes(place) ? current : [...current, place]);
    if (typeof window !== "undefined" && window.innerWidth <= 760) setSidebarOpen(false);
  }, []);
  const closePlace = useCallback(() => {
    dismissedNearRef.current = nearRef.current;
    setSelectedPlace("");
  }, []);
  // Walking up to a building shows its information once per approach; closing it keeps it closed until you leave.
  const handleNearbyChange = useCallback((label) => {
    nearRef.current = label;
    setNearbyPlace(label);
    if (!label) { dismissedNearRef.current = ""; return; }
    if (drivingRef.current || selectedRef.current || dismissedNearRef.current === label) return;
    openPlace(label);
  }, [openPlace]);
  const handleAutoTourChange = useCallback((next) => {
    setAutoTour(next);
    if (next.phase === "blocked" && next.issue) setNotice(next.issue);
  }, []);

  const startGame = useCallback((chosen) => {
    setCharacter(chosen);
    setSceneStatus("loading");
    setSceneStage("booting");
    setQuickTarget(chosen.firstStop);
    setPhase("loading");
  }, []);
  // Only the real 3D renderer can mark the city as ready. A fallback or an error is reported honestly.
  const handleSceneReady = useCallback(() => setSceneStatus("ready"), []);
  const handleFallback = useCallback(() => setSceneStatus((status) => status === "ready" ? status : "fallback"), []);
  const handleSceneError = useCallback(() => setSceneStatus("failed"), []);
  const handleStage = useCallback((stage) => setSceneStage(stage), []);
  const enterCity = useCallback(() => setPhase((current) => current === "loading" ? "reveal" : current), []);
  const retryScene = useCallback(() => {
    setSceneKey((key) => key + 1);
    setSceneStatus("loading");
    setSceneStage("booting");
  }, []);
  const backToWelcome = useCallback(() => setPhase("landing"), []);
  const showNotice = useCallback((message) => setNotice(message), []);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  const sendYacht = useCallback((action) => setYachtCommand((current) => ({ id: (current?.id ?? 0) + 1, action })), []);
  const sendAutoTour = useCallback((action, label = "") => {
    if (["start", "restart", "visit", "skip"].includes(action)) setSelectedPlace("");
    if (action === "visit") setQuickTarget(label);
    if (action === "start" || action === "restart" || action === "exit") setQuickTarget("");
    setAutoTourCommand((current) => ({ id: (current?.id ?? 0) + 1, action, label, mode: vehicleMode === "BIKE" ? "BIKE" : "CAR" }));
    // Immediate feedback; the scene confirms with the real state a moment later.
    if (action === "exit") setAutoTour((current) => ({ ...current, active: false, paused: false, phase: "exited", steering: "manual" }));
    else if (action === "start" || action === "restart" || action === "visit") setAutoTour({ ...initialTour, active: true, kind: action === "visit" ? "visit" : "tour", total: action === "visit" ? 1 : tourOrder.length, label: action === "visit" ? label : tourOrder[0], phase: "starting", steering: "auto" });
  }, [vehicleMode]);
  const handleVisit = useCallback((label) => {
    if (scene3d) sendAutoTour("visit", label);
    else openPlace(label);
  }, [scene3d, sendAutoTour, openPlace]);
  const handleVehicle = useCallback((id) => {
    setVehicleMode(id);
    if (id === "YACHT") showNotice("Yacht selected. You are at the marina pier: press E beside the yacht, or choose Start ride.");
  }, [showNotice]);
  const toggleSection = useCallback((id) => setOpenSections((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]), []);

  const cycleTime = useCallback(() => setTimeOfDay((mode) => timeModes[(timeModes.indexOf(mode) + 1) % timeModes.length]), []);

  // After "Enter the city" the loading screen lifts, then the HUD takes over.
  useEffect(() => {
    if (phase !== "reveal") return undefined;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setPhase("city"), reduceMotion ? 250 : 800);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!inGame) return undefined;
    const onKeyDown = (event) => {
      if (event.repeat) return;
      const key = event.key?.toLowerCase();
      if (!key) return;
      const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName));
      if (key === "escape") { if (selectedRef.current) closePlace(); else if (window.innerWidth <= 760) setSidebarOpen(false); }
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (key === "t") cycleTime();
      if (key === "m") setSidebarOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inGame, cycleTime, closePlace]);

  const selectedContent = portfolio[selectedPlace];
  const tourStep = tourOrder.findIndex((label) => !visited.includes(label));
  const destination = useMemo(() => {
    const nextInTour = tourOrder.find((label) => !visited.includes(label));
    const target = districts.find((district) => district.label === quickTarget) || districts.find((district) => district.label === nextInTour);
    return target ? { ...target, distance: Math.hypot(position.x - target.x, position.z - target.z) } : null;
  }, [position, visited, quickTarget]);
  const activeTourDestination = autoTour.active ? districts.find((stop) => stop.label === autoTour.label) : null;
  const hudDestination = activeTourDestination ? { ...activeTourDestination, distance: Math.hypot(position.x - activeTourDestination.x, position.z - activeTourDestination.z) } : destination;
  const tourDone = visited.length === tourOrder.length;
  const showPassed = tourDone && !passedDismissed && !selectedPlace && !autoTour.active;
  useEffect(() => {
    if (!showPassed) return undefined;
    const timer = setTimeout(() => setPassedDismissed(true), 9000);
    return () => clearTimeout(timer);
  }, [showPassed]);
  const holdControl = (key, active) => setTouchInput((current) => ({ ...current, [key]: active }));
  const playerMapX = ((position.x + 50) / 100) * 100;
  const playerMapY = ((position.z + 50) / 100) * 100;
  const routeWorldPoints = hudDestination ? [
    [position.x, position.z],
    [snapToRoad(position.x), position.z],
    [snapToRoad(position.x), snapToRoad(position.z)],
    [snapToRoad(hudDestination.x), snapToRoad(position.z)],
    [snapToRoad(hudDestination.x), snapToRoad(hudDestination.z)],
    [snapToRoad(hudDestination.x), hudDestination.z],
    [hudDestination.x, hudDestination.z],
  ] : [];
  const routePoints = routeWorldPoints.map(([x, z]) => `${x + 50},${z + 50}`).join(" ");

  const visitState = {
    travelling: autoTour.active && autoTour.kind === "visit" ? autoTour.label : "",
    // The arrival banner clears itself once the player drives or walks away from the building.
    arrived: autoTour.kind === "visit" && autoTour.phase === "arrived" && (districts.find((district) => district.label === autoTour.label) ? Math.hypot(position.x - districts.find((district) => district.label === autoTour.label).x, position.z - districts.find((district) => district.label === autoTour.label).z) < 9 : false) ? autoTour.label : "",
    near: autoTour.arrival === "alternate",
  };
  const tourViewing = autoTour.active && autoTour.kind === "tour" && autoTour.phase === "viewing" && selectedPlace === autoTour.label;
  const tourPlaces = tourOrder.map((label) => districts.find((district) => district.label === label));
  const routeBlocked = autoTour.active && autoTour.phase === "blocked";
  const missionKicker = autoTour.active
    ? `${autoTour.kind === "tour" ? `AUTO TOUR · ${autoTour.index + 1} OF ${autoTour.total}` : "QUICK VISIT"} · ${routeBlocked ? "ROUTE BLOCKED" : autoTour.paused ? "MANUAL" : "AUTOPILOT"}`
    : visitState.arrived ? "ARRIVED" : quickTarget ? "QUICK VISIT" : destination ? `STOP ${tourStep + 1} OF ${tourOrder.length}` : "CITY TOUR";
  const missionTitle = autoTour.active ? autoTour.label : visitState.arrived || (destination?.label ?? "CITY TOUR COMPLETE");
  const missionDetail = autoTour.active
    ? routeBlocked ? "Open the menu to retry, skip or exit" : `${autoTour.paused ? "Paused · you are driving" : autoTour.phase === "stopping" ? "Stopping at the building" : autoTour.phase === "viewing" ? "Parked · reading details" : "Autopilot route"} · ${Math.round(hudDestination?.distance ?? 0)} units`
    : visitState.arrived ? "Tap Show info in the menu to reopen" : destination ? `${quickTarget ? "Direct route" : "Follow the gold route"} · ${Math.round(destination.distance)} units` : "You visited every stop";
  const parkedAtPlace = isDriving && nearbyPlace && Math.abs(speed) <= 1;

  if (phase === "landing") return <Landing onStart={startGame} />;

  return (
    <main className="portfolio" style={{ "--accent": character.accent }}>
      <CityScene key={sceneKey} inputEnabled={inGame} onStage={handleStage} onFallback={handleFallback} onSceneError={handleSceneError} onGraphicsNotice={showNotice} calm={calm} look={look} infoOpen={Boolean(selectedPlace)} targetX={destination?.x} targetZ={destination?.z} onResetReady={shareReset} onSceneReady={handleSceneReady} yachtCommand={yachtCommand} autoTourCommand={autoTourCommand} onAutoTourChange={handleAutoTourChange} onRideStateChange={setRideState} timeOfDay={timeOfDay} onSelect={openPlace} onNearbyChange={handleNearbyChange} onVehicleNearChange={setNearbyVehicle} onDrivingChange={setIsDriving} onInteractionReady={shareInteraction} onExitReady={shareExit} onSpeedChange={setSpeed} onPositionChange={setPosition} onVehicleChange={setVehicleMode} vehicleMode={vehicleMode} vehicleSpeed={speed} touchInput={{ ...touchInput, run: movementMode === "RUN" }} isDriving={isDriving} routePoints={routeWorldPoints} />
      {inGame && <>
      <Sidebar
        open={sidebarOpen} onToggle={() => setSidebarOpen((open) => !open)} openSections={openSections} onToggleSection={toggleSection} scene3d={scene3d}
        character={character} onCharacter={setCharacter} outfitId={outfitId} onOutfit={setOutfitId}
        vehicleMode={vehicleMode} onVehicle={handleVehicle} vehicleColorId={vehicleColorId} onVehicleColor={setVehicleColorId}
        isDriving={isDriving} places={tourPlaces} visited={visited}
        nearbyPlace={nearbyPlace} onOpenInfo={openPlace} onVisit={handleVisit} visitState={visitState} onReturnToCity={() => { setSelectedPlace(""); sendAutoTour("exit"); }}
        autoTour={autoTour} onTour={(action) => sendAutoTour(action)} rideState={rideState} onRide={sendYacht}
        timeOfDay={timeOfDay} onTime={setTimeOfDay} calm={calm} onCalm={() => setCalm((value) => !value)}
        movementMode={movementMode} onMovement={setMovementMode} onReset={resetPositionAction} keyHelp={keyHelp}
      />

      <section className="mission-hud" aria-label="Navigation status">
        <p className="mission-kicker">{missionKicker}</p>
        <strong>{missionTitle}</strong>
        <span>{missionDetail}</span>
      </section>

      <div className="minimap" aria-label="City map: pins mark clear approach points for portfolio stops, homes, villa, and fishing pond">
        {mapRoads.map((road) => <span key={`map-x-${road}`} className="map-road map-road-vertical" style={{ left: `${road + 50}%` }} />)}
        {mapRoads.map((road) => <span key={`map-z-${road}`} className="map-road map-road-horizontal" style={{ top: `${road + 50}%` }} />)}
        {hudDestination && <svg className="map-route-layer" viewBox="0 0 100 100" aria-hidden="true"><polyline points={routePoints} /></svg>}
        {districts.map((district) => <span key={district.label} className={`map-marker${nearbyPlace === district.label ? " is-nearby" : ""}${hudDestination?.label === district.label ? " map-marker-target" : ""}${district.x > 0 ? " map-marker-left" : ""}${district.kind === "shop" ? " map-marker-shop" : ""}`} title={`${district.label} · roadside approach`} aria-label={`${district.label} approach point on the city map`} data-label={district.label} style={{ left: `${((district.x + 50) / 100) * 100}%`, top: `${((district.z + 50) / 100) * 100}%`, "--marker": district.color }} />)}
        {scenicMapPlaces.map((place, index) => <span key={`${place.label}-${index}`} className="map-marker map-marker-scenic" title={`${place.label} · city map location`} aria-label={`${place.label} location on the city map`} data-label={place.label} style={{ left: `${((place.x + 50) / 100) * 100}%`, top: `${((place.z + 50) / 100) * 100}%`, "--marker": place.color }} />)}
        <span className="map-marker map-marker-scenic" title="Yacht marina · north shore" aria-label="Yacht marina on the north shore" data-label="MARINA" style={{ left: "50%", top: "4%", "--marker": "#8be5ed" }} />
        <span className="player-marker" title={isDriving ? "Your vehicle" : "Your avatar"} style={{ left: `${playerMapX}%`, top: `${playerMapY}%` }} />
        <span className="map-label">CITY MAP</span>
      </div>

      <div className="speed-hud" aria-label={isDriving ? `Vehicle speed: ${speed} kilometers per hour` : `${movementMode.toLowerCase()} mode`}><span className="speed-value">{speed}</span><span className="speed-unit">{isDriving ? "KM/H" : movementMode}</span></div>

      {!autopilotMoving && !selectedPlace && (isDriving || nearbyVehicle || nearbyPlace) && <div className="interaction-prompt"><span className="keyboard-key">E</span><span>{isDriving ? parkedAtPlace ? `Open ${nearbyPlace} info` : `Exit ${vehicleMode.toLowerCase()}` : nearbyPlace ? `Open ${nearbyPlace} info` : `Ride your ${vehicleMode.toLowerCase()}`}</span><button type="button" onClick={isDriving ? parkedAtPlace ? interact : exitVehicle : interact}>{isDriving ? parkedAtPlace ? "INFO" : "EXIT" : nearbyPlace ? "INFO" : "RIDE"}</button>{parkedAtPlace && <button type="button" onClick={exitVehicle}>EXIT · F</button>}</div>}

      {selectedPlace && <section className={`info-panel info-fullscreen${selectedPlace === "SKILLS" ? " skills-fullscreen" : ""}`} role="dialog" aria-modal="true" aria-live="polite" aria-label={`${selectedPlace} details`}>
        <button className="close-button" type="button" onClick={closePlace} aria-label="Close details">×</button>
        {selectedPlace === "CONTACT" ? <>
          <p className="panel-kicker">SAY HELLO · TAMIL NADU, INDIA</p><h2>Contact</h2><p className="panel-intro">Choose a link to connect with me.</p>
          <ul className="contact-links">{contactLinks.map((link) => { const external = link.href.startsWith("http"); return <li key={link.label}><a href={link.href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>{link.label}<span aria-hidden="true"> ↗</span></a></li>; })}</ul>
          <ContactForm />
        </> : selectedPlace === "GITHUB" ? <>
          <p className="panel-kicker">CODE · REPOSITORIES</p><h2>{selectedContent.title}</h2><p className="panel-intro">{selectedContent.intro}</p>
          <ul className="repo-links">
            <li><a href="https://github.com/VISWA-R-R" target="_blank" rel="noreferrer">Open GitHub profile ↗</a></li>
            <li><a href="https://github.com/VISWA-R-R/practice" target="_blank" rel="noreferrer">Java practice ↗</a></li>
            <li><a href="https://github.com/VISWA-R-R/SQL-Notes-and-Queries" target="_blank" rel="noreferrer">SQL notes and queries ↗</a></li>
            <li><a href="https://github.com/VISWA-R-R/web-tech-practice" target="_blank" rel="noreferrer">Web technology practice ↗</a></li>
            <li><a href="https://github.com/VISWA-R-R/Viswa-portfolio" target="_blank" rel="noreferrer">Portfolio project ↗</a></li>
          </ul>
        </> : selectedPlace === "SKILLS" ? <>
          <p className="panel-kicker">VISWA R R · DEVELOPER TOOLKIT</p>
          <h2>{selectedContent.title}</h2>
          <p className="panel-intro">Languages, frameworks, databases, and tools I use to build full stack applications.</p>
          <div className="skills-grid">{selectedContent.points.map((point) => {
            const splitAt = point.indexOf(":");
            const title = splitAt > -1 ? point.slice(0, splitAt) : "Skills";
            const details = splitAt > -1 ? point.slice(splitAt + 1).trim() : point;
            return <article className="skill-card" key={point}><span>{title}</span><p>{details}</p></article>;
          })}</div>
        </> : <><p className="panel-kicker">VISWA R R · PORTFOLIO</p><h2>{selectedContent?.title}</h2><p className="panel-intro">{selectedContent?.intro}</p><ul>{selectedContent?.points.map((point) => <li key={point}>{point}</li>)}</ul></>}
      {autoTour.kind === "visit" && autoTour.phase === "arrived" && autoTour.arrival === "alternate" && selectedPlace === autoTour.label && <p className="panel-note">The usual spot was blocked, so the car parked at the closest clear spot beside this building.</p>}
        {tourViewing && <div className="panel-tour">
          <p>Auto tour · stop {autoTour.index + 1} of {autoTour.total}{autoTour.arrival === "alternate" ? ". The usual spot was blocked, so the car parked at the closest clear spot beside this building." : ""}</p>
          <button type="button" onClick={closePlace}>Done reading · continue tour</button>
        </div>}
      </section>}

      <div className="mobile-controls" aria-label="Touch driving controls">{touchButtons.map((button) => <button key={button.key} className={button.className} type="button" aria-label={button.title} onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); holdControl(button.key, true); }} onPointerUp={() => holdControl(button.key, false)} onPointerCancel={() => holdControl(button.key, false)} onLostPointerCapture={() => holdControl(button.key, false)}>{button.label}</button>)}{!isDriving && ["WALK", "RUN"].map((mode) => <button key={mode} type="button" className={`pace-button mobile-pace-button${movementMode === mode ? " is-active" : ""}`} aria-pressed={movementMode === mode} onClick={() => setMovementMode(mode)}>{mode}</button>)}</div>
      </>}

      {showPassed && <div className="mission-passed" role="alert">
        <p className="mp-title">Mission passed</p>
        <p className="mp-sub">You explored all {tourOrder.length} stops in Viswa City.</p>
        <div className="mp-actions">
          <button type="button" onClick={() => { setPassedDismissed(true); setSelectedPlace("CONTACT"); }}>Contact Viswa</button>
          <button type="button" className="ghost" onClick={() => setPassedDismissed(true)}>Keep exploring</button>
        </div>
      </div>}

      {(phase === "loading" || phase === "reveal") && <LoadingScreen character={character} status={sceneStatus} stage={sceneStage} reveal={phase === "reveal"} onEnter={enterCity} onRetry={retryScene} onBack={backToWelcome} />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}


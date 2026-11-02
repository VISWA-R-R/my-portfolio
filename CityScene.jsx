import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, PerformanceMonitor, RoundedBox, Stars } from "@react-three/drei";
import SceneBoundary from "./SceneBoundary";
import { ACESFilmicToneMapping, BackSide, CanvasTexture, Color, MeshStandardMaterial, PCFShadowMap, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector3 } from "three";
import { cityPlaces as places, residentialPlaces, fishingPondPosition } from "./cityData";
import { skyline, treePositions, pedestrianSpots, dogSpots, streetLightPositions, trafficSignals, trafficCars, schoolBus } from "./sceneData";
import { roadLines, tourStops, nearestRoadLine, placeByLabel, approachPoint, projectToRoad, vehicleBounds, vehicleRadius, planRoute as planStreetRoute, arrivalCandidates, segmentAhead, clearanceAhead, speedForGap, laneRoute, pursuit } from "./navigation";

/* ------------------------------------------------------------------ */
/* Time of day: DAY / DUSK / NIGHT blend smoothly. `atmo.night` (0..1)  */
/* drives window glow and street lamps everywhere in the scene.        */
/* ------------------------------------------------------------------ */

// Three.js labels are painted to local canvas textures so offline visits never
// trigger Troika's remote font metadata lookup.
function Text({ children, fontSize = 0.3, color = "#ffffff", outlineColor = "#142136", outlineWidth = 0.02, position, rotation }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    const text = String(children ?? "");
    const scale = 128;
    canvas.width = Math.max(256, Math.ceil(text.length * scale * 0.72));
    canvas.height = 256;
    const context = canvas.getContext("2d");
    context.font = "700 150px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.strokeStyle = outlineColor;
    context.lineWidth = Math.max(2, outlineWidth * 500);
    context.strokeText(text, canvas.width / 2, canvas.height / 2, canvas.width - 20);
    context.fillStyle = color;
    context.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 20);
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    return result;
  }, [children, color, outlineColor, outlineWidth]);
  useEffect(() => () => texture.dispose(), [texture]);
  const width = Math.max(fontSize, String(children ?? "").length * fontSize * 0.59);
  return <mesh position={position} rotation={rotation}>
    <planeGeometry args={[width, fontSize * 1.22]} />
    <meshBasicMaterial map={texture} transparent depthWrite={false} />
  </mesh>;
}

const isSoftwareGl = typeof window !== "undefined" && (() => {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
})();

const atmo = { night: 0 };
const skyPresets = {
  DAY: { top: "#3f8fd0", horizon: "#a9d6e8", fog: "#a9d6e8", glow: "#fff1c9", hemiSky: "#e8f5ff", hemiGround: "#5a6859", sun: "#fff3d7", sunPos: [-18, 30, 12], fogNear: 92, fogFar: 170, hemi: 1.45, sunPower: 2.4, exposure: 1.05, night: 0 },
  DUSK: { top: "#32245f", horizon: "#ff8a5c", fog: "#e07a68", glow: "#ffb25a", hemiSky: "#ffc9a8", hemiGround: "#4a3a55", sun: "#ffa869", sunPos: [-34, 13, 22], fogNear: 70, fogFar: 155, hemi: 1.0, sunPower: 2.7, exposure: 1.12, night: 0.4 },
  NIGHT: { top: "#04061a", horizon: "#1b2450", fog: "#151c40", glow: "#cfd9ff", hemiSky: "#34468c", hemiGround: "#101420", sun: "#8ea6ff", sunPos: [24, 26, -18], fogNear: 50, fogFar: 135, hemi: 0.62, sunPower: 1.0, exposure: 1.18, night: 1 },
};
const makeAtmosphereState = (preset) => ({
  top: new Color(preset.top), horizon: new Color(preset.horizon), fog: new Color(preset.fog), glow: new Color(preset.glow),
  hemiSky: new Color(preset.hemiSky), hemiGround: new Color(preset.hemiGround), sun: new Color(preset.sun),
  sunPos: new Vector3(...preset.sunPos),
  fogNear: preset.fogNear, fogFar: preset.fogFar, hemi: preset.hemi, sunPower: preset.sunPower, exposure: preset.exposure, night: preset.night,
});
const atmosphereTargets = Object.fromEntries(Object.entries(skyPresets).map(([name, preset]) => [name, makeAtmosphereState(preset)]));
const colorKeys = ["top", "horizon", "fog", "glow", "hemiSky", "hemiGround", "sun"];
const numberKeys = ["fogNear", "fogFar", "hemi", "sunPower", "exposure", "night"];
const windowMaterials = {
  warm: new MeshStandardMaterial({ color: "#f3dfa7", emissive: "#f3dfa7", emissiveIntensity: 0.12, roughness: 0.28, metalness: 0.12 }),
  cool: new MeshStandardMaterial({ color: "#c5f2ed", emissive: "#c5f2ed", emissiveIntensity: 0.12, roughness: 0.28, metalness: 0.12 }),
  skyline: new MeshStandardMaterial({ color: "#9eb3c7", emissive: "#647a96", emissiveIntensity: 0.15 }),
};
const lampMaterial = new MeshStandardMaterial({ color: "#fff0b4", emissive: "#ffd36b", emissiveIntensity: 0.6 });
const skylineDayGlow = new Color("#647a96");
const skylineNightGlow = new Color("#ffc978");
const skyVertex = "varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const skyFragment = `
  uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; uniform vec3 sunDir; varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(horizon, top, pow(h, 0.55));
    float s = max(dot(d, normalize(sunDir)), 0.0);
    col += glow * (pow(s, 900.0) * 3.0 + pow(s, 24.0) * 0.45 + pow(s, 4.0) * 0.12);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;


import { computeTagLayout } from "./utils/tagPositioning.js";

// Building name tags are plain HTML on top of the canvas. Each tag stays fully visible
// inside the browser area on desktop and mobile, avoiding clipping, controls, and other tags.
function TagProjector({ layerRef }) {
  const point = useMemo(() => new Vector3(), []);
  const camDir = useMemo(() => new Vector3(), []);
  const toPoint = useMemo(() => new Vector3(), []);
  const cache = useRef({ at: -1, avoid: [], sizes: new Map(), lastWidth: 0 });

  useFrame(({ camera, clock }) => {
    const layer = layerRef.current;
    if (!layer) return;
    const width = layer.clientWidth;
    const height = layer.clientHeight;
    if (!width || !height) return;

    const state = cache.current;
    const isMobile = width <= 760;

    // Invalidate cached sizes if viewport width resized meaningfully
    if (Math.abs(width - state.lastWidth) > 20) {
      state.sizes.clear();
      state.lastWidth = width;
    }

    // Refresh UI obstacle bounding boxes periodically
    if (clock.elapsedTime - state.at > 0.1) {
      state.at = clock.elapsedTime;
      state.avoid = [
        ...document.querySelectorAll(
          ".sidebar.is-open, .menu-toggle, .minimap, .mission-hud, .speed-hud, .info-panel, .interaction-prompt, .mobile-controls, .mission-passed"
        ),
      ]
        .map((el) => el.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
    }

    camera.getWorldDirection(camDir);

    const items = [];
    layer.querySelectorAll("[data-tag]").forEach((element) => {
      const placeIndex = Number(element.dataset.tag);
      const place = places[placeIndex];
      if (!place) return;

      point.set(place.position[0], place.height + 0.85, place.position[2]);
      const distance = point.distanceTo(camera.position);

      toPoint.subVectors(point, camera.position);
      const inFront = toPoint.dot(camDir) > 0.05;

      // Project into NDC
      point.project(camera);

      // Only display tags when the building is genuinely in front of the camera and within the visible viewport.
      // Do not clamp off-screen buildings to screen borders, which caused jumping and zooming pulses.
      if (!inFront || distance > 52 || Math.abs(point.x) > 1.05 || Math.abs(point.y) > 1.05) {
        items.push({ element, hidden: true, distance });
        return;
      }

      let size = state.sizes.get(element);
      if (!size || size.w === 0) {
        const rect = element.getBoundingClientRect();
        const w = rect.width || element.offsetWidth || 120;
        const h = rect.height || element.offsetHeight || 28;
        size = { w, h };
        if (w > 0 && h > 0) state.sizes.set(element, size);
      }

      items.push({
        element,
        distance,
        size,
        screenX: (point.x * 0.5 + 0.5) * width,
        screenY: (-point.y * 0.5 + 0.5) * height,
        hidden: false,
      });
    });

    // Nearer tags take priority in collision resolution
    items.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

    const placedTags = [];

    for (const item of items) {
      const { element } = item;
      if (item.hidden) {
        element.style.visibility = "hidden";
        element.classList.remove("is-compact", "is-flipped");
        continue;
      }

      const layout = computeTagLayout({
        screenX: item.screenX,
        screenY: item.screenY,
        distance: item.distance,
        tagWidth: item.size.w,
        tagHeight: item.size.h,
        viewportWidth: width,
        viewportHeight: height,
        obstacles: state.avoid,
        placedTags,
        isMobile,
      });

      if (layout.visible) {
        placedTags.push(layout.rect);
        element.style.transform = layout.transform;
        element.style.opacity = String(layout.opacity);
        element.style.visibility = "visible";

        if (layout.isCompact) {
          element.classList.add("is-compact");
        } else {
          element.classList.remove("is-compact");
        }

        if (layout.isFlipped) {
          element.classList.add("is-flipped");
        } else {
          element.classList.remove("is-flipped");
        }
      } else {
        element.style.visibility = "hidden";
        element.classList.remove("is-compact", "is-flipped");
      }
    }
  });

  return null;
}

function Atmosphere({ mode, shadowSize = 2048 }) {
  const fogRef = useRef();
  const hemiRef = useRef();
  const sunRef = useRef();
  const skyRef = useRef();
  const starsRef = useRef();
  const current = useMemo(() => makeAtmosphereState(skyPresets[mode] || skyPresets.DUSK), []); // eslint-disable-line react-hooks/exhaustive-deps
  const skyUniforms = useMemo(() => ({ top: { value: new Color() }, horizon: { value: new Color() }, glow: { value: new Color() }, sunDir: { value: new Vector3(0, 1, 0) } }), []);

  // Resize the shadow map when quality changes; the old map must be released so it is rebuilt.
  useEffect(() => {
    const light = sunRef.current;
    if (!light) return;
    if (light.shadow.mapSize.x === shadowSize) return;
    light.shadow.mapSize.set(shadowSize, shadowSize);
    if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
  }, [shadowSize]);

  useFrame((state, delta) => {
    const { camera } = state;
    const target = atmosphereTargets[mode] || atmosphereTargets.DUSK;
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * 2.4);
    colorKeys.forEach((key) => current[key].lerp(target[key], k));
    numberKeys.forEach((key) => { current[key] += (target[key] - current[key]) * k; });
    current.sunPos.lerp(target.sunPos, k);
    atmo.night = current.night;

    if (fogRef.current) { fogRef.current.color.copy(current.fog); fogRef.current.near = current.fogNear; fogRef.current.far = current.fogFar; }
    if (hemiRef.current) { hemiRef.current.color.copy(current.hemiSky); hemiRef.current.groundColor.copy(current.hemiGround); hemiRef.current.intensity = current.hemi; }
    if (sunRef.current) { sunRef.current.color.copy(current.sun); sunRef.current.intensity = current.sunPower; sunRef.current.position.copy(current.sunPos); }
    if (skyRef.current) {
      skyUniforms.top.value.copy(current.top);
      skyUniforms.horizon.value.copy(current.horizon);
      skyUniforms.glow.value.copy(current.glow);
      skyUniforms.sunDir.value.copy(current.sunPos).normalize();
      skyRef.current.position.copy(camera.position);
    }
    if (starsRef.current) { starsRef.current.visible = current.night > 0.55; starsRef.current.position.copy(camera.position); }
    state.gl.toneMappingExposure = current.exposure;

    windowMaterials.warm.emissiveIntensity = 0.12 + current.night * 1.5;
    windowMaterials.cool.emissiveIntensity = 0.12 + current.night * 1.6;
    windowMaterials.skyline.emissiveIntensity = 0.15 + current.night * 1.1;
    windowMaterials.skyline.emissive.lerpColors(skylineDayGlow, skylineNightGlow, current.night);
    lampMaterial.emissiveIntensity = 0.6 + current.night * 2.4;
  });

  return (
    <>
      <fog ref={fogRef} attach="fog" args={["#e07a68", 70, 155]} />
      <hemisphereLight ref={hemiRef} args={["#ffc9a8", "#4a3a55", 1.0]} />
      <directionalLight ref={sunRef} castShadow position={[-34, 13, 22]} color="#ffa869" intensity={2.7} shadow-mapSize-width={shadowSize} shadow-mapSize-height={shadowSize} shadow-camera-left={-52} shadow-camera-right={52} shadow-camera-top={52} shadow-camera-bottom={-52} shadow-camera-far={220} shadow-bias={-0.00018} />
      <mesh ref={skyRef} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[120, 32, 16]} />
        <shaderMaterial uniforms={skyUniforms} vertexShader={skyVertex} fragmentShader={skyFragment} side={BackSide} depthWrite={false} />
      </mesh>
      <group ref={starsRef} visible={false}>
        <Stars radius={90} depth={25} count={2200} factor={3.2} saturation={0} fade speed={0.5} />
      </group>
    </>
  );
}

// Marina: the yacht is moored beside the pier (not on top of it) and the harbor cruise loops the island.
const yachtMoor = [5.2, -0.4, -55.5];
const pierStand = [2.55, 0, -53.0];
const yachtRoute = [[5.2, -66], [66, -66], [66, 66], [-66, 66], [-66, -66], [5.2, -66], [5.2, -57.2]];
const shade = (hex, factor) => `#${new Color(hex).multiplyScalar(factor).getHexString()}`;
function obbPenetration(ax, az, ayaw, aBounds, object) {
  const otherBounds = object.userData.collisionBounds ?? (object.userData.isBus ? { halfWidth: 1.42, halfLength: 3.9 } : vehicleBounds("CAR"));
  const byaw = object.rotation.y;
  const axes = [[Math.cos(ayaw), -Math.sin(ayaw)], [Math.sin(ayaw), Math.cos(ayaw)], [Math.cos(byaw), -Math.sin(byaw)], [Math.sin(byaw), Math.cos(byaw)]];
  const dx = ax - object.position.x;
  const dz = az - object.position.z;
  let minimum = Infinity;
  let normal = null;
  for (const [nx, nz] of axes) {
    const radiusA = aBounds.halfWidth * Math.abs(Math.cos(ayaw)*nx - Math.sin(ayaw)*nz) + aBounds.halfLength * Math.abs(Math.sin(ayaw)*nx + Math.cos(ayaw)*nz);
    const radiusB = otherBounds.halfWidth * Math.abs(Math.cos(byaw)*nx - Math.sin(byaw)*nz) + otherBounds.halfLength * Math.abs(Math.sin(byaw)*nx + Math.cos(byaw)*nz);
    const signedDistance = dx * nx + dz * nz;
    const overlap = radiusA + radiusB - Math.abs(signedDistance);
    if (overlap <= 0) return null;
    if (overlap < minimum) { minimum = overlap; const side = signedDistance < 0 ? -1 : 1; normal = [nx*side, nz*side]; }
  }
  return { depth: minimum, normal };
}

const walkingLoop = [[3.2, 2.55], [6.8, 2.55], [7.45, 3.2], [7.45, 6.8], [6.8, 7.45], [3.2, 7.45], [2.55, 6.8], [2.55, 3.2]];
const walkingSegments = walkingLoop.map((point, index) => {
  const next = walkingLoop[(index + 1) % walkingLoop.length];
  return { start: point, end: next, length: Math.hypot(next[0] - point[0], next[1] - point[1]) };
});
const walkingLoopLength = walkingSegments.reduce((total, segment) => total + segment.length, 0);
function sampleWalkingLoop(distance) {
  let remaining = ((distance % walkingLoopLength) + walkingLoopLength) % walkingLoopLength;
  for (const segment of walkingSegments) {
    if (remaining <= segment.length) {
      const progress = remaining / segment.length;
      return {
        x: segment.start[0] + (segment.end[0] - segment.start[0]) * progress,
        z: segment.start[1] + (segment.end[1] - segment.start[1]) * progress,
        dx: (segment.end[0] - segment.start[0]) / segment.length,
        dz: (segment.end[1] - segment.start[1]) / segment.length,
      };
    }
    remaining -= segment.length;
  }
  return { x: 5, z: 2.55, dx: 1, dz: 0 };
}
const trafficRefs = [];

function isClearFootPoint(x, z, radius = 0.36, ignoredTraffic = []) {
  if (Math.abs(x) > 54 || Math.abs(z) > 54) return false;
  if (places.some(({ position, style }) => Math.abs(x - position[0]) < (style === "shop" ? 2.25 : 1.5) + radius && Math.abs(z - position[2]) < (style === "shop" ? 1.9 : 1.5) + radius)) return false;
  if (residentialPlaces.some(({ position, width, depth }) => Math.abs(x - position[0]) < width / 2 + radius && Math.abs(z - position[2]) < depth / 2 + radius)) return false;
  if (skyline.some(({ x: bx, z: bz, width, depth }) => Math.abs(x - bx) < width / 2 + radius && Math.abs(z - bz) < depth / 2 + radius)) return false;
  if (Math.hypot((x - fishingPondPosition[0]) / 2.8, (z - fishingPondPosition[2]) / 2.8) < 1 + radius / 2.8) return false;
  // Tree canopies overhang the street; only the trunk is a solid obstacle.
  if (treePositions.some(([tx, , tz]) => Math.hypot(x - tx, z - tz) < 0.48 + radius)) return false;
  if ([...streetLightPositions, ...trafficSignals.map(({ position }) => position)].some(([lx, , lz]) => Math.hypot(x - lx, z - lz) < 0.18 + radius)) return false;
  if (trafficRefs.some((other, index) => {
    if (!other || ignoredTraffic.includes(index) || index === 4) return false;
    return Boolean(obbPenetration(x, z, 0, { halfWidth: radius, halfLength: radius }, other));
  })) return false;
  return true;
}

function findClearFootPoint(originX, originZ, preferredX = originX, preferredZ = originZ, radius = 0.36, maxDistance = 8, ignoredTraffic = []) {
  const candidates = [[preferredX, preferredZ]];
  for (let distance = 0.35; distance <= maxDistance; distance += 0.35) {
    for (let index = 0; index < 24; index += 1) {
      const angle = (index / 24) * Math.PI * 2;
      candidates.push([preferredX + Math.cos(angle) * distance, preferredZ + Math.sin(angle) * distance]);
    }
  }
  for (const line of roadLines) candidates.push([line, originZ], [originX, line]);
  candidates.sort((a, b) => Math.hypot(a[0] - preferredX, a[1] - preferredZ) - Math.hypot(b[0] - preferredX, b[1] - preferredZ));
  return candidates.find(([x, z]) => isClearFootPoint(x, z, radius, ignoredTraffic)) ?? [originX, originZ];
}

function closestPlaceApproach(x, z, range = 4.4) {
  let closest = null;
  let distance = Infinity;
  for (const place of places) {
    const point = place.interactionPosition ?? place.position;
    const candidate = Math.hypot(x - point[0], z - point[2]);
    if (candidate < distance) { closest = place; distance = candidate; }
  }
  return distance < range ? { label: closest.label, distance } : { label: "", distance };
}

function Building({ place }) {
  const { position, color, height, style } = place;
  const floors = Math.floor(height / 1.35);
  const windows = [];

  for (let floor = 0; floor < floors; floor += 1) {
    for (const x of [-0.72, 0, 0.72]) {
      windows.push([x, 0.82 + floor * 1.24, 1.43]);
    }
    for (const z of [-0.72, 0, 0.72]) {
      windows.push([1.43, 0.82 + floor * 1.24, z]);
    }
  }

  return (
    <group position={position}>
      {/* Keep the district color on a clean, untextured façade. High-frequency
          normal maps shimmer badly on these small walls at portfolio camera distance. */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={style === "shop" ? [4.2, height, 3.5] : [2.8, height, 2.8]} />
        <meshStandardMaterial color={color} roughness={style === "tower" ? 0.58 : 0.78} metalness={style === "tower" ? 0.08 : 0.02} />
      </mesh>
      {style !== "shop" && [-1.28, 1.28].map((x) => (
        <mesh key={`trim-${x}`} position={[x, height / 2, 1.414]} castShadow>
          <boxGeometry args={[0.045, height - 0.12, 0.028]} />
          <meshStandardMaterial color="#d2d8df" roughness={0.72} />
        </mesh>
      ))}

      {/* Distinct roofline by district */}
      <mesh position={[0, height + 0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={style === "shop" ? [4.45, 0.22, 3.72] : [3.05, 0.2, 3.05]} />
        <meshStandardMaterial color={style === "shop" ? "#333e4a" : "#c5cfdf"} roughness={0.62} />
      </mesh>
      {style === "shop" && (
        <>
          <mesh position={[0, 1.04, 1.79]} castShadow>
            <boxGeometry args={[4.25, 0.3, 0.58]} />
            <meshStandardMaterial color="#f0d28e" roughness={0.48} />
          </mesh>
          <mesh position={[0, 1.7, 1.765]}>
            <boxGeometry args={[3.84, 1.34, 0.06]} />
            <meshStandardMaterial color="#203a50" roughness={0.2} metalness={0.24} />
          </mesh>
          {[-1.9, -0.64, 0.64, 1.9].map((x) => (
            <mesh key={`shop-frame-${x}`} position={[x, 1.7, 1.81]}>
              <boxGeometry args={[0.07, 1.48, 0.1]} />
              <meshStandardMaterial color="#d6dde2" metalness={0.42} roughness={0.35} />
            </mesh>
          ))}
          <mesh position={[0, 2.55, 1.86]} castShadow>
            <boxGeometry args={[3.35, 0.52, 0.18]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.38} />
          </mesh>
        </>
      )}
      {style === "tower" && (
        <mesh position={[0, height + 0.62, 0]}>
          <boxGeometry args={[0.18, 0.9, 0.18]} />
          <meshStandardMaterial color="#d9efff" emissive="#54d8df" emissiveIntensity={0.8} />
        </mesh>
      )}
      {style === "campus" && [-0.8, 0, 0.8].map((x) => (
        <mesh key={`column-${x}`} position={[x, 0.88, 1.49]}>
          <boxGeometry args={[0.14, 1.55, 0.14]} />
          <meshStandardMaterial color="#e5eaf2" />
        </mesh>
      ))}
      {style === "terminal" && (
        <mesh position={[0, height + 0.55, 0]}>
          <boxGeometry args={[1.3, 0.65, 1.3]} />
          <meshStandardMaterial color="#cf5366" emissive="#781f3a" emissiveIntensity={0.3} />
        </mesh>
      )}

      {/* Repeated front and side windows */}
      {style !== "shop" && windows.map(([x, y, z], index) => (
        <mesh key={`window-${index}`} position={[x, y, z]} material={style === "tower" ? windowMaterials.cool : windowMaterials.warm}>
          <boxGeometry args={[x === 1.43 ? 0.045 : 0.48, 0.62, z === 1.43 ? 0.045 : 0.48]} />
        </mesh>
      ))}

      {/* Glass entrance and sign */}
      <mesh position={[0, 0.82, style === "shop" ? 1.79 : 1.45]}>
        <boxGeometry args={style === "shop" ? [0.58, 1.52, 0.08] : [0.58, 1.45, 0.07]} />
        <meshStandardMaterial color="#1b2b40" emissive="#263d58" emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}

function BackgroundBuilding({ building }) {
  return (
    <group position={[building.x, 0, building.z]}>
      <mesh position={[0, building.height / 2, 0]}>
        <boxGeometry args={[building.width, building.height, building.depth]} />
        <meshStandardMaterial color={building.color} roughness={0.9} />
      </mesh>
      {Array.from({ length: Math.floor(building.height / 2) }).map((_, floor) => (
        <mesh key={floor} position={[0, 1 + floor * 2, building.depth / 2 + 0.015]} material={windowMaterials.skyline}>
          <boxGeometry args={[building.width * 0.64, 0.55, 0.03]} />
        </mesh>
      ))}
    </group>
  );
}

function NavigationRoute({ points }) {
  const dashes = [];
  for (let segment = 1; segment < points.length; segment += 1) {
    const [startX, startZ] = points[segment - 1];
    const [endX, endZ] = points[segment];
    const deltaX = endX - startX;
    const deltaZ = endZ - startZ;
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance < 1) continue;
    const dashLength = 0.9;
    const gap = 1.55;
    const alongX = Math.abs(deltaX) >= Math.abs(deltaZ);
    for (let offset = 0.5; offset < distance - 0.35; offset += dashLength + gap) {
      const progress = Math.min(1, offset / distance);
      dashes.push({
        key: `${segment}-${offset.toFixed(1)}`,
        x: startX + deltaX * progress,
        z: startZ + deltaZ * progress,
        alongX,
      });
    }
  }
  return <group>{dashes.map((dash) => (
    <mesh key={dash.key} position={[dash.x, 0.055, dash.z]}>
      <boxGeometry args={dash.alongX ? [0.9, 0.045, 0.2] : [0.2, 0.045, 0.9]} />
      <meshBasicMaterial color="#ffd45e" toneMapped={false} />
    </mesh>
  ))}</group>;
}

function Tree({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.13, 0.2, 1.6, 7]} />
        <meshStandardMaterial color="#684b3d" />
      </mesh>
      <mesh position={[0, 1.85, 0]}>
        <coneGeometry args={[1.05, 2.25, 7]} />
        <meshStandardMaterial color="#2e775b" roughness={0.95} />
      </mesh>
      <mesh position={[0, 2.65, 0]}>
        <coneGeometry args={[0.72, 1.65, 7]} />
        <meshStandardMaterial color="#3a9167" roughness={0.95} />
      </mesh>
    </group>
  );
}

function Waterfront() {
  const waves = useRef(null);
  useFrame(({ clock }) => {
    if (waves.current) waves.current.children.forEach((wave, index) => {
      wave.position.y = -0.39 + Math.sin(clock.elapsedTime * 1.4 + index) * 0.012;
      wave.material.opacity = 0.18 + Math.sin(clock.elapsedTime * 1.7 + index) * 0.06;
    });
  });
  return (
    <group>
      {/* The city is an island: one continuous ocean plane remains visible beyond every shore. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.48, 0]} receiveShadow>
        <planeGeometry args={[520, 520, 1, 1]} />
        <meshStandardMaterial color="#176b8a" roughness={0.24} metalness={0.12} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.205, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#78906e" roughness={0.96} />
      </mesh>
      {/* Pale sand beaches make the boundary readable on all four sides. */}
      {[
        { p: [0, -0.18, -48.5], s: [100, 0.06, 3] }, { p: [0, -0.18, 48.5], s: [100, 0.06, 3] },
        { p: [-48.5, -0.18, 0], s: [3, 0.06, 100] }, { p: [48.5, -0.18, 0], s: [3, 0.06, 100] },
      ].map((shore, index) => <mesh key={`shore-${index}`} position={shore.p} receiveShadow><boxGeometry args={shore.s} /><meshStandardMaterial color="#d6c18e" roughness={0.92} /></mesh>)}
      <group position={[2.55, -0.18, -50.7]}>
        <mesh position={[0, 0, -1.8]} receiveShadow><boxGeometry args={[1.8, 0.22, 10.4]} /><meshStandardMaterial color="#775538" roughness={0.82} /></mesh>
        {Array.from({ length: 12 }, (_, index) => <mesh key={`dock-plank-${index}`} position={[0, 0.12, -6.6 + index * 0.86]}><boxGeometry args={[1.88, 0.035, 0.07]} /><meshStandardMaterial color="#c39868" roughness={0.78} /></mesh>)}
        {[-0.74, 0.74].map((x) => [-5.8, -2.5, 0.9, 4.2].map((z) => <mesh key={`dock-post-${x}-${z}`} position={[x, -0.2, z]}><cylinderGeometry args={[0.09, 0.12, 0.85, 8]} /><meshStandardMaterial color="#62462f" roughness={0.9} /></mesh>))}
        <Billboard position={[0, 0.9, 3.5]}><Text fontSize={0.24} color="#fff4d5" outlineWidth={0.03} outlineColor="#27384a" anchorX="center">VISWA MARINA · YACHT</Text></Billboard>
      </group>
      <group ref={waves}>
        {Array.from({ length: 10 }, (_, index) => {
          const offset = -45 + index * 10;
          return [
            <mesh key={`west-${index}`} position={[-53, -0.39, offset]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.12, 6]} /><meshBasicMaterial color="#a9f0ef" transparent opacity={0.2} depthWrite={false} /></mesh>,
            <mesh key={`east-${index}`} position={[53, -0.39, offset]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.12, 6]} /><meshBasicMaterial color="#a9f0ef" transparent opacity={0.2} depthWrite={false} /></mesh>,
            <mesh key={`north-${index}`} position={[offset, -0.39, -53]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[6, 0.12]} /><meshBasicMaterial color="#a9f0ef" transparent opacity={0.2} depthWrite={false} /></mesh>,
            <mesh key={`south-${index}`} position={[offset, -0.39, 53]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[6, 0.12]} /><meshBasicMaterial color="#a9f0ef" transparent opacity={0.2} depthWrite={false} /></mesh>,
          ];
        })}
      </group>
    </group>
  );
}

function FishingPond() {
  const water = useRef(null);
  useFrame(({ clock }) => { if (water.current) water.current.scale.set(1 + Math.sin(clock.elapsedTime * 1.2) * 0.008, 1, 1 + Math.cos(clock.elapsedTime * 1.1) * 0.008); });
  return (
    <group position={fishingPondPosition}>
      <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><cylinderGeometry args={[3.05, 3.05, 0.12, 48]} /><meshStandardMaterial color="#bca77d" roughness={0.95} /></mesh>
      <mesh ref={water} position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[2.68, 48]} /><meshPhysicalMaterial color="#248aa2" roughness={0.18} metalness={0.16} clearcoat={0.9} clearcoatRoughness={0.12} /></mesh>
      {[0, 1, 2, 3].map((index) => <mesh key={`lily-${index}`} position={[(index - 1.5) * 0.72, 0.035, Math.sin(index * 2) * 0.75]} rotation={[-Math.PI / 2, 0, index]}><circleGeometry args={[0.22, 12]} /><meshStandardMaterial color={index % 2 ? "#69a56e" : "#82b778"} side={2} /></mesh>)}
      {[-1.1, 1.15].map((x) => <group key={`reed-${x}`} position={[x, 0, -2.72]}>{[0, 1, 2].map((n) => <mesh key={n} position={[(n - 1) * 0.18, 0.42 + n * 0.08, 0]} rotation={[0, 0, (n - 1) * 0.12]}><cylinderGeometry args={[0.025, 0.035, 0.9, 7]} /><meshStandardMaterial color="#598253" /></mesh>)}</group>)}
      <group position={[2.8, 0, 1.8]} rotation={[0, -0.8, 0]}>
        <mesh position={[0, 0.16, 0]}><boxGeometry args={[1.5, 0.18, 2.1]} /><meshStandardMaterial color="#95623e" roughness={0.78} /></mesh>
        {[-0.62, -0.2, 0.2, 0.62].map((x) => <mesh key={x} position={[x, 0.17, 0]}><boxGeometry args={[0.035, 0.19, 2.1]} /><meshStandardMaterial color="#d0a16d" /></mesh>)}
      </group>
      <Billboard position={[0, 1.7, 0]}><Text fontSize={0.45} color="#f4fbff" outlineWidth={0.025} outlineColor="#153346" anchorX="center">FISHING POND</Text></Billboard>
    </group>
  );
}

function ResidentialHome({ home }) {
  const isVilla = home.type === "villa";
  const isTownhome = home.type === "townhome";
  const isChalet = home.type === "chalet";
  const isBungalow = home.type === "bungalow";
  const isCottage = !isVilla && !isTownhome && !isChalet && !isBungalow;

  const w = home.width ?? 2.4;
  const d = home.depth ?? 2.4;
  const wallH = isVilla ? 2.9 : isTownhome ? 2.5 : isBungalow ? 1.85 : (home.height ?? 2.1);
  const rotY = home.rotationY ?? 0;
  const yardW = w + 1.2;
  const yardD = d + 1.2;
  const yardColor = home.yardColor || "#63805c";

  return (
    <group position={home.position} rotation={[0, rotY, 0]}>
      {/* Manicured green yard foundation */}
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[yardW, 0.08, yardD]} />
        <meshStandardMaterial color={yardColor} roughness={0.96} />
      </mesh>

      {/* Front stone garden path connecting toward the sidewalk */}
      <mesh position={[0, 0.045, d / 2 + 0.42]} receiveShadow>
        <boxGeometry args={[0.65, 0.02, 0.85]} />
        <meshStandardMaterial color="#b6ada2" roughness={0.92} />
      </mesh>

      {/* Low front hedge or decorative border */}
      <mesh position={[-w / 2 - 0.25, 0.16, d / 2 + 0.4]} castShadow>
        <boxGeometry args={[0.22, 0.24, 0.7]} />
        <meshStandardMaterial color="#446e3e" roughness={0.95} />
      </mesh>
      <mesh position={[w / 2 + 0.25, 0.16, d / 2 + 0.4]} castShadow>
        <boxGeometry args={[0.22, 0.24, 0.7]} />
        <meshStandardMaterial color="#446e3e" roughness={0.95} />
      </mesh>

      {/* Main building body */}
      <mesh position={[0, wallH / 2 + 0.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, wallH, d]} />
        <meshStandardMaterial color={home.color} roughness={0.78} />
      </mesh>

      {/* Roof & architectural details according to style */}
      {isVilla && (
        <>
          <mesh position={[0, wallH + 0.18, 0]} castShadow>
            <boxGeometry args={[w + 0.4, 0.26, d + 0.4]} />
            <meshStandardMaterial color={home.roof} roughness={0.62} />
          </mesh>
          <mesh position={[0, 1.63, d / 2 + 0.025]}>
            <boxGeometry args={[w - 1.1, 1.5, 0.08]} />
            <meshPhysicalMaterial color="#8bc6d1" roughness={0.15} metalness={0.18} />
          </mesh>
          <mesh position={[0, 1.65, d / 2 + 0.08]}>
            <boxGeometry args={[0.1, 1.62, 0.12]} />
            <meshStandardMaterial color="#354b58" metalness={0.44} roughness={0.35} />
          </mesh>
          <mesh position={[0, 3.05, d / 2 + 0.58]} castShadow>
            <boxGeometry args={[2.9, 0.12, 1.1]} />
            <meshStandardMaterial color="#d5d9d2" roughness={0.65} />
          </mesh>
          <Billboard position={[0, wallH + 0.7, 0]}>
            <Text fontSize={0.28} color="#fffaf0" outlineWidth={0.02} outlineColor="#253347" anchorX="center">SEASIDE VILLA</Text>
          </Billboard>
        </>
      )}

      {isTownhome && (
        <>
          {/* 2-story parapet cornice trim */}
          <mesh position={[0, wallH + 0.14, 0]} castShadow>
            <boxGeometry args={[w + 0.25, 0.24, d + 0.25]} />
            <meshStandardMaterial color={home.roof} roughness={0.58} />
          </mesh>
          {/* Second floor double window with night glow */}
          <mesh position={[-0.45, wallH - 0.55, d / 2 + 0.025]} material={windowMaterials.warm}>
            <boxGeometry args={[0.42, 0.55, 0.05]} />
          </mesh>
          <mesh position={[0.45, wallH - 0.55, d / 2 + 0.025]} material={windowMaterials.warm}>
            <boxGeometry args={[0.42, 0.55, 0.05]} />
          </mesh>
          {/* Ground floor window */}
          <mesh position={[-0.45, 0.9, d / 2 + 0.025]} material={windowMaterials.warm}>
            <boxGeometry args={[0.45, 0.65, 0.05]} />
          </mesh>
          {/* Front townhome door with arch transom */}
          <mesh position={[0.45, 0.75, d / 2 + 0.03]}>
            <boxGeometry args={[0.42, 1.35, 0.06]} />
            <meshStandardMaterial color="#483329" roughness={0.7} />
          </mesh>
          <mesh position={[0.45, 1.5, d / 2 + 0.04]}>
            <boxGeometry args={[0.52, 0.1, 0.12]} />
            <meshStandardMaterial color="#d3d9df" roughness={0.6} />
          </mesh>
          {/* Side window */}
          <mesh position={[w / 2 + 0.025, 1.4, 0]} material={windowMaterials.cool}>
            <boxGeometry args={[0.05, 0.65, 0.55]} />
          </mesh>
        </>
      )}

      {isChalet && (
        <>
          {/* Steep peaked alpine 4-slope roof */}
          <mesh position={[0, wallH + 0.72, 0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
            <coneGeometry args={[Math.max(w, d) * 0.82, 1.55, 4]} />
            <meshStandardMaterial color={home.roof} roughness={0.72} />
          </mesh>
          {/* Eaves bargeboard trim */}
          <mesh position={[0, wallH + 0.06, 0]} castShadow>
            <boxGeometry args={[w + 0.28, 0.1, d + 0.28]} />
            <meshStandardMaterial color="#f0ede6" roughness={0.8} />
          </mesh>
          {/* Warm front window pair */}
          <mesh position={[-0.45, 1.1, d / 2 + 0.025]} material={windowMaterials.warm}>
            <boxGeometry args={[0.55, 0.65, 0.05]} />
          </mesh>
          {/* Front door */}
          <mesh position={[0.45, 0.75, d / 2 + 0.03]}>
            <boxGeometry args={[0.4, 1.35, 0.06]} />
            <meshStandardMaterial color="#553828" roughness={0.75} />
          </mesh>
          {/* Balcony rail accent */}
          <mesh position={[0, 1.7, d / 2 + 0.12]}>
            <boxGeometry args={[w - 0.7, 0.06, 0.16]} />
            <meshStandardMaterial color="#e8e4db" roughness={0.8} />
          </mesh>
        </>
      )}

      {isBungalow && (
        <>
          {/* Low-pitch hipped roof */}
          <mesh position={[0, wallH + 0.44, 0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
            <coneGeometry args={[Math.max(w, d) * 0.85, 1.05, 4]} />
            <meshStandardMaterial color={home.roof} roughness={0.76} />
          </mesh>
          {/* Front covered porch canopy */}
          <mesh position={[0, 1.45, d / 2 + 0.35]} castShadow>
            <boxGeometry args={[1.5, 0.08, 0.75]} />
            <meshStandardMaterial color={home.roof} roughness={0.72} />
          </mesh>
          {/* Porch support posts */}
          <mesh position={[-0.65, 0.72, d / 2 + 0.65]}>
            <boxGeometry args={[0.07, 1.4, 0.07]} />
            <meshStandardMaterial color="#e8ecee" roughness={0.75} />
          </mesh>
          <mesh position={[0.65, 0.72, d / 2 + 0.65]}>
            <boxGeometry args={[0.07, 1.4, 0.07]} />
            <meshStandardMaterial color="#e8ecee" roughness={0.75} />
          </mesh>
          {/* Front door & wide garden window */}
          <mesh position={[0.2, 0.75, d / 2 + 0.03]}>
            <boxGeometry args={[0.42, 1.35, 0.06]} />
            <meshStandardMaterial color="#4c3426" roughness={0.7} />
          </mesh>
          <mesh position={[-0.55, 0.95, d / 2 + 0.025]} material={windowMaterials.warm}>
            <boxGeometry args={[0.7, 0.65, 0.05]} />
          </mesh>
        </>
      )}

      {isCottage && (
        <>
          {/* Classic cottage gabled hip roof */}
          <mesh position={[0, wallH + 0.56, 0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
            <coneGeometry args={[Math.max(w, d) * 0.78, 1.35, 4]} />
            <meshStandardMaterial color={home.roof} roughness={0.78} />
          </mesh>
          {/* Roof trim fascia */}
          <mesh position={[0, wallH + 0.05, 0]} castShadow>
            <boxGeometry args={[w + 0.22, 0.08, d + 0.22]} />
            <meshStandardMaterial color="#f0ede6" roughness={0.82} />
          </mesh>
          {/* Glowing front window */}
          <mesh position={[-0.45, 1.05, d / 2 + 0.025]} material={windowMaterials.warm}>
            <boxGeometry args={[0.55, 0.65, 0.05]} />
          </mesh>
          {/* Front door */}
          <mesh position={[0.45, 0.75, d / 2 + 0.03]}>
            <boxGeometry args={[0.4, 1.35, 0.06]} />
            <meshStandardMaterial color="#533727" roughness={0.75} />
          </mesh>
          {/* Flower box under window */}
          <mesh position={[-0.45, 0.66, d / 2 + 0.1]}>
            <boxGeometry args={[0.55, 0.12, 0.14]} />
            <meshStandardMaterial color="#7a4b33" roughness={0.85} />
          </mesh>
          <mesh position={[-0.45, 0.75, d / 2 + 0.1]}>
            <boxGeometry args={[0.5, 0.08, 0.1]} />
            <meshStandardMaterial color="#e05845" roughness={0.9} />
          </mesh>
        </>
      )}

      {/* Chimney on cottages, chalets, and select townhomes */}
      {(home.chimney || isCottage || isChalet) && (
        <group position={[-w * 0.28, wallH + 0.68, -d * 0.1]}>
          <mesh castShadow>
            <boxGeometry args={[0.38, 0.95, 0.38]} />
            <meshStandardMaterial color="#8a4437" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.52, 0]}>
            <boxGeometry args={[0.46, 0.08, 0.46]} />
            <meshStandardMaterial color="#424c56" roughness={0.75} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function WalkingTrail() {
  return (
    <group>
      <mesh position={[5, -0.165, 5]} receiveShadow>
        <boxGeometry args={[6.15, 0.07, 6.15]} />
        <meshStandardMaterial color="#65836c" roughness={0.98} />
      </mesh>
      {walkingSegments.map(({ start, end, length }, index) => {
        const dx = end[0] - start[0];
        const dz = end[1] - start[1];
        const angle = Math.atan2(dx, dz);
        return (
          <mesh key={`trail-${index}`} position={[(start[0] + end[0]) / 2, -0.105, (start[1] + end[1]) / 2]} rotation={[0, angle, 0]} receiveShadow>
            <boxGeometry args={[0.88, 0.055, length + 0.06]} />
            <meshStandardMaterial color="#c6bda7" roughness={0.94} />
          </mesh>
        );
      })}
      <mesh position={[5, -0.115, 5]} receiveShadow>
        <boxGeometry args={[4.05, 0.045, 4.05]} />
        <meshStandardMaterial color="#c8aa79" roughness={0.96} />
      </mesh>
    </group>
  );
}

function Playground() {
  const swing = useRef(null);
  const spinner = useRef(null);
  useFrame(({ clock }) => {
    if (swing.current) swing.current.rotation.x = Math.sin(clock.elapsedTime * 2.15) * 0.3;
    if (spinner.current) spinner.current.rotation.y = clock.elapsedTime * 0.72;
  });

  return (
    <group position={[5, 0, 5]}>
      {/* Swing frame with a gently animated seat and child rider */}
      {[-1.65, -0.15].flatMap((x) => [-0.98, -0.32].map((z) => (
        <mesh key={`swing-post-${x}-${z}`} position={[x, 1.02, z]} rotation={[0, 0, x < -0.9 ? 0.045 : -0.045]} castShadow>
          <boxGeometry args={[0.11, 2.04, 0.11]} />
          <meshStandardMaterial color="#2b6d9a" metalness={0.2} roughness={0.48} />
        </mesh>
      )))}
      <mesh position={[-0.9, 2.06, -0.65]} castShadow><boxGeometry args={[1.72, 0.14, 0.14]} /><meshStandardMaterial color="#e2673e" metalness={0.18} roughness={0.42} /></mesh>
      <group ref={swing} position={[-0.9, 2, -0.65]}>
        {[-0.24, 0.24].map((x) => <mesh key={`chain-${x}`} position={[x, -0.52, 0]}><cylinderGeometry args={[0.018, 0.018, 1.04, 7]} /><meshStandardMaterial color="#d8e0e8" metalness={0.78} roughness={0.27} /></mesh>)}
        <mesh position={[0, -1.08, 0]} castShadow><boxGeometry args={[0.58, 0.12, 0.4]} /><meshStandardMaterial color="#e4b746" roughness={0.56} /></mesh>
        <mesh position={[0, -0.7, 0.02]}><capsuleGeometry args={[0.18, 0.36, 5, 9]} /><meshStandardMaterial color="#4b77c9" roughness={0.82} /></mesh>
        <mesh position={[0, -0.39, -0.01]}><sphereGeometry args={[0.17, 12, 10]} /><meshStandardMaterial color="#c78764" roughness={0.78} /></mesh>
        <mesh position={[0, -0.3, 0.035]} scale={[1.08, 0.52, 1.05]}><sphereGeometry args={[0.17, 12, 8]} /><meshStandardMaterial color="#33252a" roughness={0.9} /></mesh>
      </group>

      {/* Bright slide and a small ladder */}
      <mesh position={[0.95, 1.13, -0.83]} castShadow><boxGeometry args={[0.82, 0.16, 0.8]} /><meshStandardMaterial color="#e8b744" roughness={0.5} /></mesh>
      {[-0.34, 0.34].map((x) => <mesh key={`slide-leg-${x}`} position={[0.95 + x, 0.56, -0.82]}><boxGeometry args={[0.08, 1.14, 0.08]} /><meshStandardMaterial color="#3184a8" metalness={0.22} roughness={0.46} /></mesh>)}
      <mesh position={[0.95, 0.66, -0.16]} rotation={[0.55, 0, 0]} castShadow><boxGeometry args={[0.68, 0.09, 1.48]} /><meshStandardMaterial color="#e26b42" metalness={0.15} roughness={0.38} /></mesh>
      {[-0.12, 0.12].map((x) => <mesh key={`ladder-rail-${x}`} position={[0.95 + x, 0.62, -1.15]} rotation={[-0.22, 0, 0]}><cylinderGeometry args={[0.035, 0.035, 1.15, 8]} /><meshStandardMaterial color="#d4e1e8" metalness={0.72} roughness={0.3} /></mesh>)}
      {Array.from({ length: 5 }, (_, index) => <mesh key={`ladder-step-${index}`} position={[0.95, 0.22 + index * 0.2, -1.32 + index * 0.12]}><boxGeometry args={[0.42, 0.045, 0.06]} /><meshStandardMaterial color="#f1c957" roughness={0.5} /></mesh>)}

      {/* Spinning roundabout */}
      <group ref={spinner} position={[0.12, 0.08, 1.02]}>
        <mesh position={[0, 0.18, 0]} castShadow><cylinderGeometry args={[0.69, 0.69, 0.14, 24]} /><meshStandardMaterial color="#2c7fa0" metalness={0.24} roughness={0.4} /></mesh>
        <mesh position={[0, 0.47, 0]}><cylinderGeometry args={[0.09, 0.12, 0.58, 12]} /><meshStandardMaterial color="#e8b744" metalness={0.3} roughness={0.4} /></mesh>
        <mesh position={[0, 0.72, 0]}><sphereGeometry args={[0.15, 12, 10]} /><meshStandardMaterial color="#e16b45" roughness={0.5} /></mesh>
        {[0, 1, 2, 3].map((seat) => <group key={`carousel-seat-${seat}`} rotation={[0, seat * Math.PI / 2, 0]}>
          <mesh position={[0, 0.3, 0.49]}><cylinderGeometry args={[0.025, 0.025, 0.42, 8]} /><meshStandardMaterial color="#dce4eb" metalness={0.72} /></mesh>
          <mesh position={[0, 0.1, 0.63]}><boxGeometry args={[0.38, 0.1, 0.32]} /><meshStandardMaterial color={seat % 2 ? "#e26b42" : "#e8b744"} roughness={0.5} /></mesh>
        </group>)}
      </group>
      <Billboard position={[0, 2.82, -2.52]} follow>
        <Text fontSize={0.24} color="#fff4d4" outlineWidth={0.012} outlineColor="#293b34" anchorX="center" anchorY="middle">PLAYGROUND</Text>
      </Billboard>
    </group>
  );
}

function BroadleafTree({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.9, 0]}><cylinderGeometry args={[0.14, 0.22, 1.8, 8]} /><meshStandardMaterial color="#6f4d39" /></mesh>
      {[[0, 2.05, 0, 1.15], [-0.58, 1.95, 0.12, 0.72], [0.55, 2.12, -0.08, 0.78], [0, 2.75, 0, 0.78]].map(([x, y, z, radius], index) => (
        <mesh key={index} position={[x, y, z]} scale={[1, 0.82, 0.94]}><sphereGeometry args={[radius, 10, 9]} /><meshStandardMaterial color={index % 2 ? "#4b9363" : "#377e55"} roughness={0.95} /></mesh>
      ))}
    </group>
  );
}

function Person({ position, outfit, phase }) {
  const figure = useRef(null);
  const leftArm = useRef(null);
  const rightArm = useRef(null);
  const leftLeg = useRef(null);
  const rightLeg = useRef(null);
  useFrame(({ clock }) => {
    const time = clock.elapsedTime * 5.5 + phase;
    const routePosition = sampleWalkingLoop(clock.elapsedTime * 0.8 + phase);
    if (figure.current) {
      figure.current.position.set(routePosition.x, Math.abs(Math.sin(time * 1.45)) * 0.025, routePosition.z);
      figure.current.rotation.y = Math.atan2(-routePosition.dx, -routePosition.dz);
    }
    const gait = Math.sin(time * 8) * 0.42;
    if (leftArm.current) leftArm.current.rotation.x = gait;
    if (rightArm.current) rightArm.current.rotation.x = -gait;
    if (leftLeg.current) leftLeg.current.rotation.x = -gait;
    if (rightLeg.current) rightLeg.current.rotation.x = gait;
  });
  return (
    <group ref={figure} position={position}>
      <mesh position={[0, 0.93, 0]}><capsuleGeometry args={[0.23, 0.55, 5, 10]} /><meshStandardMaterial color={outfit} roughness={0.8} /></mesh>
      <mesh position={[0, 1.48, 0]}><sphereGeometry args={[0.2, 14, 12]} /><meshStandardMaterial color="#b8795b" roughness={0.78} /></mesh>
      <mesh position={[0, 1.59, 0.025]} scale={[1.03, 0.62, 1.04]}><sphereGeometry args={[0.2, 12, 9]} /><meshStandardMaterial color="#20202a" roughness={0.95} /></mesh>
      {[-1, 1].map((side) => <mesh key={`eye-${side}`} position={[side * 0.065, 1.49, -0.18]}><sphereGeometry args={[0.022, 8, 8]} /><meshStandardMaterial color="#242029" /></mesh>)}
      <group ref={leftArm} position={[-0.29, 1.05, 0]}><mesh position={[0, -0.2, 0]}><capsuleGeometry args={[0.07, 0.4, 4, 8]} /><meshStandardMaterial color={outfit} /></mesh></group>
      <group ref={rightArm} position={[0.29, 1.05, 0]}><mesh position={[0, -0.2, 0]}><capsuleGeometry args={[0.07, 0.4, 4, 8]} /><meshStandardMaterial color={outfit} /></mesh></group>
      <group ref={leftLeg} position={[-0.12, 0.48, 0]}><mesh position={[0, -0.17, 0]}><capsuleGeometry args={[0.08, 0.38, 4, 8]} /><meshStandardMaterial color="#252b38" /></mesh></group>
      <group ref={rightLeg} position={[0.12, 0.48, 0]}><mesh position={[0, -0.17, 0]}><capsuleGeometry args={[0.08, 0.38, 4, 8]} /><meshStandardMaterial color="#252b38" /></mesh></group>
    </group>
  );
}

function Dog({ position, coat, phase }) {
  const dog = useRef(null);
  const tail = useRef(null);
  const legs = useRef([]);
  useFrame(({ clock }) => {
    const time = clock.elapsedTime * 3.2 + phase;
    const routePosition = sampleWalkingLoop(clock.elapsedTime * 0.8 + phase);
    if (dog.current) {
      dog.current.position.set(routePosition.x, 0, routePosition.z);
      dog.current.rotation.y = Math.atan2(-routePosition.dx, -routePosition.dz);
    }
    if (tail.current) tail.current.rotation.y = Math.sin(time * 1.5) * 0.45;
    legs.current.forEach((leg, index) => { if (leg) leg.rotation.x = Math.sin(time * 2 + (index % 2) * Math.PI) * 0.28; });
  });
  return (
    <group ref={dog} position={position}>
      <mesh position={[0, 0.38, 0]} scale={[0.34, 0.27, 0.62]}><sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color={coat} roughness={0.88} /></mesh>
      <mesh position={[0, 0.48, -0.48]} scale={[0.28, 0.25, 0.3]}><sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color={coat} roughness={0.88} /></mesh>
      {[-0.21, 0.21].map((x, xIndex) => [-0.33, 0.32].map((z, zIndex) => <mesh key={`${x}-${z}`} ref={(node) => { legs.current[xIndex * 2 + zIndex] = node; }} position={[x, 0.16, z]}><capsuleGeometry args={[0.07, 0.18, 4, 7]} /><meshStandardMaterial color={coat} /></mesh>))}
      <mesh ref={tail} position={[0, 0.48, 0.55]} rotation={[0.4, 0, 0]}><cylinderGeometry args={[0.045, 0.08, 0.38, 7]} /><meshStandardMaterial color={coat} /></mesh>
    </group>
  );
}

function StreetLight({ position }) {
  const lampLight = useRef();
  useFrame(() => { if (lampLight.current) lampLight.current.intensity = 0.25 + atmo.night * 2.6; });
  return (
    <group position={position}>
      <mesh position={[0, 2.05, 0]}>
        <cylinderGeometry args={[0.055, 0.09, 4.1, 8]} />
        <meshStandardMaterial color="#35465d" metalness={0.55} roughness={0.5} />
      </mesh>
      <mesh position={[0.42, 4.04, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.9, 8]} />
        <meshStandardMaterial color="#35465d" metalness={0.55} roughness={0.5} />
      </mesh>
      <mesh position={[0.78, 3.95, 0]} material={lampMaterial}>
        <boxGeometry args={[0.52, 0.16, 0.28]} />
      </mesh>
      <pointLight ref={lampLight} position={[0.78, 3.72, 0]} color="#ffd98a" intensity={0.25} distance={9} decay={2} />
    </group>
  );
}

function Car({ occupied = false, color = "#e4a927", jacket = "#172843", speed = 0 }) {
  const wheels = useRef([]);
  useFrame((_, delta) => {
    const spin = speed * delta * 0.085;
    wheels.current.forEach((wheel) => { if (wheel) wheel.rotation.x -= spin; });
  });

  return (
    <group>
      {/* Sculpted compact sport body with a low roof and distinct hood/trunk. */}
      <RoundedBox args={[1.52, 0.42, 2.64]} radius={0.14} smoothness={3} position={[0, 0.47, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color={color} metalness={0.58} roughness={0.27} clearcoat={0.85} clearcoatRoughness={0.2} />
      </RoundedBox>
      <RoundedBox args={[1.28, 0.19, 0.72]} radius={0.09} smoothness={3} position={[0, 0.68, -0.78]} castShadow>
        <meshPhysicalMaterial color={color} metalness={0.55} roughness={0.25} clearcoat={0.9} />
      </RoundedBox>
      <RoundedBox args={[1.26, 0.16, 0.48]} radius={0.07} smoothness={3} position={[0, 0.67, 0.98]} castShadow>
        <meshPhysicalMaterial color={color} metalness={0.55} roughness={0.27} clearcoat={0.8} />
      </RoundedBox>
      {/* Cabin glass and roof */}
      <RoundedBox args={[1.1, 0.5, 1.12]} radius={0.11} smoothness={3} position={[0, 0.88, 0.04]}>
        <meshPhysicalMaterial color="#142b43" metalness={0.38} roughness={0.16} clearcoat={1} clearcoatRoughness={0.08} />
      </RoundedBox>
      <RoundedBox args={[0.94, 0.09, 0.76]} radius={0.06} smoothness={3} position={[0, 1.16, 0.04]} castShadow>
        <meshPhysicalMaterial color={color} metalness={0.58} roughness={0.23} clearcoat={0.9} />
      </RoundedBox>
      {/* Side window highlights and beltline trim */}
      {[-1, 1].map((side) => (
        <group key={`side-${side}`}>
          <mesh position={[side * 0.57, 0.91, -0.25]}><boxGeometry args={[0.025, 0.27, 0.43]} /><meshStandardMaterial color="#6ea6c6" metalness={0.5} roughness={0.22} /></mesh>
          <mesh position={[side * 0.57, 0.91, 0.27]}><boxGeometry args={[0.025, 0.27, 0.43]} /><meshStandardMaterial color="#6ea6c6" metalness={0.5} roughness={0.22} /></mesh>
          <mesh position={[side * 0.765, 0.46, 0.08]}><boxGeometry args={[0.025, 0.045, 1.25]} /><meshStandardMaterial color="#d9e0e8" metalness={0.7} roughness={0.28} /></mesh>
          <mesh position={[side * 0.78, 0.74, -0.49]}><boxGeometry args={[0.19, 0.12, 0.16]} /><meshStandardMaterial color={color} metalness={0.55} roughness={0.26} /></mesh>
          <mesh position={[side * 0.87, 0.75, -0.49]}><boxGeometry args={[0.12, 0.1, 0.13]} /><meshStandardMaterial color="#172538" metalness={0.65} roughness={0.2} /></mesh>
          <mesh position={[side * 0.78, 0.57, -0.26]}><boxGeometry args={[0.035, 0.045, 0.16]} /><meshStandardMaterial color="#f1d785" metalness={0.65} roughness={0.25} /></mesh>
        </group>
      ))}
      {/* Front grille, sculpted bumpers and lights */}
      <RoundedBox args={[0.62, 0.16, 0.08]} radius={0.035} smoothness={3} position={[0, 0.39, -1.34]}>
        <meshStandardMaterial color="#111923" metalness={0.6} roughness={0.32} />
      </RoundedBox>
      <mesh position={[0, 0.34, -1.32]}><boxGeometry args={[1.35, 0.08, 0.12]} /><meshStandardMaterial color="#263344" metalness={0.55} roughness={0.32} /></mesh>
      <mesh position={[0, 0.33, 1.32]}><boxGeometry args={[1.35, 0.09, 0.12]} /><meshStandardMaterial color="#263344" metalness={0.55} roughness={0.32} /></mesh>
      {[-0.52, 0.52].map((x) => (
        <group key={`lamps-${x}`}>
          <RoundedBox args={[0.3, 0.13, 0.055]} radius={0.045} smoothness={3} position={[x, 0.57, -1.33]}>
            <meshStandardMaterial color="#fff3cd" emissive="#ffd36e" emissiveIntensity={1.25} metalness={0.15} roughness={0.2} />
          </RoundedBox>
          <mesh position={[x, 0.5, 1.33]}><boxGeometry args={[0.28, 0.13, 0.055]} /><meshStandardMaterial color="#df344a" emissive="#ad1026" emissiveIntensity={0.65} roughness={0.3} /></mesh>
          <mesh position={[x, 0.44, -1.35]}><boxGeometry args={[0.2, 0.035, 0.035]} /><meshStandardMaterial color="#f3c64e" emissive="#f1b52e" emissiveIntensity={0.8} /></mesh>
        </group>
      ))}
      {/* Sport wheels with alloy hubs */}
      {[-0.79, 0.79].flatMap((x, side) => [-0.83, 0.83].map((z, end) => {
        const index = side * 2 + end;
        return (
          <group key={`wheel-${index}`} ref={(node) => { wheels.current[index] = node; }} position={[x, 0.31, z]}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.3, 0.3, 0.2, 20]} /><meshStandardMaterial color="#11161d" roughness={0.9} /></mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.18, 0.18, 0.205, 16]} /><meshStandardMaterial color="#a9b5c2" metalness={0.78} roughness={0.25} /></mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.07, 0.07, 0.215, 12]} /><meshStandardMaterial color="#303d4d" metalness={0.7} roughness={0.28} /></mesh>
          </group>
        );
      }))}
      {/* Viswa's driver avatar */}
      <group visible={occupied} position={[0, 0, 0.08]}>
        <mesh position={[0, 0.98, 0.1]}><boxGeometry args={[0.46, 0.46, 0.32]} /><meshStandardMaterial color={jacket} roughness={0.76} /></mesh>
        <mesh position={[0, 1.34, 0.05]} scale={[0.24, 0.29, 0.22]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color="#a86648" roughness={0.72} /></mesh>
        <mesh position={[0, 1.49, 0.09]} scale={[0.25, 0.18, 0.23]}><sphereGeometry args={[1, 16, 10]} /><meshStandardMaterial color="#171820" roughness={0.92} /></mesh>
        <mesh position={[-0.075, 1.36, -0.153]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#171820" /></mesh>
        <mesh position={[0.075, 1.36, -0.153]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#171820" /></mesh>
      </group>
      <mesh position={[0, 0.53, -0.87]}>
        <boxGeometry args={[1.24, 0.12, 0.45]} />
        <meshStandardMaterial color="#f8d66c" />
      </mesh>
      {[-0.48, 0.48].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.49, -1.25]}>
            <boxGeometry args={[0.25, 0.13, 0.06]} />
            <meshStandardMaterial color="#fff4c2" emissive="#ffc83d" emissiveIntensity={1.4} />
          </mesh>
          <mesh position={[x, 0.48, 1.26]}>
            <boxGeometry args={[0.25, 0.14, 0.06]} />
            <meshStandardMaterial color="#ff4b57" emissive="#b41f2c" emissiveIntensity={0.8} />
          </mesh>
        </group>
      ))}
      {[-0.78, 0.78].flatMap((x) =>
        [-0.82, 0.82].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.28, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.29, 0.29, 0.18, 16]} />
            <meshStandardMaterial color="#15191f" roughness={0.88} />
          </mesh>
        ))
      )}
    </group>
  );
}

function Bike({ occupied = false, color, jacket = "#172843", speed = 0 }) {
  const wheels = useRef([]);
  useFrame((_, delta) => {
    const spin = speed * delta * 0.09;
    wheels.current.forEach((wheel) => { if (wheel) wheel.rotation.x -= spin; });
  });

  return (
    <group>
      {[[-0.03, 0.42, -1.02], [-0.03, 0.42, 1.02]].map(([x, y, z], index) => (
        <group key={index} ref={(node) => { wheels.current[index] = node; }} position={[x, y, z]}>
          <mesh rotation={[0, Math.PI / 2, 0]} castShadow><torusGeometry args={[0.37, 0.085, 12, 28]} /><meshStandardMaterial color="#11161d" roughness={0.92} /></mesh>
          <mesh rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[0.26, 0.025, 8, 24]} /><meshStandardMaterial color="#b3c0cb" metalness={0.8} roughness={0.22} /></mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.065, 0.065, 0.2, 14]} /><meshStandardMaterial color="#6f8294" metalness={0.78} roughness={0.26} /></mesh>
          {[0, 1, 2, 3, 4, 5].map((spoke) => <mesh key={spoke} rotation={[0, 0, (spoke * Math.PI) / 6]}><cylinderGeometry args={[0.012, 0.012, 0.32, 6]} /><meshStandardMaterial color="#8495a6" metalness={0.75} roughness={0.28} /></mesh>)}
        </group>
      ))}
      {/* Powder-coated frame and sculpted fuel tank */}
      <mesh position={[0, 0.68, 0]} rotation={[0.26, 0, 0]}><cylinderGeometry args={[0.055, 0.06, 1.45, 10]} /><meshStandardMaterial color={color ?? "#d7a52c"} metalness={0.72} roughness={0.28} /></mesh>
      <mesh position={[0, 0.75, -0.43]} rotation={[-0.34, 0, 0]}><cylinderGeometry args={[0.045, 0.05, 0.85, 10]} /><meshStandardMaterial color={color ?? "#d7a52c"} metalness={0.7} roughness={0.28} /></mesh>
      <mesh position={[0, 0.72, 0.48]} rotation={[0.48, 0, 0]}><cylinderGeometry args={[0.045, 0.05, 0.76, 10]} /><meshStandardMaterial color={color ?? "#d7a52c"} metalness={0.7} roughness={0.28} /></mesh>
      <RoundedBox args={[0.46, 0.38, 0.67]} radius={0.16} smoothness={4} position={[0, 0.93, -0.28]} rotation={[-0.12, 0, 0]} castShadow>
        <meshPhysicalMaterial color={color ?? "#2469ad"} metalness={0.58} roughness={0.25} clearcoat={0.9} />
      </RoundedBox>
      <RoundedBox args={[0.48, 0.12, 0.56]} radius={0.06} smoothness={4} position={[0, 0.88, 0.42]}>
        <meshStandardMaterial color="#161d28" roughness={0.42} />
      </RoundedBox>
      <mesh position={[0, 0.59, 0.24]}><boxGeometry args={[0.4, 0.35, 0.34]} /><meshStandardMaterial color="#202b38" metalness={0.5} roughness={0.4} /></mesh>
      <mesh position={[0.2, 0.44, 0.57]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.075, 0.075, 0.64, 10]} /><meshStandardMaterial color="#a8b4bf" metalness={0.8} roughness={0.3} /></mesh>
      {/* Fork, handlebars, mirrors, and lights */}
      {[-0.14, 0.14].map((x) => <mesh key={`fork-${x}`} position={[x, 0.73, -0.83]} rotation={[-0.24, 0, 0]}><cylinderGeometry args={[0.045, 0.055, 0.95, 10]} /><meshStandardMaterial color="#9aa9b7" metalness={0.82} roughness={0.22} /></mesh>)}
      <mesh position={[0, 1.16, -0.75]}><boxGeometry args={[0.8, 0.055, 0.09]} /><meshStandardMaterial color="#242c37" metalness={0.72} roughness={0.25} /></mesh>
      {[-0.43, 0.43].map((x) => <group key={`mirror-${x}`}><mesh position={[x * 0.72, 1.22, -0.72]} rotation={[0.22, 0, x * 0.28]}><cylinderGeometry args={[0.018, 0.018, 0.35, 7]} /><meshStandardMaterial color="#8e9daa" metalness={0.8} /></mesh><mesh position={[x, 1.38, -0.72]}><sphereGeometry args={[0.1, 10, 8]} /><meshStandardMaterial color="#162c42" metalness={0.4} roughness={0.18} /></mesh></group>)}
      <mesh position={[0, 0.93, -1.03]}><sphereGeometry args={[0.16, 16, 12]} /><meshStandardMaterial color="#fff0bd" emissive="#ffc94b" emissiveIntensity={1.5} /></mesh>
      <mesh position={[0, 0.55, 1.08]}><boxGeometry args={[0.22, 0.1, 0.07]} /><meshStandardMaterial color="#eb3c4e" emissive="#a51929" emissiveIntensity={0.7} /></mesh>
      {/* Viswa's rider avatar: dark jacket and curly hair silhouette */}
      <group visible={occupied} position={[0, 0.18, 0.3]} rotation={[0.18, 0, 0]}>
        <mesh position={[0, 0.84, 0.08]} rotation={[0.15, 0, 0]}><capsuleGeometry args={[0.24, 0.52, 5, 10]} /><meshStandardMaterial color={jacket} roughness={0.72} /></mesh>
        <mesh position={[0, 1.3, -0.02]} scale={[0.2, 0.23, 0.2]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color="#a86648" roughness={0.7} /></mesh>
        <mesh position={[0, 1.42, 0.01]} scale={[0.22, 0.17, 0.22]}><sphereGeometry args={[1, 16, 10]} /><meshStandardMaterial color="#14161d" roughness={0.9} /></mesh>
        {[-0.2, 0.2].map((x) => <mesh key={x} position={[x, 0.96, -0.03]} rotation={[0, 0, x * 1.1]}><capsuleGeometry args={[0.075, 0.38, 4, 8]} /><meshStandardMaterial color={jacket} /></mesh>)}
      </group>
    </group>
  );
}

function Yacht({ occupied = false, color, jacket = "#172843" }) {
  const wake = useRef(null);
  useFrame(({ clock }) => { if (wake.current) wake.current.opacity = 0.17 + Math.sin(clock.elapsedTime * 2.1) * 0.06; });
  return (
    <group>
      {/* Deep navy hull, gold waterline, and pointed bow facing local -Z. */}
      <RoundedBox args={[2.3, 0.72, 5.5]} radius={0.32} smoothness={5} position={[0, 0.34, 0.05]} castShadow receiveShadow>
        <meshPhysicalMaterial color={color ?? "#f4f4ec"} metalness={0.18} roughness={0.3} clearcoat={0.92} />
      </RoundedBox>
      <mesh position={[0, 0.24, -2.25]} rotation={[-Math.PI / 2, 0, 0]} castShadow><coneGeometry args={[1.13, 1.55, 4]} /><meshPhysicalMaterial color={color ?? "#f4f4ec"} metalness={0.18} roughness={0.3} clearcoat={0.9} /></mesh>
      <RoundedBox args={[2.36, 0.12, 4.3]} radius={0.16} smoothness={4} position={[0, 0.71, 0.12]}><meshPhysicalMaterial color={color ? shade(color, 0.55) : "#17334b"} metalness={0.72} roughness={0.24} clearcoat={1} /></RoundedBox>
      <mesh position={[0, 0.51, 0.1]}><boxGeometry args={[2.39, 0.09, 4.55]} /><meshStandardMaterial color="#d5ad56" metalness={0.72} roughness={0.24} /></mesh>
      {/* Two-deck cabin with panoramic blue glass. */}
      <RoundedBox args={[1.72, 0.96, 1.82]} radius={0.16} smoothness={4} position={[0, 1.22, 0.62]} castShadow><meshPhysicalMaterial color="#f5f4ed" roughness={0.42} clearcoat={0.7} /></RoundedBox>
      <RoundedBox args={[1.58, 0.52, 1.48]} radius={0.1} smoothness={4} position={[0, 1.28, -0.34]}><meshPhysicalMaterial color="#31677d" metalness={0.32} roughness={0.16} clearcoat={1} /></RoundedBox>
      <RoundedBox args={[1.18, 0.58, 1.18]} radius={0.12} smoothness={4} position={[0, 2.03, 0.64]} castShadow><meshPhysicalMaterial color="#f9f8f2" roughness={0.4} clearcoat={0.8} /></RoundedBox>
      <mesh position={[0, 1.98, 0.035]}><boxGeometry args={[1.06, 0.38, 0.055]} /><meshPhysicalMaterial color="#4389a0" metalness={0.25} roughness={0.16} clearcoat={1} /></mesh>
      <mesh position={[0, 2.44, 0.65]}><boxGeometry args={[0.04, 0.62, 0.04]} /><meshStandardMaterial color="#b6c6d1" metalness={0.7} roughness={0.25} /></mesh>
      <mesh position={[0, 2.77, 0.65]}><sphereGeometry args={[0.07, 12, 8]} /><meshStandardMaterial color="#f2ce70" emissive="#f2ce70" emissiveIntensity={0.35} /></mesh>
      {[-1, 1].map((side) => <group key={side}>
        <mesh position={[side * 0.92, 0.98, -1.15]}><boxGeometry args={[0.045, 0.5, 0.88]} /><meshPhysicalMaterial color="#55a3b3" roughness={0.18} metalness={0.2} /></mesh>
        <mesh position={[side * 0.96, 0.88, 1.55]}><cylinderGeometry args={[0.035, 0.035, 0.72, 8]} /><meshStandardMaterial color="#d6dce0" metalness={0.8} roughness={0.24} /></mesh>
        <mesh position={[side * 0.96, 1.25, 1.55]}><cylinderGeometry args={[0.035, 0.035, 0.72, 8]} /><meshStandardMaterial color="#d6dce0" metalness={0.8} roughness={0.24} /></mesh>
      </group>)}
      <mesh position={[0, 0.02, -3.2]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[1.05, 2.7]} /><meshBasicMaterial ref={wake} color="#b3f2f4" transparent opacity={0.2} depthWrite={false} /></mesh>
      {/* Viswa at the helm. */}
      <group visible={occupied} position={[0, 0.03, 1.1]}>
        <mesh position={[0, 1.45, 0.12]}><capsuleGeometry args={[0.23, 0.5, 5, 10]} /><meshStandardMaterial color={jacket} roughness={0.75} /></mesh>
        <mesh position={[0, 1.94, 0]} scale={[0.2, 0.24, 0.2]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color="#a86648" /></mesh>
        <mesh position={[0, 2.09, 0.025]} scale={[0.21, 0.14, 0.21]}><sphereGeometry args={[1, 16, 10]} /><meshStandardMaterial color="#171820" /></mesh>
        <mesh position={[0, 1.34, -0.28]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.24, 0.025, 8, 20]} /><meshStandardMaterial color="#222b38" metalness={0.7} roughness={0.3} /></mesh>
      </group>
      <Billboard position={[0, 2.9, -1.6]}><Text fontSize={0.18} color="#f5f7fb" outlineWidth={0.025} outlineColor="#17334b" anchorX="center">VISWA · LUXURY YACHT</Text></Billboard>
    </group>
  );
}

function distanceToSegment2D(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  const progress = lengthSquared > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSquared)) : 0;
  return Math.hypot(px - (ax + dx * progress), pz - (az + dz * progress));
}

function trafficPhase(time) {
  const phase = time % 24;
  if (phase < 9) return "GREEN_X";
  if (phase < 12) return "AMBER_X";
  if (phase < 21) return "GREEN_Z";
  if (phase < 23) return "AMBER_Z";
  return "ALL_RED";
}

function TrafficSignal({ position, axis }) {
  const lamps = useRef([]);
  useFrame(({ clock }) => {
    const phase = trafficPhase(clock.elapsedTime);
    const state = phase.endsWith(axis.toUpperCase()) ? phase.split("_")[0] : "RED";
    lamps.current.forEach((material, index) => {
      if (material) material.emissiveIntensity = (index === 0 && state === "RED") || (index === 1 && state === "AMBER") || (index === 2 && state === "GREEN") ? 2.1 : 0.04;
    });
  });
  return (
    <group position={position} rotation={[0, axis === "x" ? -Math.PI / 2 : 0, 0]}>
      <mesh position={[0, 2.25, 0]} castShadow><cylinderGeometry args={[0.09, 0.13, 4.5, 10]} /><meshStandardMaterial color="#27323e" metalness={0.55} roughness={0.36} /></mesh>
      <mesh position={[0, 4.05, 0]} castShadow><boxGeometry args={[0.66, 1.45, 0.48]} /><meshStandardMaterial color="#151d28" metalness={0.3} roughness={0.46} /></mesh>
      {["#ff404b", "#ffc64a", "#38db78"].map((color, index) => <mesh key={color} position={[0, 4.52 - index * 0.47, 0.255]}>
        <sphereGeometry args={[0.15, 16, 12]} /><meshStandardMaterial ref={(material) => { lamps.current[index] = material; }} color={color} emissive={color} emissiveIntensity={0.04} roughness={0.26} />
      </mesh>)}
      <mesh position={[0, 0.12, 0]}><cylinderGeometry args={[0.34, 0.4, 0.24, 12]} /><meshStandardMaterial color="#313b48" metalness={0.48} roughness={0.4} /></mesh>
    </group>
  );
}

function TrafficCar({ color, axis, fixed, start, speed, direction = 1, slot }) {
  const ref = useRef(null);
  const travel = useRef(start);

  useEffect(() => {
    trafficRefs[slot] = ref.current;
    if (ref.current) {
      ref.current.userData.trafficInfo = { axis, fixed, direction, slot };
      ref.current.userData.trafficLength = 3.6;
      ref.current.userData.collisionBounds = vehicleBounds("CAR");
    }
    return () => { trafficRefs[slot] = null; };
  }, [axis, direction, fixed, slot]);

  useFrame(({ clock }, delta) => {
    if (!ref.current) return;
    let nextTravel = travel.current + speed * delta * direction;
    let wraps = false;
    if (nextTravel > 44) { nextTravel = -44; wraps = true; }
    if (nextTravel < -44) { nextTravel = 44; wraps = true; }
    const phase = trafficPhase(clock.elapsedTime);
    const green = axis === "x" ? phase === "GREEN_X" : phase === "GREEN_Z";
    const hasSignal = axis === "x" ? Math.abs(fixed - 1.05) < 1.2 : Math.abs(fixed - 11.05) < 1.2;
    const stopLine = axis === "x" ? (direction > 0 ? 8.1 : 14.0) : (direction > 0 ? -4.0 : 4.0);
    if (hasSignal && !green && !wraps && direction * (travel.current - stopLine) <= 0 && direction * (nextTravel - stopLine) > 0) nextTravel = stopLine;
    const blocked = trafficRefs.some((other, otherSlot) => {
      if (!other || otherSlot === slot) return false;
      // Traffic only yields to the player when the player is directly ahead in its lane. A vehicle that is
      // behind or beside must never stop it, otherwise a following player and the car ahead block each other forever.
      if (other.userData.isPlayerVehicle || other.userData.isAvatar) {
        if (wraps || (other.userData.isAvatar && !other.visible)) return false;
        const ahead = ((axis === "x" ? other.position.x : other.position.z) - travel.current) * direction;
        const across = Math.abs((axis === "x" ? other.position.z : other.position.x) - fixed);
        const clearance = other.userData.isAvatar ? 3.35 : other.userData.vehicleMode === "YACHT" ? 5.2 : other.userData.vehicleMode === "BIKE" ? 3.0 : 3.6;
        return ahead > -0.4 && ahead < clearance + 0.8 && across < 1.7;
      }
      const info = other.userData.trafficInfo;
      if (!info) {
        if (other.userData.isAvatar) {
          if (!other.visible || wraps) return false;
          const startX = axis === "x" ? travel.current : fixed;
          const startZ = axis === "x" ? fixed : travel.current;
          const candidateX = axis === "x" ? nextTravel : fixed;
          const candidateZ = axis === "x" ? fixed : nextTravel;
          const clearance = other.userData.isBus ? 4.35 : 3.35;
          return distanceToSegment2D(other.position.x, other.position.z, startX, startZ, candidateX, candidateZ) < clearance;
        }
        const along = axis === "x" ? other.position.x : other.position.z;
        const across = axis === "x" ? other.position.z : other.position.x;
        const gap = (nextTravel - along) * direction;
        return Math.abs(across - fixed) < 1.9 && gap > 0.1 && gap < 5.1;
      }
      if (info.axis === axis) {
        if (Math.abs(info.fixed - fixed) > 1.2 || info.direction !== direction) return false;
        const along = axis === "x" ? other.position.x : other.position.z;
        const gap = (nextTravel - along) * direction;
        const headway = Math.max(5.1, ((ref.current.userData.trafficLength ?? 3.6) + (other.userData.trafficLength ?? 3.6)) / 2 + 1);
        return gap > 0.1 && gap < headway;
      }
      const signalCrossing = axis === "x"
        ? Math.abs(fixed - 1.05) < 1.2 && Math.abs(info.fixed - 11.05) < 1.2
        : Math.abs(fixed - 11.05) < 1.2 && Math.abs(info.fixed - 1.05) < 1.2;
      if (signalCrossing) return false;
      // At crossings the lower slot has right of way; the other car waits until
      // it clears the junction, avoiding both impact and two-car deadlocks.
      if (slot < info.slot) return false;
      const ownToCrossing = ((axis === "x" ? info.fixed : info.fixed) - travel.current) * direction;
      const otherAlong = info.axis === "x" ? other.position.x : other.position.z;
      const otherToCrossing = (fixed - otherAlong) * info.direction;
      return ownToCrossing > -1.1 && ownToCrossing < 3.8 && otherToCrossing > -1.1 && otherToCrossing < 3.8;
    });
    if (!blocked) travel.current = nextTravel;
    if (axis === "x") {
      ref.current.position.set(travel.current, 0, fixed);
      ref.current.rotation.y = Math.atan2(-direction, 0);
    } else {
      ref.current.position.set(fixed, 0, travel.current);
      ref.current.rotation.y = Math.atan2(0, -direction);
    }
  });

  return (
    <group ref={ref}>
      <Car color={color} speed={speed * 12 * direction} />
    </group>
  );
}

function SchoolBus({ fixed = 21.05, start = -35, speed = 1.15 }) {
  const ref = useRef(null);
  const travel = useRef(start);
  const wheels = useRef([]);
  useEffect(() => {
    trafficRefs[5] = ref.current;
    if (ref.current) {
      ref.current.userData.trafficInfo = { axis: "x", fixed, direction: 1, slot: 5 };
      ref.current.userData.trafficLength = 7.2;
      ref.current.userData.collisionBounds = { halfWidth: 1.42, halfLength: 3.9 };
      ref.current.userData.isBus = true;
    }
    return () => { trafficRefs[5] = null; };
  }, [fixed]);
  useFrame((_, delta) => {
    if (!ref.current) return;
    const nextTravel = travel.current + speed * delta;
    const wraps = nextTravel > 44;
    const candidate = wraps ? -44 : nextTravel;
    const blocked = trafficRefs.some((other, otherSlot) => {
      if (!other || otherSlot === 5) return false;
      // Yield only to something directly ahead in the bus lane; never stop for a vehicle that is behind or beside.
      if (other.userData.isPlayerVehicle || other.userData.isAvatar) {
        if (wraps || (other.userData.isAvatar && !other.visible)) return false;
        const clearance = other.userData.isAvatar ? 4.35 : other.userData.vehicleMode === "YACHT" ? 7.2 : other.userData.vehicleMode === "BIKE" ? 5.4 : 5.8;
        const ahead = other.position.x - travel.current;
        return ahead > -0.4 && ahead < clearance + 0.8 && Math.abs(other.position.z - fixed) < 2.0;
      }
      const info = other.userData.trafficInfo;
      if (!info) return Math.hypot(candidate - other.position.x, fixed - other.position.z) < 4.6;
      if (info.axis === "x") {
        if (Math.abs(info.fixed - fixed) > 1.2 || info.direction !== 1) return false;
        return candidate - other.position.x > 0.1 && candidate - other.position.x < (7.2 + (other.userData.trafficLength ?? 3.6)) / 2 + 1;
      }
      if (otherSlot < 5) {
        const busToCrossing = info.fixed - travel.current;
        const otherToCrossing = (fixed - other.position.z) * info.direction;
        return busToCrossing > -2 && busToCrossing < 4.6 && otherToCrossing > -2 && otherToCrossing < 4.6;
      }
      return false;
    });
    if (!blocked) travel.current = candidate;
    ref.current.position.set(travel.current, 0, fixed);
    ref.current.rotation.y = -Math.PI / 2;
    wheels.current.forEach((wheel) => { if (wheel) wheel.rotation.x -= speed * delta * 0.2; });
  });
  return (
    <group ref={ref}>
      <RoundedBox args={[2.25, 2.15, 6.25]} radius={0.12} smoothness={3} position={[0, 1.43, 0]} castShadow receiveShadow><meshPhysicalMaterial color="#f5bd25" metalness={0.14} roughness={0.42} clearcoat={0.35} /></RoundedBox>
      <mesh position={[0, 2.56, 0.03]}><boxGeometry args={[2.12, 0.12, 6.0]} /><meshStandardMaterial color="#e7a91b" roughness={0.5} /></mesh>
      <mesh position={[0, 2.03, -3.16]}><boxGeometry args={[1.65, 0.74, 0.055]} /><meshPhysicalMaterial color="#213c53" metalness={0.32} roughness={0.18} clearcoat={0.9} /></mesh>
      <mesh position={[0, 1.1, -3.17]}><boxGeometry args={[0.95, 0.25, 0.06]} /><meshStandardMaterial color="#202932" metalness={0.65} roughness={0.3} /></mesh>
      {[-1, 1].map((side) => <group key={side}>
        {[-2.25, -1.2, -0.15, 0.9, 1.95].map((z) => <mesh key={z} position={[side * 1.14, 2.05, z]}><boxGeometry args={[0.055, 0.72, 0.82]} /><meshPhysicalMaterial color="#21435b" metalness={0.28} roughness={0.18} clearcoat={0.8} /></mesh>)}
        <mesh position={[side * 1.16, 1.13, 0.08]}><boxGeometry args={[0.06, 0.12, 5.8]} /><meshStandardMaterial color="#252d36" roughness={0.42} /></mesh>
        <Text position={[side * 1.17, 1.55, 0.25]} rotation={[0, side * Math.PI / 2, 0]} fontSize={0.27} color="#172331" anchorX="center" anchorY="middle">SCHOOL BUS</Text>
        <group position={[side * 1.2, 1.7, -0.05]} rotation={[0, Math.PI / 2, 0]}><mesh><cylinderGeometry args={[0.27, 0.27, 0.08, 8]} /><meshBasicMaterial color="#e34a32" /></mesh></group>
      </group>)}
      {[[-0.67, -1.95], [0.67, -1.95], [-0.67, 2.0], [0.67, 2.0]].map(([x, z], index) => <group key={index} ref={(node) => { wheels.current[index] = node; }} position={[x, 0.54, z]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.43, 0.43, 0.24, 18]} /><meshStandardMaterial color="#171b20" roughness={0.9} /></mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.2, 0.2, 0.25, 14]} /><meshStandardMaterial color="#a9b4bd" metalness={0.72} roughness={0.3} /></mesh>
      </group>)}
      {[-0.78, 0.78].map((x) => <mesh key={x} position={[x, 0.65, -3.17]}><boxGeometry args={[0.28, 0.2, 0.08]} /><meshStandardMaterial color="#fff1bd" emissive="#ffcf50" emissiveIntensity={0.65} /></mesh>)}
      {[-0.8, 0.8].map((x) => <mesh key={`tail-${x}`} position={[x, 0.78, 3.17]}><boxGeometry args={[0.3, 0.24, 0.08]} /><meshStandardMaterial color="#e63d43" emissive="#a81923" emissiveIntensity={0.5} /></mesh>)}
      {[0, 1, 2, 3, 4].map((index) => <mesh key={`roof-light-${index}`} position={[-0.72 + index * 0.36, 2.64, -0.1]}><boxGeometry args={[0.2, 0.07, 0.16]} /><meshStandardMaterial color="#f6e78d" emissive="#f6d94e" emissiveIntensity={0.55} /></mesh>)}
    </group>
  );
}

const skinTone = "#a86648";
const hairTone = "#14161d";
// Original, simple accessories that make each character recognisable on foot.
function CharacterGear({ id }) {
  if (id === "builder") return (
    <group position={[0, 1.72, 0.01]}>
      <mesh><sphereGeometry args={[0.27, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#ffcf33" roughness={0.45} /></mesh>
      <mesh position={[0, -0.005, -0.12]}><boxGeometry args={[0.46, 0.035, 0.26]} /><meshStandardMaterial color="#e6b21c" roughness={0.5} /></mesh>
    </group>
  );
  if (id === "interface") return (
    <group position={[0, 1.58, 0]}>
      <mesh rotation={[0, 0, 0]}><torusGeometry args={[0.27, 0.025, 8, 24, Math.PI]} /><meshStandardMaterial color="#ff4d6d" roughness={0.4} /></mesh>
      {[-1, 1].map((side) => <mesh key={side} position={[side * 0.27, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.08, 0.08, 0.07, 14]} /><meshStandardMaterial color="#ff4d6d" roughness={0.4} /></mesh>)}
    </group>
  );
  return (
    <group position={[0, 1.66, -0.2]}>
      {[-1, 1].map((side) => <mesh key={side} position={[side * 0.085, 0, 0]}><torusGeometry args={[0.062, 0.018, 8, 16]} /><meshStandardMaterial color="#5eead4" roughness={0.35} /></mesh>)}
      <mesh position={[0, 0, 0.1]} rotation={[0, 0, 0]}><torusGeometry args={[0.235, 0.012, 6, 24, Math.PI * 1.1]} /><meshStandardMaterial color="#1f4e4a" roughness={0.6} /></mesh>
    </group>
  );
}

function PlayerAvatar({ avatarRef, walkingRef, runningRef, look }) {
  const leftArm = useRef(null);
  const rightArm = useRef(null);
  const leftLeg = useRef(null);
  const rightLeg = useRef(null);
  const outfit = look.outfit;
  useFrame(({ clock }) => {
    const running = runningRef.current;
    const swing = walkingRef.current ? Math.sin(clock.elapsedTime * (running ? 14 : 9)) * (running ? 0.68 : 0.52) : 0;
    if (leftArm.current) leftArm.current.rotation.x = swing;
    if (rightArm.current) rightArm.current.rotation.x = -swing;
    if (leftLeg.current) leftLeg.current.rotation.x = -swing;
    if (rightLeg.current) rightLeg.current.rotation.x = swing;
  });
  return (
    <group ref={avatarRef} position={[0, 0, 11]}>
      <mesh position={[0, 1.07, 0]}><capsuleGeometry args={[0.29, 0.58, 6, 12]} /><meshStandardMaterial color={outfit.jacket} roughness={0.76} /></mesh>
      <mesh position={[0, 1.16, -0.29]}><boxGeometry args={[0.1, 0.52, 0.035]} /><meshStandardMaterial color={outfit.shirt} roughness={0.6} /></mesh>
      <mesh position={[0, 1.54, 0]} scale={[0.235, 0.275, 0.22]}><sphereGeometry args={[1, 18, 14]} /><meshStandardMaterial color={skinTone} roughness={0.72} /></mesh>
      <mesh position={[0, 1.68, 0.035]} scale={[0.245, 0.18, 0.24]}><sphereGeometry args={[1, 18, 12]} /><meshStandardMaterial color={hairTone} roughness={0.92} /></mesh>
      {[-0.13, 0, 0.13].map((x) => <mesh key={x} position={[x, 1.79 - Math.abs(x) * 0.1, -0.025]}><sphereGeometry args={[0.09, 9, 7]} /><meshStandardMaterial color={hairTone} roughness={0.95} /></mesh>)}
      {[-1, 1].map((side) => <mesh key={side} position={[side * 0.083, 1.57, -0.194]}><sphereGeometry args={[0.022, 8, 8]} /><meshStandardMaterial color="#171820" /></mesh>)}
      <mesh position={[0, 1.48, -0.213]} rotation={[0, 0, Math.PI / 2]}><capsuleGeometry args={[0.025, 0.09, 3, 6]} /><meshStandardMaterial color="#251a18" /></mesh>
      <CharacterGear id={look.characterId} />
      {[[-1, leftArm], [1, rightArm]].map(([side, ref]) => (
        <group key={side} ref={ref} position={[side * 0.34, 1.27, 0]}>
          <mesh position={[0, -0.25, 0]} rotation={[0, 0, side * 0.12]}><capsuleGeometry args={[0.105, 0.42, 5, 9]} /><meshStandardMaterial color={outfit.jacket} /></mesh>
          <mesh position={[0, -0.52, 0]}><sphereGeometry args={[0.09, 10, 8]} /><meshStandardMaterial color={skinTone} /></mesh>
        </group>
      ))}
      {[[-1, leftLeg], [1, rightLeg]].map(([side, ref]) => (
        <group key={side} ref={ref} position={[side * 0.15, 0.66, 0]}>
          <mesh position={[0, -0.27, 0]}><capsuleGeometry args={[0.125, 0.38, 5, 9]} /><meshStandardMaterial color={outfit.pants} /></mesh>
          <mesh position={[0, -0.52, -0.08]}><boxGeometry args={[0.24, 0.12, 0.38]} /><meshStandardMaterial color={outfit.shoes} roughness={0.6} /></mesh>
        </group>
      ))}
    </group>
  );
}

function PlayerVehicle({ calm, look, infoOpen = false, inputEnabled = true, yachtCommand, autoTourCommand, onAutoTourChange, rendererReady, onSceneReady, onResetReady, onRideStateChange, onSelect, onNearbyChange, onVehicleNearChange, onDrivingChange, onInteractionReady, onExitReady, onSpeedChange, onPositionChange, onVehicleChange, vehicleMode, vehicleSpeed, touchInput, isDriving }) {
  const vehicle = useRef(null);
  const previousVehicleMode = useRef(vehicleMode);
  const autopilot = useRef(false);
  const cityTour = useRef({ active: false, paused: false, pendingStart: false, kind: "tour", stops: tourStops, mode: "CAR", index: 0, phase: "idle", arrival: "exact", issue: "", route: [], waypoint: 0, target: [0, 0], candidates: [], candidateIndex: 0, incidents: 0, reverse: 0, hold: 0, noGain: 0, bestRemaining: Infinity, anchor: { x: 0, z: 0, t: 0 }, avoidEdges: new Set(), dwell: 0, waited: 0, sawOpen: false, commandId: 0 });
  const infoOpenRef = useRef(false);
  const paused = useRef(false);
  const waypointIndex = useRef(0);
  const pendingRide = useRef(false);
  const rideState = useRef("idle");
  const handledCommand = useRef(0);
  const avatar = useRef(null);
  const keys = useRef(new Set());
  const velocity = useRef(0);
  const rotation = useRef(0);
  const nearby = useRef("");
  const canExploreTarget = useRef(false);
  const resetRequested = useRef(false);
  const vehicleNear = useRef(false);
  const driving = useRef(false);
  const walking = useRef(false);
  const running = useRef(false);
  const interactRef = useRef(() => {});
  const exitRef = useRef(() => {});
  const statusTimer = useRef(0);
  const didSignalReady = useRef(false);
  const cameraOrbit = useRef({ yaw: 0, pitch: 0.34, zoom: 0 });
  const { camera, gl } = useThree();
  const inputEnabledRef = useRef(inputEnabled);
  useEffect(() => { infoOpenRef.current = infoOpen; }, [infoOpen]);
  useEffect(() => {
    inputEnabledRef.current = inputEnabled;
    if (!inputEnabled) keys.current.clear();
  }, [inputEnabled]);
  const cameraRef = useRef(camera);
  const callbacks = useRef({ onSceneReady, onSelect, onNearbyChange, onVehicleNearChange, onDrivingChange, onSpeedChange, onPositionChange, onVehicleChange, onRideStateChange, onAutoTourChange });
  const setRide = useCallback((state) => {
    if (rideState.current === state) return;
    rideState.current = state;
    callbacks.current.onRideStateChange?.(state);
  }, []);
  // Put the yacht back at its mooring and the player on the pier.
  const stopRide = useCallback(() => {
    autopilot.current = false;
    paused.current = false;
    waypointIndex.current = 0;
    velocity.current = 0;
    rotation.current = 0;
    if (vehicle.current) { vehicle.current.position.set(...yachtMoor); vehicle.current.rotation.y = 0; }
    if (avatar.current) { avatar.current.position.set(...pierStand); avatar.current.rotation.y = 0; avatar.current.visible = true; }
    driving.current = false;
    walking.current = false;
    callbacks.current.onDrivingChange(false);
    setRide("idle");
  }, [setRide]);

  useEffect(() => { cameraRef.current = camera; }, [camera]);
  useEffect(() => {
    const controlledVehicle = vehicle.current;
    if (controlledVehicle) controlledVehicle.userData.isPlayerVehicle = true;
    trafficRefs[3] = controlledVehicle;
    return () => { if (trafficRefs[3] === controlledVehicle) trafficRefs[3] = null; };
  }, []);
  useEffect(() => {
    const playerAvatar = avatar.current;
    if (playerAvatar) playerAvatar.userData.isAvatar = true;
    trafficRefs[4] = playerAvatar;
    return () => { if (trafficRefs[4] === playerAvatar) trafficRefs[4] = null; };
  }, []);
  useEffect(() => {
    if (!vehicle.current || previousVehicleMode.current === vehicleMode) return;
    if (vehicleMode === "YACHT") {
      // Put the yacht just beyond the pier's end, centered in the open-water
      // view instead of behind the shore buildings.
      vehicle.current.position.set(...yachtMoor);
      vehicle.current.rotation.y = 0;
      rotation.current = 0;
      velocity.current = 0;
      // Switching vehicle types is a selection, not an implicit boarding
      // action. Reset any car/bike ride so the yacht appears beside the player.
      driving.current = false;
      callbacks.current.onDrivingChange(false);
      if (avatar.current) {
        avatar.current.visible = true;
        // Stand at the end of the pier, within boarding range of the yacht.
        avatar.current.position.set(...pierStand);
        avatar.current.rotation.y = 0;
      }
      autopilot.current = false;
      paused.current = false;
      setRide("idle");
    } else if (previousVehicleMode.current === "YACHT") {
      autopilot.current = false;
      paused.current = false;
      setRide("idle");
      const roadX = nearestRoadLine(avatar.current?.position.x ?? 0);
      const roadZ = nearestRoadLine(avatar.current?.position.z ?? 0);
      vehicle.current.position.set(roadX, 0, roadZ);
      vehicle.current.rotation.y = rotation.current;
      velocity.current = 0;
    }
    if (vehicleMode !== "YACHT" && previousVehicleMode.current !== "YACHT" && !driving.current && avatar.current) {
      // Swapping car and bike in place: nudge the avatar clear so the new vehicle never overlaps it.
      const ax = avatar.current.position.x; const az = avatar.current.position.z;
      const vx = vehicle.current.position.x; const vz = vehicle.current.position.z;
      const gap = Math.hypot(ax - vx, az - vz);
      if (gap < 2.7) {
        const dirX = gap > 0.01 ? (ax - vx) / gap : 1; const dirZ = gap > 0.01 ? (az - vz) / gap : 0;
        const [safeX, safeZ] = findClearFootPoint(ax, az, vx + dirX * 3.3, vz + dirZ * 3.3, 0.36, 5, [3, 4]);
        avatar.current.position.set(safeX, 0, safeZ);
        callbacks.current.onPositionChange({ x: safeX, z: safeZ });
      }
    }
    previousVehicleMode.current = vehicleMode;
  }, [vehicleMode, setRide]);
  useEffect(() => {
    const canvas = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (event) => {
      if (event.button !== 0) return;
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      cameraOrbit.current.yaw -= dx * 0.008;
      cameraOrbit.current.pitch = Math.max(0.08, Math.min(0.92, cameraOrbit.current.pitch + dy * 0.004));
    };
    const onPointerUp = () => { dragging = false; };
    const onWheel = (event) => {
      event.preventDefault();
      cameraOrbit.current.zoom = Math.max(-1.8, Math.min(4.5, cameraOrbit.current.zoom + event.deltaY * 0.004));
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [gl]);
  useEffect(() => {
    callbacks.current = { onSceneReady, onResetReady, onSelect, onNearbyChange, onVehicleNearChange, onDrivingChange, onSpeedChange, onPositionChange, onVehicleChange, onRideStateChange, onAutoTourChange };
  }, [onSceneReady, onResetReady, onSelect, onNearbyChange, onVehicleNearChange, onDrivingChange, onSpeedChange, onPositionChange, onVehicleChange, onRideStateChange, onAutoTourChange]);

  // One engine drives both the full Auto Tour and single Quick Visits: stops[] holds the destinations.
  const reportTour = useCallback((phase, extra = {}) => {
    const tour = cityTour.current;
    callbacks.current.onAutoTourChange?.({
      active: tour.active, paused: tour.paused, index: tour.index, total: tour.stops.length, kind: tour.kind,
      label: tour.stops[tour.index] ?? "", phase: tour.phase === "blocked" ? "blocked" : tour.active && tour.paused ? "paused" : phase,
      steering: tour.active && !tour.paused ? "auto" : "manual", arrival: tour.arrival, issue: tour.issue, ...extra,
    });
  }, []);
  // Plan a street route from where the vehicle is now to the current arrival point, around real obstacles.
  const planFromHere = useCallback(() => {
    const tour = cityTour.current;
    if (!vehicle.current) return false;
    const route = planStreetRoute(vehicle.current.position.x, vehicle.current.position.z, tour.target[0], tour.target[1], { radius: vehicleRadius(tour.mode), avoid: tour.avoidEdges });
    if (!route) return false;
    tour.route = laneRoute(route, vehicleBounds(tour.mode).halfWidth); tour.waypoint = route.length > 1 ? 1 : 0;
    tour.anchor = { x: vehicle.current.position.x, z: vehicle.current.position.z, t: 0 };
    tour.hold = 0; tour.reverse = 0; tour.noGain = 0; tour.bestRemaining = Infinity;
    return true;
  }, []);
  // Nothing worked: stop, hand control back, and explain. Retry, Skip stop and Exit tour are offered in the sidebar.
  const blockTour = useCallback((message) => {
    const tour = cityTour.current;
    tour.paused = true; tour.phase = "blocked"; tour.issue = message; tour.reverse = 0;
    reportTour("blocked");
  }, [reportTour]);
  // Try the next clear parking spot beside the building; give up (and say so) when none is reachable.
  const nextArrivalPoint = useCallback(() => {
    const tour = cityTour.current;
    while (tour.candidateIndex < Math.min(tour.candidates.length - 1, 3)) {
      tour.candidateIndex += 1;
      tour.target = tour.candidates[tour.candidateIndex];
      tour.avoidEdges = new Set(); tour.incidents = 0;
      if (planFromHere()) { tour.arrival = "alternate"; return true; }
    }
    blockTour(`${tour.stops[tour.index]} cannot be reached right now: traffic or scenery is blocking every clear street to it.`);
    return false;
  }, [planFromHere, blockTour]);
  const startLeg = useCallback(() => {
    const tour = cityTour.current;
    const stop = placeByLabel(tour.stops[tour.index]);
    if (!stop || !vehicle.current) return;
    tour.candidates = arrivalCandidates(stop, vehicleRadius(tour.mode));
    tour.candidateIndex = 0;
    tour.target = tour.candidates[0] ?? approachPoint(stop);
    tour.avoidEdges = new Set(); tour.incidents = 0; tour.issue = ""; tour.arrival = "exact";
    Object.assign(tour, { phase: "driving", sawOpen: false, waited: 0, dwell: 0 });
    if (!planFromHere()) nextArrivalPoint();
  }, [planFromHere, nextArrivalPoint]);
  // Step into the vehicle without a long jump: if on foot, the vehicle is placed on the nearest street.
  const boardForTour = useCallback(() => {
    if (!vehicle.current || !avatar.current) return;
    if (!(driving.current && vehicleMode !== "YACHT")) {
      const [roadX, roadZ] = projectToRoad(avatar.current.position.x, avatar.current.position.z);
      vehicle.current.position.set(roadX, 0, roadZ);
      vehicle.current.rotation.y = avatar.current.rotation.y;
      rotation.current = avatar.current.rotation.y;
    }
    velocity.current = 0; autopilot.current = false; paused.current = false;
    driving.current = true; walking.current = false;
    avatar.current.visible = false;
    keys.current.clear();
    callbacks.current.onDrivingChange(true);
  }, [vehicleMode]);

  useEffect(() => {
    const tour = cityTour.current;
    if (tour.pendingStart && vehicleMode === tour.mode) {
      tour.pendingStart = false;
      boardForTour(); startLeg(); if (tour.phase !== "blocked") reportTour("driving");
      return;
    }
    if (!autoTourCommand || tour.commandId === autoTourCommand.id) return;
    tour.commandId = autoTourCommand.id;
    const { action } = autoTourCommand;
    if (action === "exit") {
      tour.active = false; tour.paused = false; tour.pendingStart = false; tour.phase = "exited"; tour.issue = "";
      reportTour("exited");
      return;
    }
    if (action === "pause" && tour.active && tour.phase !== "blocked") { tour.paused = true; reportTour(tour.phase); return; }
    if ((action === "resume" || action === "retry") && tour.active && tour.paused) {
      const wasBlocked = tour.phase === "blocked";
      tour.paused = false; tour.issue = "";
      if (wasBlocked || action === "retry") startLeg();
      else if (tour.phase === "driving" || tour.phase === "stopping") { tour.phase = "driving"; if (!planFromHere()) nextArrivalPoint(); }
      if (tour.phase !== "blocked") reportTour(tour.phase);
      return;
    }
    if (action === "skip" && tour.active) {
      tour.paused = false; tour.issue = "";
      if (tour.index >= tour.stops.length - 1) { tour.active = false; tour.phase = "complete"; reportTour("complete"); return; }
      tour.index += 1;
      startLeg(); if (tour.phase !== "blocked") reportTour("driving");
      return;
    }
    if (action === "start" || action === "restart" || action === "visit") {
      const stops = action === "visit" ? [autoTourCommand.label] : tourStops;
      if (!stops.every((label) => placeByLabel(label))) return;
      Object.assign(tour, { kind: action === "visit" ? "visit" : "tour", stops: [...stops], index: 0, active: true, paused: false, issue: "", mode: autoTourCommand.mode === "BIKE" ? "BIKE" : "CAR" });
      if (vehicleMode === "YACHT") { autopilot.current = false; paused.current = false; driving.current = false; setRide("idle"); }
      if (vehicleMode !== tour.mode) {
        // Switch to the tour vehicle first; the effect re-runs once the vehicle type has changed.
        tour.pendingStart = true; tour.phase = "starting";
        callbacks.current.onVehicleChange(tour.mode);
        reportTour("starting");
        return;
      }
      boardForTour(); startLeg(); if (tour.phase !== "blocked") reportTour("driving");
    }
  }, [autoTourCommand, vehicleMode, boardForTour, startLeg, planFromHere, nextArrivalPoint, reportTour, setRide]);

  useEffect(() => {
    const resetPosition = () => {
      if (cityTour.current.active && !cityTour.current.paused) return;
      keys.current.clear();
      if (vehicleMode === "YACHT") {
        autopilot.current = false; paused.current = false; velocity.current = 0; rotation.current = 0;
        vehicle.current?.position.set(...yachtMoor); avatar.current?.position.set(...pierStand);
        if (avatar.current) avatar.current.visible = true;
        driving.current = false; callbacks.current.onDrivingChange(false); setRide("idle");
        callbacks.current.onPositionChange({ x: pierStand[0], z: pierStand[2] });
      } else if (driving.current) resetRequested.current = true;
      else if (avatar.current) {
        const [safeX, safeZ] = findClearFootPoint(avatar.current.position.x, avatar.current.position.z, avatar.current.position.x, avatar.current.position.z, 0.36, 20, [4]);
        avatar.current.position.set(safeX, 0, safeZ);
        avatar.current.rotation.y = 0;
        rotation.current = 0;
        callbacks.current.onPositionChange({ x: safeX, z: safeZ });
        const approach = closestPlaceApproach(safeX, safeZ);
        nearby.current = approach.label;
        canExploreTarget.current = Boolean(approach.label && isClearFootPoint(safeX, safeZ, 0.36, [3, 4]));
        callbacks.current.onNearbyChange(approach.label);
      } else {
        nearby.current = "";
        canExploreTarget.current = false;
        callbacks.current.onNearbyChange("");
      }
      callbacks.current.onSpeedChange(0);
      vehicleNear.current = false;
      callbacks.current.onVehicleNearChange(false);
    };
    onResetReady?.(resetPosition);
    return () => onResetReady?.(() => {});
  }, [onResetReady, vehicleMode, setRide, rendererReady]);

  // Ride controls from the HUD: start, pause, resume, stop.
  useEffect(() => {
    const board = () => {
      if (!vehicle.current) return;
      vehicle.current.position.set(...yachtMoor);
      vehicle.current.rotation.y = 0;
      rotation.current = 0;
      velocity.current = 0;
      waypointIndex.current = 0;
      autopilot.current = true;
      paused.current = false;
      driving.current = true;
      walking.current = false;
      callbacks.current.onDrivingChange(true);
      setRide("cruising");
    };
    if (pendingRide.current && vehicleMode === "YACHT") { pendingRide.current = false; board(); return; }
    if (!yachtCommand || yachtCommand.id === handledCommand.current) return;
    handledCommand.current = yachtCommand.id;
    const { action } = yachtCommand;
    if (action === "start") {
      if (vehicleMode !== "YACHT") { pendingRide.current = true; callbacks.current.onVehicleChange("YACHT"); }
      else board();
    } else if (action === "pause" && vehicleMode === "YACHT" && driving.current) {
      autopilot.current = true;
      paused.current = true;
      setRide("paused");
    } else if (action === "resume" && vehicleMode === "YACHT" && driving.current) {
      paused.current = false;
      setRide("cruising");
    } else if (action === "stop" && vehicleMode === "YACHT") {
      stopRide();
    }
  }, [yachtCommand, vehicleMode, setRide, stopRide]);

  useEffect(() => {
    const exitVehicle = () => {
      if (cityTour.current.active && !cityTour.current.paused) return;
      if (driving.current && vehicle.current && avatar.current) {
        if (vehicleMode === "YACHT") { stopRide(); return; }
        const carX = vehicle.current.position.x;
        const carZ = vehicle.current.position.z;
        const preferredX = carX - Math.sin(rotation.current) * 2.8;
        const preferredZ = carZ + Math.cos(rotation.current) * 2.8;
        const [exitX, exitZ] = findClearFootPoint(carX, carZ, preferredX, preferredZ, 0.36, 5, [4]);
        avatar.current.position.set(exitX, 0, exitZ);
        avatar.current.rotation.y = Math.atan2(-(carX - exitX), -(carZ - exitZ));
        driving.current = false;
        velocity.current = 0;
        const approach = closestPlaceApproach(exitX, exitZ);
        nearby.current = approach.label;
        canExploreTarget.current = Boolean(approach.label && approach.distance < 4.4 && isClearFootPoint(exitX, exitZ, 0.36, [3, 4]));
        callbacks.current.onNearbyChange(approach.label);
        vehicleNear.current = Math.hypot(exitX - carX, exitZ - carZ) < 3.2;
        callbacks.current.onVehicleNearChange(vehicleNear.current);
        callbacks.current.onPositionChange({ x: exitX, z: exitZ });
        callbacks.current.onDrivingChange(false);
      }
    };
    const interact = () => {
      if (driving.current) {
        if (cityTour.current.active && !cityTour.current.paused) return;
        if (canExploreTarget.current && Math.abs(velocity.current) < 0.12) callbacks.current.onSelect(nearby.current);
        else exitVehicle();
      } else if (nearby.current && canExploreTarget.current) {
        callbacks.current.onSelect(nearby.current);
      } else if (vehicleNear.current && vehicle.current && avatar.current) {
        // Place the vehicle on the closest street centerline before mounting.
        if (vehicleMode !== "YACHT") {
          const roadX = nearestRoadLine(avatar.current.position.x);
          const roadZ = nearestRoadLine(avatar.current.position.z);
          const useVerticalStreet = Math.abs(avatar.current.position.x - roadX) <= Math.abs(avatar.current.position.z - roadZ);
          vehicle.current.position.set(useVerticalStreet ? roadX : avatar.current.position.x, 0, useVerticalStreet ? avatar.current.position.z : roadZ);
        }
        vehicle.current.rotation.y = avatar.current.rotation.y;
        rotation.current = avatar.current.rotation.y;
        driving.current = true;
        walking.current = false;
        callbacks.current.onDrivingChange(true);
      }
    };
    interactRef.current = interact;
    exitRef.current = exitVehicle;
    onInteractionReady(interact);
    onExitReady(exitVehicle);
    return () => { onInteractionReady(() => {}); onExitReady(() => {}); };
  }, [onInteractionReady, onExitReady, vehicleMode, stopRide]);

  useEffect(() => {
    const isTyping = (target) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const onKeyDown = (event) => {
      if (isTyping(event.target) || !inputEnabledRef.current) return;
      const key = event.key?.toLowerCase();
      if (!key) return;
      if (cityTour.current.active && !cityTour.current.paused && ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "v", "f"].includes(key)) return;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      keys.current.add(key);
      if (key === "e" && !event.repeat) interactRef.current();
      if (key === "f" && !event.repeat) exitRef.current();
      if (key === "v" && !event.repeat) callbacks.current.onVehicleChange((mode) => mode === "CAR" ? "BIKE" : mode === "BIKE" ? "YACHT" : "CAR");
    };
    const onKeyUp = (event) => {
      const key = event.key?.toLowerCase();
      if (key) keys.current.delete(key);
    };
    const clearKeys = () => keys.current.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("blur", clearKeys); };
  }, []);

  useFrame((_, delta) => {
    if (!vehicle.current || !avatar.current) return;
    if (!didSignalReady.current) { didSignalReady.current = true; callbacks.current.onSceneReady?.(); }
    // Keep the selected vehicle rendered as it moves between the city and sea.
    vehicle.current.visible = true;
    vehicle.current.userData.isPlayerVehicle = true;
    vehicle.current.userData.vehicleMode = vehicleMode;
    vehicle.current.userData.collisionBounds = vehicleBounds(vehicleMode);
    if (vehicleMode === "YACHT") vehicle.current.position.y = -0.4;
    const frame = Math.min(delta, 0.04);
    const pressed = keys.current;
    const forward = pressed.has("w") || pressed.has("arrowup") || touchInput.forward;
    const backward = pressed.has("s") || pressed.has("arrowdown") || touchInput.backward;
    const left = pressed.has("a") || pressed.has("arrowleft") || touchInput.left;
    const right = pressed.has("d") || pressed.has("arrowright") || touchInput.right;
    const brake = pressed.has(" ");

    const tour = cityTour.current;
    // Autopilot only controls the vehicle while it is actively moving. Paused, blocked or exited, the player drives.
    const autoDriving = tour.active && !tour.paused && vehicleMode !== "YACHT" && driving.current;
    if (autoDriving) {
      const stop = placeByLabel(tour.stops[tour.index]);
      const px = vehicle.current.position.x; const pz = vehicle.current.position.z;
      // Arrival is confirmed only after the vehicle is at the parking point and has actually stopped.
      const confirmArrival = () => {
        if (tour.candidateIndex > 0) tour.arrival = "alternate";
        if (tour.kind === "visit") { tour.active = false; tour.phase = "arrived"; reportTour("arrived"); }
        else { tour.phase = "viewing"; tour.dwell = 0; tour.waited = 0; tour.sawOpen = false; reportTour("viewing"); }
        callbacks.current.onSelect(tour.stops[tour.index]);
      };
      // Something stopped us making progress: back up, replan around it, try another parking spot, or pause and explain.
      const handleIncident = () => {
        tour.incidents += 1; tour.hold = 0; tour.anchor = { x: px, z: pz, t: 0 }; velocity.current = 0;
        const next = tour.route[Math.min(tour.waypoint, tour.route.length - 1)];
        const edge = next ? segmentAhead(px, pz, next[0], next[1]) : null;
        if (edge) tour.avoidEdges.add(edge);
        if (tour.incidents <= 3) {
          if (tour.incidents === 1) { tour.reverse = 1.1; return; }
          if (!planFromHere()) nextArrivalPoint();
        } else nextArrivalPoint();
        if (tour.phase !== "blocked") reportTour("driving");
      };
      if (tour.phase === "viewing") {
        // Parked at the building: wait while the information panel is open, then move on after a short pause.
        velocity.current *= Math.exp(-8 * frame);
        if (infoOpenRef.current) { tour.sawOpen = true; tour.dwell = 0; }
        else { tour.waited += frame; if (tour.sawOpen || tour.waited > 6) tour.dwell += frame; }
        if (tour.dwell > 2.6) {
          if (tour.index >= tour.stops.length - 1) { tour.active = false; tour.phase = "complete"; reportTour("complete"); }
          else { tour.index += 1; startLeg(); if (tour.phase !== "blocked") reportTour("driving"); }
        }
      } else if (stop && tour.phase === "stopping") {
        velocity.current *= Math.exp(-6 * frame);
        const parking = tour.route[tour.route.length - 1] ?? tour.target;
        const away = Math.hypot(parking[0] - px, parking[1] - pz);
        if (away > 2.2) tour.phase = "driving";
        else if (Math.abs(velocity.current) < 0.12 && away < 1.8) confirmArrival();
      } else if (stop && tour.reverse > 0) {
        tour.reverse -= frame;
        velocity.current += (-1.4 - velocity.current) * (1 - Math.exp(-4 * frame));
        if (tour.reverse <= 0) { velocity.current = 0; if (!planFromHere()) nextArrivalPoint(); if (tour.phase !== "blocked") reportTour("driving"); }
      } else if (stop && tour.route.length) {
        const [finalX, finalZ] = tour.route[tour.route.length - 1];
        const toFinal = Math.hypot(finalX - px, finalZ - pz);
        const follow = pursuit(tour.route, tour.waypoint, px, pz, Math.max(1.5, Math.min(4.8, 1.2 + Math.abs(velocity.current) * 0.8)), Math.max(0.85, Math.abs(velocity.current) / (tour.mode === "BIKE" ? 2.5 : 2.1)));
        tour.waypoint = follow.segment;
        if (toFinal < 1.0) tour.phase = "stopping";
        else {
          const dx = follow.target[0] - px; const dz = follow.target[1] - pz;
          const wanted = Math.atan2(-dx, -dz);
          const difference = Math.atan2(Math.sin(wanted - rotation.current), Math.cos(wanted - rotation.current));
          const steerRate = tour.mode === "BIKE" ? 2.5 : 2.1;
          rotation.current += Math.max(-steerRate * frame, Math.min(steerRate * frame, difference));
          // Improved autopilot cruise speed: swift and confident between stops, slowing smoothly for turns
          let cruise = Math.min(tour.mode === "BIKE" ? 6.0 : 5.5, Math.max(0.8, toFinal * 1.1));
          if (follow.toCorner < Infinity) cruise = Math.min(cruise, Math.max(2.4, 1.6 + follow.toCorner * 0.45));
          // Keep a safe gap behind any vehicle ahead instead of driving into it.
          const others = [];
          trafficRefs.forEach((other, index) => {
            if (!other || index === 3 || index === 4 || other.userData.isPlayerVehicle || other.userData.isAvatar) return;
            const bounds = other.userData.collisionBounds ?? vehicleBounds("CAR");
            others.push({ x: other.position.x, z: other.position.z, yaw: other.rotation.y, halfWidth: bounds.halfWidth, halfLength: bounds.halfLength });
          });
          // Look along the route, not along the nose of the vehicle, so a car waiting beside the path never blocks it.
          const gap = clearanceAhead(px, pz, wanted, vehicleBounds(tour.mode), others, 3 + Math.abs(velocity.current) * 1.6);
          const allowed = speedForGap(gap, cruise);
          const rate = allowed < velocity.current ? 6.5 : 3.6;
          velocity.current += (allowed - velocity.current) * (1 - Math.exp(-rate * frame));
          const yielding = gap !== Infinity && allowed < cruise * 0.5;
          if (yielding) { tour.anchor.t = 0; tour.anchor.x = px; tour.anchor.z = pz; if (Math.abs(velocity.current) < 0.2) tour.hold += frame; else tour.hold = 0; }
          else {
            tour.hold = 0; tour.anchor.t += frame;
            if (tour.anchor.t > 2.5) {
              const moved = Math.hypot(px - tour.anchor.x, pz - tour.anchor.z);
              if (moved < 0.6) handleIncident(); else tour.anchor = { x: px, z: pz, t: 0 };
            }
            // Moving but not getting closer (circling a corner, wedged on scenery): treat that as stuck too.
            if (follow.remaining < tour.bestRemaining - 0.5) { tour.bestRemaining = follow.remaining; tour.noGain = 0; }
            else { tour.noGain += frame; if (tour.noGain > 9) { tour.noGain = 0; tour.bestRemaining = Infinity; handleIncident(); } }
          }
          if (tour.hold > 20) handleIncident();
        }
      }
      vehicle.current.rotation.y = rotation.current;
      avatar.current.visible = false;
    }

    // Touching the helm hands control back to the player.
    if (!tour.active && vehicleMode === "YACHT" && autopilot.current && (forward || backward || left || right || brake)) {
      autopilot.current = false;
      paused.current = false;
      setRide("manual");
    }
    if (autoDriving) {
      // Movement and camera are driven by the autopilot route above.
    } else if (driving.current && vehicleMode === "YACHT" && autopilot.current) {
      const isLast = waypointIndex.current >= yachtRoute.length - 1;
      const [targetX, targetZ] = yachtRoute[waypointIndex.current];
      const toX = targetX - vehicle.current.position.x;
      const toZ = targetZ - vehicle.current.position.z;
      if (Math.hypot(toX, toZ) < (isLast ? 3.2 : 6)) {
        if (isLast) { stopRide(); return; }
        waypointIndex.current += 1;
      }
      const wanted = Math.atan2(-toX, -toZ);
      const difference = Math.atan2(Math.sin(wanted - rotation.current), Math.cos(wanted - rotation.current));
      rotation.current += Math.max(-0.9 * frame, Math.min(0.9 * frame, difference));
      const cruiseSpeed = paused.current ? 0 : isLast ? 2.0 : 3.8;
      velocity.current += (cruiseSpeed - velocity.current) * (1 - Math.exp(-1.8 * frame));
      vehicle.current.rotation.y = rotation.current;
      avatar.current.visible = false;
    } else if (driving.current) {
      // Improved manual vehicle driving: faster acceleration, higher top speed and crisp braking
      if (brake) velocity.current *= Math.exp(-9.5 * frame);
      else if (forward) velocity.current = Math.min(vehicleMode === "YACHT" ? 4.2 : vehicleMode === "BIKE" ? 12.2 : 11.4, velocity.current + (vehicleMode === "YACHT" ? 3.0 : vehicleMode === "BIKE" ? 8.6 : 7.8) * frame);
      else if (backward) velocity.current = Math.max(vehicleMode === "YACHT" ? -1.6 : -4.2, velocity.current - (vehicleMode === "YACHT" ? 2.0 : 6.2) * frame);
      else velocity.current *= Math.exp(-1.15 * frame);
      const steering = (left ? 1 : 0) - (right ? 1 : 0);
      if (steering && (Math.abs(velocity.current) > 0.12 || driving.current)) {
        const steeringDirection = Math.sign(velocity.current) || (backward ? -1 : 1);
        rotation.current += steering * (vehicleMode === "YACHT" ? 0.85 : vehicleMode === "BIKE" ? 2.3 : 1.95) * frame * steeringDirection;
      }
      vehicle.current.rotation.y = rotation.current;
      avatar.current.visible = false;
    } else {
      const turning = (left ? 1 : 0) - (right ? 1 : 0);
      if (turning) avatar.current.rotation.y += turning * 2.4 * frame;
      rotation.current = avatar.current.rotation.y;
      velocity.current = 0;
      avatar.current.visible = true;
    }

    const actor = driving.current ? vehicle.current : avatar.current;
    const oldX = actor.position.x;
    const oldZ = actor.position.z;
    const isRunning = !driving.current && (touchInput.run || pressed.has("shift"));
    const stride = driving.current ? velocity.current : (forward ? (isRunning ? 7.2 : 4.3) : backward ? -2.5 : 0);
    walking.current = !driving.current && stride !== 0;
    running.current = isRunning && forward;
    // Keep a wide ring of navigable ocean around the city. The previous
    // boundary was only a few units beyond the marina, so the yacht hit it
    // almost immediately and looked frozen while its speed value lingered.
    const movementLimit = driving.current && vehicleMode === "YACHT" ? 150 : 56;
    const requestedX = oldX - Math.sin(rotation.current) * stride * frame;
    const requestedZ = oldZ - Math.cos(rotation.current) * stride * frame;
    let nextX = Math.max(-movementLimit, Math.min(movementLimit, requestedX));
    let nextZ = Math.max(-movementLimit, Math.min(movementLimit, requestedZ));
    const hitWorldEdge = driving.current && (nextX !== requestedX || nextZ !== requestedZ);
    const radius = driving.current ? (vehicleMode === "YACHT" ? 2.6 : vehicleMode === "BIKE" ? 0.78 : 1.12) : 0.36;
    const nearestXRoad = nearestRoadLine(nextX);
    const nearestZRoad = nearestRoadLine(nextZ);
    const roadClearance = vehicleMode === "BIKE" ? 2.15 : 2.3;
    const hitRoadEdge = driving.current && vehicleMode !== "YACHT"
      && Math.min(Math.abs(nextX - nearestXRoad), Math.abs(nextZ - nearestZRoad)) > roadClearance;
    const hitIsland = driving.current && vehicleMode === "YACHT" && Math.abs(nextX) < 52 && Math.abs(nextZ) < 52;
    const hitDistrict = places.some(({ position, style }) => {
      const halfWidth = style === "shop" ? 2.25 : 1.55;
      const halfDepth = style === "shop" ? 1.9 : 1.55;
      return Math.abs(nextX - position[0]) < halfWidth + radius && Math.abs(nextZ - position[2]) < halfDepth + radius;
    });
    const hitHome = residentialPlaces.some((home) => Math.abs(nextX - home.position[0]) < home.width / 2 + radius && Math.abs(nextZ - home.position[2]) < home.depth / 2 + radius);
    const hitPond = Math.hypot((nextX - fishingPondPosition[0]) / 2.8, (nextZ - fishingPondPosition[2]) / 2.8) < 1 + radius / 2.8;
    const hitSkyline = skyline.some((building) => Math.abs(nextX - building.x) < building.width / 2 + radius && Math.abs(nextZ - building.z) < building.depth / 2 + radius);
    const hitTree = treePositions.some(([x, , z]) => Math.hypot(nextX - x, nextZ - z) < 0.48 + radius);
    const hitPerson = pedestrianSpots.some(([x, , z]) => Math.hypot(nextX - x, nextZ - z) < 0.4 + radius);
    const hitDog = dogSpots.some(([x, , z]) => Math.hypot(nextX - x, nextZ - z) < 0.35 + radius);
    const hitLight = [...streetLightPositions, ...trafficSignals.map(({ position }) => position)].some(([x, , z]) => Math.hypot(nextX - x, nextZ - z) < 0.22 + radius);
    const hitTraffic = trafficRefs.some((traffic, index) => {
      if (!traffic || !(index < 3 || index === 5 || index >= 6)) return false;
      if (driving.current && vehicleMode !== "YACHT") return Boolean(obbPenetration(nextX, nextZ, rotation.current, vehicleBounds(vehicleMode), traffic));
      return !driving.current && Math.hypot(nextX - traffic.position.x, nextZ - traffic.position.z) < (traffic.userData.isBus ? 5.8 : 3.1);
    });
    const hitParkedVehicle = !driving.current && Math.hypot(nextX - vehicle.current.position.x, nextZ - vehicle.current.position.z) < 2.45;
    if (hitRoadEdge && driving.current) {
      // At a junction, commit to the nearer road axis instead of freezing the
      // vehicle diagonally between lanes. Along a straight lane, slide forward
      // while holding the lane coordinate steady so steering can recover.
      const oldRoadX = nearestRoadLine(oldX);
      const oldRoadZ = nearestRoadLine(oldZ);
      const oldXOnRoad = Math.abs(oldX - oldRoadX) <= roadClearance;
      const oldZOnRoad = Math.abs(oldZ - oldRoadZ) <= roadClearance;
      if (oldXOnRoad && oldZOnRoad) {
        if (Math.abs(nextX - oldX) >= Math.abs(nextZ - oldZ)) nextZ = oldZ;
        else nextX = oldX;
      } else if (oldXOnRoad) {
        nextX = oldX;
      } else if (oldZOnRoad) {
        nextZ = oldZ;
      } else if (Math.abs(oldX - oldRoadX) <= Math.abs(oldZ - oldRoadZ)) {
        nextX = oldX + (oldRoadX - oldX) * Math.min(1, frame * 5);
        nextZ = oldZ;
      } else {
        nextX = oldX;
        nextZ = oldZ + (oldRoadZ - oldZ) * Math.min(1, frame * 5);
      }
      const remainsOnRoad = Math.min(Math.abs(nextX - nearestRoadLine(nextX)), Math.abs(nextZ - nearestRoadLine(nextZ))) <= roadClearance;
      if (!remainsOnRoad) {
        nextX = oldX;
        nextZ = oldZ;
      }
      velocity.current *= 0.82;
    }

    const sceneryDepths = (x, z) => {
      const depths = new Map();
      const addBox = (key, cx, cz, halfX, halfZ) => {
        const dx = halfX + radius - Math.abs(x - cx);
        const dz = halfZ + radius - Math.abs(z - cz);
        if (dx > 0 && dz > 0) depths.set(key, Math.min(dx, dz));
      };
      const addCircle = (key, cx, cz, obstacleRadius) => {
        const depth = obstacleRadius + radius - Math.hypot(x - cx, z - cz);
        if (depth > 0) depths.set(key, depth);
      };
      places.forEach(({ label, position, style }) => addBox(`place:${label}`, position[0], position[2], style === "shop" ? 2.25 : 1.5, style === "shop" ? 1.9 : 1.5));
      residentialPlaces.forEach((home) => addBox(`home:${home.id}`, home.position[0], home.position[2], home.width / 2, home.depth / 2));
      skyline.forEach((b, index) => addBox(`skyline:${index}`, b.x, b.z, b.width / 2, b.depth / 2));
      treePositions.forEach(([tx, , tz], index) => addCircle(`tree:${index}`, tx, tz, 0.48));
      pedestrianSpots.forEach(([px, , pz], index) => addCircle(`person:${index}`, px, pz, 0.4));
      dogSpots.forEach(([dx, , dz], index) => addCircle(`dog:${index}`, dx, dz, 0.35));
      streetLightPositions.forEach(([lx, , lz], index) => addCircle(`light:${index}`, lx, lz, 0.18));
      trafficSignals.forEach(({ position: [sx, , sz] }, index) => addCircle(`signal:${index}`, sx, sz, 0.24));
      const pondDepth = (1 + radius / 2.8 - Math.hypot((x - fishingPondPosition[0]) / 2.8, (z - fishingPondPosition[2]) / 2.8)) * 2.8;
      if (pondDepth > 0) depths.set("pond", pondDepth);
      return depths;
    };
    const escapingScenery = (x, z) => {
      const currentDepths = sceneryDepths(oldX, oldZ);
      const nextDepths = sceneryDepths(x, z);
      if ([...nextDepths.keys()].some((key) => !currentDepths.has(key))) return false;
      const currentDepth = [...currentDepths.values()].reduce((sum, depth) => sum + depth, 0);
      const nextDepth = [...nextDepths.values()].reduce((sum, depth) => sum + depth, 0);
      return nextDepth < currentDepth - 0.01;
    };
    const blockedAt = (x, z) => {
      if (x < -movementLimit || x > movementLimit || z < -movementLimit || z > movementLimit) return true;
      if (driving.current && vehicleMode !== "YACHT" && Math.min(Math.abs(x - nearestRoadLine(x)), Math.abs(z - nearestRoadLine(z))) > roadClearance) return true;
      if (driving.current && vehicleMode === "YACHT" && Math.abs(x) < 52 && Math.abs(z) < 52) return true;
      const sceneBlocked = places.some(({ position, style }) => Math.abs(x-position[0]) < (style === "shop" ? 2.25 : 1.5)+radius && Math.abs(z-position[2]) < (style === "shop" ? 1.9 : 1.5)+radius)
        || residentialPlaces.some((home) => Math.abs(x-home.position[0]) < home.width/2+radius && Math.abs(z-home.position[2]) < home.depth/2+radius)
        || Math.hypot((x-fishingPondPosition[0])/2.8,(z-fishingPondPosition[2])/2.8) < 1+radius/2.8
        || skyline.some((b) => Math.abs(x-b.x)<b.width/2+radius && Math.abs(z-b.z)<b.depth/2+radius)
        || treePositions.some(([tx,,tz]) => Math.hypot(x-tx,z-tz)<0.48+radius)
        || pedestrianSpots.some(([tx,,tz]) => Math.hypot(x-tx,z-tz)<0.4+radius)
        || dogSpots.some(([tx,,tz]) => Math.hypot(x-tx,z-tz)<0.35+radius)
        || [...streetLightPositions,...trafficSignals.map(({position})=>position)].some(([tx,,tz]) => Math.hypot(x-tx,z-tz)<0.22+radius);
      if (sceneBlocked && !(driving.current && backward && escapingScenery(x, z))) return true;
      const trafficBlocked = trafficRefs.some((other, index) => {
        if (!other || !(index < 3 || index === 5 || index >= 6)) return false;
        if (!driving.current) return Math.hypot(x-other.position.x,z-other.position.z)<(other.userData.isBus?5.8:3.1);
        if (vehicleMode === "YACHT") return false;
        const candidate = obbPenetration(x,z,rotation.current,vehicleBounds(vehicleMode),other);
        if (!candidate) return false;
        const current = obbPenetration(oldX,oldZ,rotation.current,vehicleBounds(vehicleMode),other);
        return !current || candidate.depth >= current.depth - 0.015;
      });
      if (trafficBlocked) return true;
      return !driving.current && Math.hypot(x-vehicle.current.position.x,z-vehicle.current.position.z)<2.45;
    };
    let didReset = false;
    if (resetRequested.current && driving.current && vehicleMode !== "YACHT") {
      resetRequested.current = false;
      const roadCoordinates = roadLines;
      rotation.current = 0;
      const uniqueCandidates = roadCoordinates.flatMap((x) => roadCoordinates.map((z) => [x,z]))
        .sort((a,b) => Math.hypot(a[0]-oldX,a[1]-oldZ)-Math.hypot(b[0]-oldX,b[1]-oldZ));
      const safe = uniqueCandidates.find(([x,z]) => {
        if (blockedAt(x,z)) return false;
        return !trafficRefs.some((other,index) => other && (index < 3 || index === 5 || index >= 6) && obbPenetration(x,z,0,vehicleBounds(vehicleMode),other));
      }) ?? [0,0];
      velocity.current = 0;
      vehicle.current.rotation.y = 0;
      vehicle.current.position.set(safe[0], vehicle.current.position.y, safe[1]);
      nextX = safe[0]; nextZ = safe[1];
      didReset = true;
    }
    if (!didReset && (hitDistrict || hitHome || hitPond || hitSkyline || hitTree || hitPerson || hitDog || hitLight || hitTraffic || hitParkedVehicle || hitIsland || hitWorldEdge)) {
      let separated = false;
      if (driving.current && hitTraffic) {
        const contact = trafficRefs.reduce((deepest, other, index) => {
          if (!other || !(index < 3 || index === 5 || index >= 6)) return deepest;
          const penetration = obbPenetration(oldX, oldZ, rotation.current, vehicleBounds(vehicleMode), other);
          return penetration && (!deepest || penetration.depth > deepest.depth) ? penetration : deepest;
        }, null);
        if (contact) {
          const push = Math.min(contact.depth + 0.04, 0.35);
          const pushX = oldX + contact.normal[0] * push;
          const pushZ = oldZ + contact.normal[1] * push;
          if (!blockedAt(pushX, pushZ)) { nextX = pushX; nextZ = pushZ; separated = true; }
        }
      }
      let canX = false;
      let canZ = false;
      if (!separated) {
        canX = !blockedAt(nextX, oldZ);
        canZ = !blockedAt(oldX, nextZ);
        if (canX) nextZ = oldZ;
        else if (canZ) nextX = oldX;
        else { nextX = oldX; nextZ = oldZ; }
      }
      // When walking straight into a parked vehicle or wall, gently move to a
      // nearby clear side so repeated forward input does not pin the avatar.
      if (!driving.current && canX && !canZ && Math.abs(nextX - oldX) < 0.001) {
        const side = oldX <= requestedX ? -1 : 1;
        const nudge = Math.min(0.18, Math.max(0.08, Math.abs(stride * frame) * 0.65));
        if (!blockedAt(oldX + side * nudge, oldZ)) nextX = oldX + side * nudge;
        else if (!blockedAt(oldX - side * nudge, oldZ)) nextX = oldX - side * nudge;
      }
      if (driving.current && !backward) velocity.current *= canX || canZ ? 0.82 : 0.55;
      walking.current = !driving.current && (canX || canZ);
    }

    actor.position.x = nextX;
    actor.position.z = nextZ;
    let closest = null;
    let closestDistance = Infinity;
    for (const place of places) {
      const point = place.interactionPosition ?? place.position;
      const distance = Math.hypot(nextX - point[0], nextZ - point[2]);
      if (distance < closestDistance) { closest = place; closestDistance = distance; }
    }
    const interactionRange = driving.current ? 3.0 : 4.4;
    const nextNearby = closestDistance < interactionRange ? closest.label : "";
    const actorRadius = driving.current ? vehicleBounds(vehicleMode).halfWidth : 0.36;
    canExploreTarget.current = Boolean(nextNearby && closestDistance < interactionRange && isClearFootPoint(nextX, nextZ, actorRadius, [3, 4]));
    if (nextNearby !== nearby.current) { nearby.current = nextNearby; callbacks.current.onNearbyChange(nextNearby); }

    const nextVehicleNear = !driving.current && Math.hypot(nextX - vehicle.current.position.x, nextZ - vehicle.current.position.z) < (vehicleMode === "YACHT" ? 5.6 : 3.2);
    if (nextVehicleNear !== vehicleNear.current) { vehicleNear.current = nextVehicleNear; callbacks.current.onVehicleNearChange(nextVehicleNear); }

    statusTimer.current += frame;
    if (statusTimer.current > 0.12) {
      statusTimer.current = 0;
      callbacks.current.onSpeedChange(driving.current ? Math.round(Math.abs(velocity.current) * (vehicleMode === "YACHT" ? 7 : 12)) : running.current ? 8 : walking.current ? 4 : 0);
      callbacks.current.onPositionChange({ x: nextX, z: nextZ });
    }

    const yachtPreview = !driving.current && vehicleMode === "YACHT";
    const focusX = yachtPreview ? vehicle.current.position.x : nextX;
    const focusZ = yachtPreview ? vehicle.current.position.z : nextZ;
    const followDistance = Math.max(driving.current || yachtPreview ? 7 : 4, (driving.current || yachtPreview ? 10.5 : 5.7) + cameraOrbit.current.zoom);
    // Keep a docked yacht in frame while it is selected, and follow the active
    // actor after boarding. The camera remains behind the selected unit.
    const cameraAngle = rotation.current + cameraOrbit.current.yaw;
    const tourViewPlace = cityTour.current.active && !cityTour.current.paused && cityTour.current.phase === "viewing" ? placeByLabel(cityTour.current.stops[cityTour.current.index]) : null;
    const desired = tourViewPlace ? {
      x: tourViewPlace.position[0] + Math.sign(nextX - tourViewPlace.position[0] || 1) * 8,
      y: Math.max(6, tourViewPlace.height * 0.72),
      z: tourViewPlace.position[2] + Math.sign(nextZ - tourViewPlace.position[2] || 1) * 8,
    } : {
      x: focusX + Math.sin(cameraAngle) * followDistance,
      y: driving.current ? 6.4 : Math.sin(cameraOrbit.current.pitch) * followDistance,
      z: focusZ + Math.cos(cameraAngle) * followDistance,
    };
    const activeCamera = cameraRef.current;
    const damp = (rate) => 1 - Math.exp(-rate * frame);
    activeCamera.position.x += (desired.x - activeCamera.position.x) * damp(3.2);
    activeCamera.position.y += (desired.y - activeCamera.position.y) * damp(2.4);
    activeCamera.position.z += (desired.z - activeCamera.position.z) * damp(3.2);
    // Speed-based field of view gives a sense of acceleration, like a chase camera in a racing game.
    const targetFov = !calm && driving.current && vehicleMode !== "YACHT" ? 58 + Math.min(13, Math.abs(velocity.current) * 1.1) : 58;
    if (Math.abs(activeCamera.fov - targetFov) > 0.02) {
      activeCamera.fov += (targetFov - activeCamera.fov) * damp(3);
      activeCamera.updateProjectionMatrix();
    }
    activeCamera.lookAt(tourViewPlace ? tourViewPlace.position[0] : focusX - Math.sin(rotation.current) * (driving.current ? 1.5 : 0), tourViewPlace ? Math.min(tourViewPlace.height * 0.55, 3.8) : driving.current ? 1.0 : 1.1, tourViewPlace ? tourViewPlace.position[2] : focusZ - Math.cos(rotation.current) * (driving.current ? 1.5 : 0));
  });

  return (
    <>
      <group ref={vehicle} position={[0, 0, 8]}>
        {vehicleMode === "BIKE"
          ? <Bike occupied={isDriving} speed={isDriving ? vehicleSpeed : 0} color={look.vehicleColor ?? undefined} jacket={look.outfit.jacket} />
          : vehicleMode === "YACHT"
            ? <Yacht occupied={isDriving} color={look.vehicleColor ?? undefined} jacket={look.outfit.jacket} />
            : <Car occupied={isDriving} speed={isDriving ? vehicleSpeed : 0} color={look.vehicleColor ?? undefined} jacket={look.outfit.jacket} />}
      </group>
      <PlayerAvatar avatarRef={avatar} walkingRef={walking} runningRef={running} look={look} />
    </>
  );
}
function City({ calm, look, infoOpen, lowPower, inputEnabled, yachtCommand, autoTourCommand, onAutoTourChange, rendererReady, onSceneReady, onResetReady, onRideStateChange, timeOfDay, onSelect, onNearbyChange, onVehicleNearChange, onDrivingChange, onInteractionReady, onExitReady, onSpeedChange, onPositionChange, onVehicleChange, vehicleMode, vehicleSpeed, touchInput, isDriving, routePoints }) {
  const [surfaceTextures, setSurfaceTextures] = useState(null);
  useEffect(() => {
    const loader = new TextureLoader();
    const files = [
      ["asphaltDiffuse", "/textures/asphalt-diffuse.jpg"],
      ["asphaltNormal", "/textures/asphalt-normal.jpg"],
      ["asphaltRoughness", "/textures/asphalt-roughness.jpg"],
    ];
    let cancelled = false;
    Promise.all(files.map(([, url]) => new Promise((resolve) => {
      loader.load(url, resolve, undefined, () => resolve(null));
    }))).then((loaded) => {
      if (cancelled) {
        loaded.forEach((texture) => texture?.dispose());
        return;
      }
      if (loaded.every(Boolean)) {
        setSurfaceTextures(Object.fromEntries(files.map(([name], index) => [name, loaded[index]])));
      } else {
        loaded.forEach((texture) => texture?.dispose());
      }
    });
    return () => { cancelled = true; };
  }, []);
  const asphaltDiffuse = surfaceTextures?.asphaltDiffuse;
  const asphaltNormal = surfaceTextures?.asphaltNormal;
  const asphaltRoughness = surfaceTextures?.asphaltRoughness;
  const [roadAlongZ, roadAlongX] = useMemo(() => {
    if (!asphaltDiffuse || !asphaltNormal || !asphaltRoughness) return [null, null];
    const makeRoadMaps = (repeatX, repeatY) => [asphaltDiffuse, asphaltNormal, asphaltRoughness].map((source, index) => {
      const texture = source.clone();
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      if (index === 0) texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    });
    return [makeRoadMaps(1, 22), makeRoadMaps(22, 1)];
  }, [asphaltDiffuse, asphaltNormal, asphaltRoughness]);
  return (
    <>
      <Atmosphere mode={timeOfDay} shadowSize={isSoftwareGl || lowPower || calm ? 512 : (typeof window !== "undefined" && window.innerWidth <= 900) ? 1536 : 2048} />
      <Waterfront />
      {trafficSignals.map((signal, index) => <TrafficSignal key={`traffic-signal-${index}`} {...signal} />)}

      {/* A connected city street grid */}
      {roadLines.map((line) => (
        <group key={`street-${line}`}>
          <mesh position={[line, -0.07, 0]} receiveShadow>
            <boxGeometry args={[3.8, 0.12, 100]} />
          <meshStandardMaterial map={roadAlongZ?.[0]} normalMap={roadAlongZ?.[1]} roughnessMap={roadAlongZ?.[2]} color="#555e69" normalScale={[0.24, 0.24]} roughness={0.96} />
          </mesh>
          <mesh position={[0, -0.065, line]} receiveShadow>
            <boxGeometry args={[100, 0.12, 3.8]} />
            <meshStandardMaterial map={roadAlongX?.[0]} normalMap={roadAlongX?.[1]} roughnessMap={roadAlongX?.[2]} color="#555e69" normalScale={[0.24, 0.24]} roughness={0.96} />
          </mesh>
          {[-1, 1].map((side) => (
            <group key={`${line}-${side}`}>
              <mesh position={[line + side * 2.28, -0.035, 0]}>
                <boxGeometry args={[0.42, 0.1, 100]} />
                <meshStandardMaterial color="#92999f" roughness={0.92} />
              </mesh>
              <mesh position={[0, -0.03, line + side * 2.28]}>
                <boxGeometry args={[100, 0.1, 0.42]} />
                <meshStandardMaterial color="#92999f" roughness={0.92} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* Lane dashes on primary avenues */}
      {Array.from({ length: 41 }, (_, i) => -40 + i * 2).map((line) => (
        <group key={`dash-${line}`}>
          <mesh position={[0, 0.005, line]}>
            <boxGeometry args={[0.13, 0.025, 0.85]} />
            <meshStandardMaterial color="#f6d77e" emissive="#745c26" emissiveIntensity={0.18} />
          </mesh>
          <mesh position={[line, 0.005, 0]}>
            <boxGeometry args={[0.85, 0.025, 0.13]} />
            <meshStandardMaterial color="#f6d77e" emissive="#745c26" emissiveIntensity={0.18} />
          </mesh>
        </group>
      ))}

      {/* Small access lanes lead visitors toward each landmark. */}
      {places.map((place) => {
        const [x, , z] = place.position;
        const startX = Math.sign(x) * 1.9;
        const length = Math.abs(x) - 3.3;
        return (
          <mesh key={`access-${place.label}`} position={[(startX + x - Math.sign(x) * 1.7) / 2, -0.015, z]}>
            <boxGeometry args={[Math.max(0.2, length), 0.07, 1.65]} />
            <meshStandardMaterial color="#626b76" roughness={0.95} />
          </mesh>
        );
      })}

      {/* Green pockets, trees, street lights, and distant skyline */}
      {treePositions.map((position, index) => index % 4 === 0
        ? <BroadleafTree key={`tree-${index}`} position={position} scale={index % 3 === 0 ? 1.15 : 0.9} />
        : <Tree key={`tree-${index}`} position={position} scale={index % 3 === 0 ? 1.15 : 0.9} />)}
      <WalkingTrail />
      <Playground />
      <FishingPond />
      {residentialPlaces.map((home) => <ResidentialHome key={home.id} home={home} />)}
      {!calm && pedestrianSpots.map((position, index) => <Person key={`person-${index}`} position={position} outfit={["#bd6655", "#3e6f83", "#8b6e42", "#78547d"][index % 4]} phase={((index + 0.5) * walkingLoopLength) / (pedestrianSpots.length + dogSpots.length)} />)}
      {!calm && dogSpots.map((position, index) => <Dog key={`dog-${index}`} position={position} coat={["#bc8b58", "#dcc9a8", "#725442"][index]} phase={((pedestrianSpots.length + index + 0.5) * walkingLoopLength) / (pedestrianSpots.length + dogSpots.length)} />)}
      {streetLightPositions.map((position, index) => <StreetLight key={`lamp-${index}`} position={position} />)}
      {skyline.map((building, index) => <BackgroundBuilding key={`skyline-${index}`} building={building} />)}

      {/* Portfolio districts */}
      {places.map((place) => <Building key={place.label} place={place} />)}
      <NavigationRoute points={routePoints} />

      {/* Light ambient traffic makes the streets feel inhabited. */}
      {!calm && <>
      {trafficCars.map((car) => <TrafficCar key={car.slot} {...car} />)}
      <SchoolBus fixed={schoolBus.fixed} start={schoolBus.start} speed={schoolBus.speed} />
      </>}

      {vehicleMode !== "YACHT" && <group position={yachtMoor}><Yacht color={look.vehicleColor ?? undefined} jacket={look.outfit.jacket} /></group>}

      <PlayerVehicle
        calm={calm}
        look={look}
        infoOpen={infoOpen}
        inputEnabled={inputEnabled}
        yachtCommand={yachtCommand}
        autoTourCommand={autoTourCommand}
        onAutoTourChange={onAutoTourChange}
        rendererReady={rendererReady}
        onSceneReady={onSceneReady}
        onResetReady={onResetReady}
        onRideStateChange={onRideStateChange}
        onSelect={onSelect}
        onNearbyChange={onNearbyChange}
        onVehicleNearChange={onVehicleNearChange}
        onDrivingChange={onDrivingChange}
        onInteractionReady={onInteractionReady}
        onExitReady={onExitReady}
        onSpeedChange={onSpeedChange}
        onPositionChange={onPositionChange}
        onVehicleChange={onVehicleChange}
        vehicleMode={vehicleMode}
        vehicleSpeed={vehicleSpeed}
        touchInput={touchInput}
        isDriving={isDriving}
      />
    </>
  );
}

function CityFallback({ className = "", calm = false, onShown, onRideStateChange, onVehicleChange, onDrivingChange, onInteractionReady, onExitReady, onResetReady, vehicleMode, timeOfDay, touchInput = {}, yachtCommand }) {
  const [ride, setRide] = useState("idle");
  const handledCommand = useRef(0);
  const [boatOffset, setBoatOffset] = useState({ x: 0, y: 0, turn: 0 });
  useEffect(() => { onShown?.(); }, [onShown]);
  const stopFallbackRide = useCallback(() => { setRide("idle"); setBoatOffset({x:0,y:0,turn:0}); onDrivingChange?.(false); onRideStateChange?.("idle"); }, [onDrivingChange, onRideStateChange]);
  useEffect(() => {
    // The decorative fallback stays mounted behind the 3D canvas. Once Three is
    // ready, it must not replace the live player's Reset Position handler.
    if (!className.includes("is-hidden")) onResetReady?.(stopFallbackRide);
  }, [className, onResetReady, stopFallbackRide]);
  useEffect(() => {
    if (!yachtCommand || handledCommand.current === yachtCommand.id) return;
    handledCommand.current = yachtCommand.id;
    // These effects synchronize incoming HUD commands with fallback state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (yachtCommand.action === "start") { onVehicleChange?.("YACHT"); onDrivingChange?.(true); setRide("cruising"); onRideStateChange?.("cruising"); }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (yachtCommand.action === "pause" && (ride === "cruising" || ride === "manual")) { setRide("paused"); onRideStateChange?.("paused"); }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (yachtCommand.action === "resume" && ride === "paused") { setRide("cruising"); onRideStateChange?.("cruising"); }
    if (yachtCommand.action === "stop") stopFallbackRide();
  }, [yachtCommand, ride, onVehicleChange, onDrivingChange, onRideStateChange, stopFallbackRide]);
  useEffect(() => {
    const steer = (dx,dy,turn=0) => setBoatOffset((p)=>({x:Math.max(-130,Math.min(130,p.x+dx)),y:Math.max(-38,Math.min(38,p.y+dy)),turn:p.turn+turn}));
    const onKey = (event) => {
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT","TEXTAREA","SELECT"].includes(event.target.tagName))) return;
      const key = event.key?.toLowerCase();
      if (!key || !["w","a","s","d","arrowup","arrowleft","arrowdown","arrowright"].includes(key) || vehicleMode !== "YACHT") return;
      event.preventDefault(); if (ride !== "manual") { setRide("manual"); onRideStateChange?.("manual"); onDrivingChange?.(true); }
      if(key==="a"||key==="arrowleft") steer(-18,0,-8); else if(key==="d"||key==="arrowright") steer(18,0,8); else if(key==="w"||key==="arrowup") steer(0,-8); else steer(0,8);
    };
    window.addEventListener("keydown",onKey); return()=>window.removeEventListener("keydown",onKey);
  }, [vehicleMode, ride, onRideStateChange, onDrivingChange]);
  useEffect(() => {
    if (vehicleMode !== "YACHT" || ride === "idle") return;
    let dx=0,dy=0,turn=0;
    if(touchInput.left){dx-=18;turn-=8;} if(touchInput.right){dx+=18;turn+=8;} if(touchInput.forward)dy-=8; if(touchInput.backward)dy+=8;
    // Touch state comes from held on-screen controls.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if(dx||dy){setBoatOffset((p)=>({x:Math.max(-130,Math.min(130,p.x+dx)),y:Math.max(-38,Math.min(38,p.y+dy)),turn:p.turn+turn})); setRide("manual"); onRideStateChange?.("manual"); onDrivingChange?.(true);}
  }, [touchInput.left,touchInput.right,touchInput.forward,touchInput.backward,vehicleMode,ride,onRideStateChange,onDrivingChange]);
  useEffect(() => {
    if (vehicleMode !== "YACHT") return;
    const interact = () => { if (ride !== "idle") stopFallbackRide(); else { setRide("cruising"); onDrivingChange?.(true); onRideStateChange?.("cruising"); } };
    onInteractionReady?.(interact); onExitReady?.(stopFallbackRide);
    return () => { onInteractionReady?.(() => {}); onExitReady?.(() => {}); };
  }, [vehicleMode, ride, onInteractionReady, onExitReady, onDrivingChange, onRideStateChange, stopFallbackRide]);
  return <div className={`scene-fallback ${className}${calm ? " is-calm" : ""}`} role="img" aria-label="Illustrated Viswa City and marina fallback">
    <div className={`fallback-sky time-${timeOfDay?.toLowerCase()}`}><span className="fallback-sun" /></div>
    <div className="fallback-sea"><span className={`fallback-yacht ${ride === "cruising" ? "is-cruising" : ride === "paused" ? "is-paused" : ride === "manual" ? "is-manual" : ""}`} style={ride === "manual" ? { transform:`translate(${boatOffset.x}px,${boatOffset.y}px) rotate(${boatOffset.turn}deg) scaleX(-1)` } : undefined}>🛥️</span><span className="fallback-pier" /></div>
    <div className="fallback-city">
      <div className="fallback-road fallback-road-x" /><div className="fallback-road fallback-road-z" />
      <div className="fallback-buildings"><span>EDUCATION</span><span>SKILLS</span><span>PROJECTS</span><span>EXPERIENCE</span><span>CERTIFICATES</span><span>CONTACT</span></div>
      <span className="fallback-avatar">🚶</span>
      {vehicleMode !== "YACHT" && <span className="fallback-car">{vehicleMode === "BIKE" ? "🏍️" : "🚗"}</span>}
    </div>
    <div className="fallback-caption"><small>VISWA CITY · OFFLINE SCENE</small><strong>{ride === "cruising" ? "Harbor cruise underway" : ride === "paused" ? "Yacht anchored" : ride === "manual" ? "You have the helm" : "City view · local fallback"}</strong><span>{ride === "idle" ? "The city stays open even when 3D graphics are unavailable." : ride === "manual" ? "Use WASD or the on-screen arrows to steer." : "Use Pause, Resume, Stop, or Exit in the Harbor Cruise panel."}</span></div>
  </div>;
}

export default function CityScene({
  timeOfDay = "DUSK",
  calm = false,
  look,
  infoOpen = false,
  yachtCommand = null,
  autoTourCommand = null,
  onAutoTourChange,
 
  onSceneReady,
  onStage,
  onFallback,
  onSceneError,
  onGraphicsNotice,
  inputEnabled = true,
  onResetReady,
  onRideStateChange,
  onSelect,
  onNearbyChange,
  onSpeedChange,
  onPositionChange,
  onVehicleNearChange,
  onDrivingChange,
  onInteractionReady,
  onExitReady,
  onVehicleChange,
  vehicleMode,
  vehicleSpeed = 0,
  touchInput,
  isDriving,
  routePoints = [],
}) {
  const getResponsiveDpr = () => {
    if (typeof window === "undefined") return 1;
    const nativeDpr = window.devicePixelRatio || 1;
    if (window.innerWidth <= 640) return Math.min(nativeDpr, 1.25);
    if (window.innerWidth <= 1024) return Math.min(nativeDpr, 1.5);
    return Math.min(nativeDpr, window.innerWidth >= 2560 ? 1.75 : 1.6);
  };
  const [dpr, setDpr] = useState(getResponsiveDpr);
  const [rendererReady, setRendererReady] = useState(false);
  const [lowPower, setLowPower] = useState(false);
  const tagLayer = useRef(null);
  const handleSceneReady = useCallback(() => { setRendererReady(true); onSceneReady?.(); }, [onSceneReady]);

  useEffect(() => {
    // Debounced so dragging the window edge does not rebuild the renderer on every pixel.
    let timer = 0;
    const updateDpr = () => { clearTimeout(timer); timer = setTimeout(() => setDpr(getResponsiveDpr()), 150); };
    window.addEventListener("resize", updateDpr);
    return () => { clearTimeout(timer); window.removeEventListener("resize", updateDpr); };
  }, []);

  return (
    <>
    <CityFallback className={rendererReady ? "is-hidden" : ""} calm={calm} yachtCommand={yachtCommand} onRideStateChange={onRideStateChange} onVehicleChange={onVehicleChange} onDrivingChange={onDrivingChange} onInteractionReady={onInteractionReady} onExitReady={onExitReady} onResetReady={onResetReady} vehicleMode={vehicleMode} timeOfDay={timeOfDay} touchInput={touchInput} />
    <div className="building-tags" ref={tagLayer} aria-hidden="true">
      {places.map((place, index) => <span key={place.label} className="building-tag" data-tag={index} style={{ "--tag": place.color }}>{place.label}</span>)}
    </div>
    <SceneBoundary onError={onSceneError} fallback={<CityFallback calm={calm} onShown={onFallback} yachtCommand={yachtCommand} onRideStateChange={onRideStateChange} onVehicleChange={onVehicleChange} onDrivingChange={onDrivingChange} onInteractionReady={onInteractionReady} onExitReady={onExitReady} onResetReady={onResetReady} vehicleMode={vehicleMode} timeOfDay={timeOfDay} touchInput={touchInput} />}>
    <Canvas
      dpr={isSoftwareGl || calm || lowPower ? 1 : dpr}
      shadows={!isSoftwareGl}
      gl={{ antialias: !isSoftwareGl, powerPreference: "high-performance", toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.12 }}
      fallback={<CityFallback calm={calm} yachtCommand={yachtCommand} onShown={onFallback} onRideStateChange={onRideStateChange} onVehicleChange={onVehicleChange} onDrivingChange={onDrivingChange} onInteractionReady={onInteractionReady} onExitReady={onExitReady} onResetReady={onResetReady} vehicleMode={vehicleMode} timeOfDay={timeOfDay} touchInput={touchInput} />}
      onCreated={({ gl }) => {
        gl.shadowMap.type = PCFShadowMap;
        onStage?.("renderer");
        // Let the browser restore the GPU context instead of leaving a blank scene.
        gl.domElement.addEventListener("webglcontextlost", (event) => { event.preventDefault(); onGraphicsNotice?.("Graphics paused. Restoring the city…"); });
        gl.domElement.addEventListener("webglcontextrestored", () => onGraphicsNotice?.("Graphics restored."));
      }}
      camera={{ position: [0, 7, 18], fov: 58, near: 0.1, far: 160 }}
    >
      <PerformanceMonitor onDecline={() => setLowPower(true)} />
      <TagProjector layerRef={tagLayer} />
      <City
        calm={calm}
        look={look}
        infoOpen={infoOpen}
        lowPower={lowPower}
        inputEnabled={inputEnabled}
        yachtCommand={yachtCommand}
        autoTourCommand={autoTourCommand}
        onAutoTourChange={onAutoTourChange}
        rendererReady={rendererReady}
        onSceneReady={handleSceneReady}
        onResetReady={onResetReady}
        onRideStateChange={onRideStateChange}
        timeOfDay={timeOfDay}
        onSelect={onSelect}
        onNearbyChange={onNearbyChange}
        onSpeedChange={onSpeedChange}
        onPositionChange={onPositionChange}
        onVehicleNearChange={onVehicleNearChange}
        onDrivingChange={onDrivingChange}
        onInteractionReady={onInteractionReady}
        onExitReady={onExitReady}
        onVehicleChange={onVehicleChange}
        vehicleMode={vehicleMode}
        vehicleSpeed={vehicleSpeed}
        touchInput={touchInput}
        isDriving={isDriving}
        routePoints={routePoints}
      />
    </Canvas>
    </SceneBoundary>
    </>
  );
}






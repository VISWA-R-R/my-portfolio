// Pure navigation logic for the autopilot: the street grid, the real obstacles in the scene,
// route planning, arrival points and traffic-aware speed. No React and no 3D objects, so it can be tested on its own.
import { cityPlaces as places, residentialPlaces, fishingPondPosition } from "./cityData";
import { skyline, treePositions, pedestrianSpots, dogSpots, streetLightPositions, trafficSignals, trafficCars, schoolBus } from "./sceneData";

export const roadLines = [-40, -30, -20, -10, 0, 10, 20, 30, 40];
export const tourStops = ["EDUCATION", "SKILLS", "PROJECTS", "EXPERIENCE", "CERTIFICATES", "GITHUB", "BYTE CAFE", "CAMPUS BOOKS", "CITY GARAGE", "CONTACT"];
export const nearestRoadLine = (coordinate) => Math.max(-40, Math.min(40, Math.round(coordinate / 10) * 10));
export const clampRoad = (value) => Math.max(-40, Math.min(40, value));
export const placeByLabel = (label) => places.find((place) => place.label === label);
// Every building has an interaction point on the street next to it.
export const approachPoint = (place) => { const point = place.interactionPosition ?? place.position; return [point[0], point[2]]; };
export const vehicleBounds = (mode = "CAR") => mode === "YACHT"
  ? { halfWidth: 1.24, halfLength: 3.25 }
  : mode === "BIKE"
    ? { halfWidth: 0.55, halfLength: 1.18 }
    : { halfWidth: 0.96, halfLength: 1.52 };
export const vehicleRadius = (mode = "CAR") => (mode === "BIKE" ? 0.78 : 1.12);

// Same obstacle test the movement code uses, so planned routes and real collisions agree.
export function staticBlocked(x, z, radius) {
  return places.some(({ position, style }) => Math.abs(x - position[0]) < (style === "shop" ? 2.25 : 1.5) + radius && Math.abs(z - position[2]) < (style === "shop" ? 1.9 : 1.5) + radius)
    || residentialPlaces.some((home) => Math.abs(x - home.position[0]) < home.width / 2 + radius && Math.abs(z - home.position[2]) < home.depth / 2 + radius)
    || Math.hypot((x - fishingPondPosition[0]) / 2.8, (z - fishingPondPosition[2]) / 2.8) < 1 + radius / 2.8
    || skyline.some((b) => Math.abs(x - b.x) < b.width / 2 + radius && Math.abs(z - b.z) < b.depth / 2 + radius)
    || treePositions.some(([tx, , tz]) => Math.hypot(x - tx, z - tz) < 0.48 + radius)
    || pedestrianSpots.some(([tx, , tz]) => Math.hypot(x - tx, z - tz) < 0.4 + radius)
    || dogSpots.some(([tx, , tz]) => Math.hypot(x - tx, z - tz) < 0.35 + radius)
    || [...streetLightPositions, ...trafficSignals.map(({ position }) => position)].some(([tx, , tz]) => Math.hypot(x - tx, z - tz) < 0.22 + radius);
}

export function segmentBlocked(ax, az, bx, bz, radius, step = 0.4) {
  const length = Math.hypot(bx - ax, bz - az);
  const samples = Math.max(1, Math.ceil(length / step));
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    if (staticBlocked(ax + (bx - ax) * t, az + (bz - az) * t, radius)) return true;
  }
  return false;
}

export function projectToRoad(x, z) {
  const roadX = nearestRoadLine(x); const roadZ = nearestRoadLine(z);
  return Math.abs(x - roadX) <= Math.abs(z - roadZ) ? [roadX, clampRoad(z)] : [clampRoad(x), roadZ];
}

export const edgeKey = (ax, az, bx, bz) => ((ax < bx || (ax === bx && az < bz)) ? `${ax},${az}|${bx},${bz}` : `${bx},${bz}|${ax},${az}`);

// Street segments between neighbouring junctions that a vehicle of this size cannot drive through.
const blockedEdgeCache = new Map();
export function blockedEdges(radius) {
  if (blockedEdgeCache.has(radius)) return blockedEdgeCache.get(radius);
  const blocked = new Set();
  for (const x of roadLines) for (const z of roadLines) {
    if (x < 40 && segmentBlocked(x, z, x + 10, z, radius)) blocked.add(edgeKey(x, z, x + 10, z));
    if (z < 40 && segmentBlocked(x, z, x, z + 10, radius)) blocked.add(edgeKey(x, z, x, z + 10));
  }
  blockedEdgeCache.set(radius, blocked);
  return blocked;
}

// The junction(s) at either end of the street segment a point sits on.
export function roadEndpoints(x, z) {
  const roadX = nearestRoadLine(x); const roadZ = nearestRoadLine(z);
  const onVertical = Math.abs(x - roadX) < 0.75; const onHorizontal = Math.abs(z - roadZ) < 0.75;
  const pair = (value) => [...new Set([clampRoad(Math.floor(value / 10) * 10), clampRoad(Math.ceil(value / 10) * 10)])];
  if (onVertical && onHorizontal) return [[roadX, roadZ]];
  if (onVertical) return pair(z).map((nz) => [roadX, nz]);
  if (onHorizontal) return pair(x).map((nx) => [nx, roadZ]);
  return [[roadX, roadZ]];
}

function junctionPath(sx, sz, tx, tz, blocked) {
  const key = (x, z) => `${x},${z}`;
  const queue = [[sx, sz]]; const previous = new Map([[key(sx, sz), null]]);
  for (let cursor = 0; cursor < queue.length && !previous.has(key(tx, tz)); cursor += 1) {
    const [x, z] = queue[cursor];
    for (const [nx, nz] of [[x + 10, z], [x - 10, z], [x, z + 10], [x, z - 10]]) {
      if (nx < -40 || nx > 40 || nz < -40 || nz > 40) continue;
      const nodeKey = key(nx, nz);
      if (previous.has(nodeKey) || blocked.has(edgeKey(x, z, nx, nz))) continue;
      previous.set(nodeKey, key(x, z)); queue.push([nx, nz]);
    }
  }
  if (!previous.has(key(tx, tz))) return null;
  const path = [];
  for (let node = key(tx, tz); node; node = previous.get(node)) path.push(node.split(",").map(Number));
  return path.reverse();
}

const noJunctionBetween = (a, b) => { const low = Math.min(a, b); const high = Math.max(a, b); return !(Math.ceil((low + 1e-6) / 10) * 10 < high - 1e-6); };

// A route along the street grid that avoids segments blocked by real scenery and any extra segments to avoid.
// Returns null when no clear route exists.
export function planRoute(sx, sz, tx, tz, { radius = vehicleRadius("CAR"), avoid = new Set() } = {}) {
  const blocked = new Set([...blockedEdges(radius), ...avoid]);
  const candidates = [];
  // Start and target on the same street segment: drive straight there.
  const sameVertical = Math.abs(sx - tx) < 1.6 && nearestRoadLine(sx) === nearestRoadLine(tx) && Math.abs(sx - nearestRoadLine(sx)) < 0.75 && noJunctionBetween(sz, tz);
  const sameHorizontal = Math.abs(sz - tz) < 1.6 && nearestRoadLine(sz) === nearestRoadLine(tz) && Math.abs(sz - nearestRoadLine(sz)) < 0.75 && noJunctionBetween(sx, tx);
  if ((sameVertical || sameHorizontal) && !segmentBlocked(sx, sz, tx, tz, radius)) candidates.push([[sx, sz], [tx, tz]]);
  for (const start of roadEndpoints(sx, sz)) for (const end of roadEndpoints(tx, tz)) {
    if (segmentBlocked(end[0], end[1], tx, tz, radius)) continue;
    const path = junctionPath(start[0], start[1], end[0], end[1], blocked);
    if (path) candidates.push([[sx, sz], ...path, [tx, tz]]);
  }
  const lengthOf = (points) => points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - points[index][0], point[1] - points[index][1]), 0);
  candidates.sort((a, b) => lengthOf(a) - lengthOf(b));
  const best = candidates[0];
  if (!best) return null;
  return best.filter((point, index) => index === 0 || Math.hypot(point[0] - best[index - 1][0], point[1] - best[index - 1][1]) > 0.05);
}

// Clear points on the streets beside a building where the vehicle can park: the planned point first, then nearby alternatives.
export function arrivalCandidates(place, radius = vehicleRadius("CAR")) {
  const [baseX, baseZ] = approachPoint(place);
  const [bx, , bz] = place.position;
  const offsets = [0, 2, -2, 3.5, -3.5, 5, -5];
  const around = [Math.floor(bx / 10) * 10, Math.ceil(bx / 10) * 10];
  const aroundZ = [Math.floor(bz / 10) * 10, Math.ceil(bz / 10) * 10];
  const found = [];
  for (const x of new Set(around)) for (const d of offsets) found.push([x, clampRoad(bz + d)]);
  for (const z of new Set(aroundZ)) for (const d of offsets) found.push([clampRoad(bx + d), z]);
  const unique = new Map();
  for (const point of found) {
    if (point[0] < -40 || point[0] > 40 || point[1] < -40 || point[1] > 40) continue;
    if (Math.hypot(point[0] - bx, point[1] - bz) > 8.5) continue;
    if (staticBlocked(point[0], point[1], radius)) continue;
    unique.set(`${point[0]},${point[1]}`, point);
  }
  const list = [...unique.values()].filter((point) => Math.hypot(point[0] - baseX, point[1] - baseZ) > 0.01);
  list.sort((a, b) => Math.hypot(a[0] - baseX, a[1] - baseZ) - Math.hypot(b[0] - baseX, b[1] - baseZ));
  return staticBlocked(baseX, baseZ, radius) ? list : [[baseX, baseZ], ...list];
}

// Distance from our front bumper to the nearest vehicle in the corridor ahead (Infinity when clear).
// obstacles: [{ x, z, yaw, halfWidth, halfLength }]. Forward for yaw is (-sin, -cos), the same as the movement code.
export function clearanceAhead(px, pz, yaw, own, obstacles, lookahead) {
  const forwardX = -Math.sin(yaw); const forwardZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw); const rightZ = -Math.sin(yaw);
  let nearest = Infinity;
  for (const other of obstacles) {
    const dx = other.x - px; const dz = other.z - pz;
    const forward = dx * forwardX + dz * forwardZ;
    const lateral = dx * rightX + dz * rightZ;
    const turn = other.yaw - yaw;
    const extentLateral = other.halfWidth * Math.abs(Math.cos(turn)) + other.halfLength * Math.abs(Math.sin(turn));
    const extentForward = other.halfWidth * Math.abs(Math.sin(turn)) + other.halfLength * Math.abs(Math.cos(turn));
    // Cross traffic only blocks if our swept path really overlaps it; same-direction traffic gets a safety margin.
    const crossing = Math.abs(Math.sin(turn)) > 0.7;
    if (Math.abs(lateral) >= own.halfWidth + extentLateral + (crossing ? -0.05 : 0.1)) continue;
    const gap = forward - extentForward - own.halfLength;
    if (forward + extentForward < 0 || gap > lookahead) continue;
    nearest = Math.min(nearest, Math.max(0, gap));
  }
  return nearest;
}

// Slow down and stop behind whatever is ahead; never push into it.
export const speedForGap = (gap, cruise) => (gap === Infinity ? cruise : Math.max(0, Math.min(cruise, (gap - 0.9) * 1.4)));

// The street segment a vehicle is currently driving along, in its direction of travel (null at the edge of the grid).
export function segmentAhead(px, pz, tx, tz) {
  const horizontal = Math.abs(tx - px) >= Math.abs(tz - pz);
  const sign = Math.sign(horizontal ? tx - px : tz - pz) || 1;
  const along = horizontal ? px : pz;
  const low = sign > 0 ? Math.floor((along + 1e-6) / 10) * 10 : Math.ceil((along - 1e-6) / 10) * 10 - 10;
  const high = low + 10;
  if (low < -40 || high > 40) return null;
  const line = nearestRoadLine(horizontal ? pz : px);
  return horizontal ? edgeKey(low, line, high, line) : edgeKey(line, low, line, high);
}

// ---- Lanes: drive where traffic drives (or clear of it) instead of down the middle of a two-lane street ----
const trafficLanes = [
  ...trafficCars.map((car) => ({ axis: car.axis, fixed: car.fixed, direction: car.direction, half: 0.96 })),
  { axis: schoolBus.axis, fixed: schoolBus.fixed, direction: schoolBus.direction, half: 1.42 },
];
// Sideways offset from the street's centre line for a vehicle travelling along `axis` in `direction`:
// join the lane that flows the same way, or sit just far enough from the traffic lanes to clear them.
export function laneOffset(axis, centre, direction, ownHalfWidth = 0.96, parking = false) {
  const lanes = trafficLanes.filter((lane) => lane.axis === axis && Math.abs(lane.fixed - centre) < 1.6);
  if (!lanes.length) return 0;
  const same = lanes.find((lane) => lane.direction === direction);
  if (same && !parking) return same.fixed - centre;
  const mean = lanes.reduce((sum, lane) => sum + (lane.fixed - centre), 0) / lanes.length;
  const clear = (lane) => lane.half + ownHalfWidth + 0.12;
  return mean > 0
    ? Math.min(...lanes.map((lane) => lane.fixed - centre - clear(lane)))
    : Math.max(...lanes.map((lane) => lane.fixed - centre + clear(lane)));
}

// Shift a junction-to-junction route into the correct lane. Corners use the lane of each street they join.
export function laneRoute(route, ownHalfWidth = 0.96, radius = vehicleRadius("CAR")) {
  if (route.length < 3) return route;
  const segments = route.slice(1).map((point, index) => {
    const dx = point[0] - route[index][0]; const dz = point[1] - route[index][1];
    const horizontal = Math.abs(dx) >= Math.abs(dz);
    const direction = Math.sign(horizontal ? dx : dz) || 1;
    const centre = nearestRoadLine(horizontal ? route[index][1] : route[index][0]);
    const axis = horizontal ? "x" : "z";
    // Preferred lane first, then the lane clear of traffic, then the centre line; keep the first one free of scenery.
    const a = route[index]; const b = point;
    const shifted = (o) => (horizontal ? [a[0], centre + o, b[0], centre + o] : [centre + o, a[1], centre + o, b[1]]);
    const options = [laneOffset(axis, centre, direction, ownHalfWidth), laneOffset(axis, centre, direction, ownHalfWidth, true), 0];
    const offset = options.find((o) => !segmentBlocked(...shifted(o), radius)) ?? 0;
    return { horizontal, offset };
  });
  return route.map((point, index) => {
    if (index === 0) return point;
    // Park in the lane we arrive in (not across the whole street), so waiting traffic is never blocked head-on.
    if (index === route.length - 1) {
      const last = segments[index - 1];
      const prior = route[index - 1];
      const parkOffset = laneOffset(last.horizontal ? "x" : "z", nearestRoadLine(last.horizontal ? prior[1] : prior[0]), Math.sign(last.horizontal ? point[0] - prior[0] : point[1] - prior[1]) || 1, ownHalfWidth, true);
      const lineAt = (o) => (last.horizontal ? [prior[0], point[1] + o, point[0], point[1] + o] : [point[0] + o, prior[1], point[0] + o, point[1]]);
      const safe = [parkOffset, last.offset, 0].find((o) => !segmentBlocked(...lineAt(o), radius)) ?? 0;
      return last.horizontal ? [point[0], point[1] + safe] : [point[0] + safe, point[1]];
    }
    const before = segments[index - 1]; const after = segments[index];
    const vertical = before.horizontal ? after : before;      // the segment that runs along z sets the x offset
    const horizontal = before.horizontal ? before : after;    // the segment that runs along x sets the z offset
    const x = point[0] + (before.horizontal && after.horizontal ? 0 : vertical.horizontal ? 0 : vertical.offset);
    const z = point[1] + (before.horizontal || after.horizontal ? horizontal.offset : 0);
    return [x, z];
  });
}

// Pure-pursuit path following: steer toward a point a little way ahead on the route. This rounds corners smoothly
// and keeps the vehicle on its lane instead of cutting across scenery.
export function pursuit(route, segment, px, pz, lookahead, reach = 1.0) {
  let index = Math.max(1, Math.min(segment, route.length - 1));
  const project = (i) => {
    const [ax, az] = route[i - 1]; const [bx, bz] = route[i];
    const length = Math.hypot(bx - ax, bz - az) || 1;
    return { t: ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / (length * length), length };
  };
  // Move on to the next segment once we are past a corner, or close enough to it to start turning.
  while (index < route.length - 1 && (project(index).t >= 0.97 || Math.hypot(route[index][0] - px, route[index][1] - pz) < reach || project(index + 1).t > 0.15)) index += 1;
  const [ax, az] = route[index - 1]; const [bx, bz] = route[index];
  const { t } = project(index);
  const clamped = Math.max(0, Math.min(1, t));
  let cx = ax + (bx - ax) * clamped; let cz = az + (bz - az) * clamped;
  let pathLeft = Math.hypot(bx - cx, bz - cz);
  for (let i = index + 1; i < route.length; i += 1) pathLeft += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
  let remaining = lookahead; let cursor = index; let toCorner = null; let travelled = 0;
  for (;;) {
    const [nx, nz] = route[cursor];
    const d = Math.hypot(nx - cx, nz - cz);
    if (toCorner === null && cursor < route.length - 1) {
      const [mx, mz] = route[cursor + 1];
      const turn = Math.abs(Math.atan2((nz - route[cursor - 1][1]) * (mx - nx) - (nx - route[cursor - 1][0]) * (mz - nz), (nx - route[cursor - 1][0]) * (mx - nx) + (nz - route[cursor - 1][1]) * (mz - nz)));
      if (turn > 0.4) toCorner = travelled + d;
    }
    if (d >= remaining || cursor === route.length - 1) {
      const f = d > 0 ? Math.min(1, remaining / d) : 1;
      return { target: [cx + (nx - cx) * f, cz + (nz - cz) * f], segment: index, toCorner: toCorner ?? Infinity, remaining: pathLeft };
    }
    remaining -= d; travelled += d; cx = nx; cz = nz; cursor += 1;
  }
}

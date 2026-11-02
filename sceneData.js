// Static scene layout shared by the 3D scene and the autopilot route planner.
export const treePositions = [
  [-17, 0, -17], [-13, 0, -17], [17, 0, -17], [33, 0, -17],
  [-37, 0, 13], [-33, 0, 13], [17, 0, 13], [33, 0, 13],
  [-17, 0, 33], [-13, 0, 33], [17, 0, 43], [33, 0, 43],
  [-43, 0, -17], [43, 0, -17], [-43, 0, 17], [43, 0, 17],
];

export const pedestrianSpots = Array.from({ length: 8 }, () => [5, 0, 5]);
export const dogSpots = Array.from({ length: 3 }, () => [5, 0, 5]);

export const streetLightPositions = [
  [-2.6, 0, -8], [2.6, 0, -8], [-2.6, 0, 8], [2.6, 0, 8],
  [-8, 0, -2.6], [-8, 0, 2.6], [8, 0, -2.6], [8, 0, 2.6],
  [12, 0, -2.6], [12, 0, 2.6], [18, 0, 2.6], [18, 0, 8],
  [-18, 0, -32], [18, 0, -32], [-18, 0, 32], [18, 0, 32],
  [-38, 0, 2.6], [-38, 0, -2.6], [38, 0, 2.6], [38, 0, -2.6],
];

export const trafficSignals = [
  { position: [9.4, 0, 3.7], axis: "x" },
  { position: [13.5, 0, -2.8], axis: "z" },
];

export const skyline = Array.from({ length: 24 }, (_, index) => {
  const side = index % 4;
  const slot = Math.floor(index / 4);
  const offset = -38 + slot * 15;
  const positions = [
    [-44, offset],
    [44, offset],
    [offset, -44],
    [offset, 44],
  ];
  const [x, z] = positions[side];
  return {
    x,
    z,
    width: 3 + ((index * 7) % 3),
    depth: 3 + ((index * 5) % 3),
    height: 7 + ((index * 11) % 13),
    color: ["#586b84", "#64758a", "#718097", "#53647c", "#786b86", "#8a705e", "#50777a", "#8b805a", "#685d78", "#657c69", "#84616a", "#536c83", "#496a72", "#7a6256", "#706f91", "#5d795f", "#806c4b", "#526b8b", "#8b5f72", "#4f7771", "#76658a", "#607b86", "#90745f", "#58734d"][index],
  };
}).filter((building) => building.x < 40); // Leave the eastern shoreline open for homes, the villa, and the ocean view.

// Traffic lanes and vehicles. The autopilot reads the same data so it can pick a lane and keep clear of them.
export const trafficCars = [
  { color: "#e43f4f", axis: "x", fixed: 1.05, start: -8, speed: 2.1, direction: 1, slot: 0 },
  { color: "#f2f4f8", axis: "x", fixed: -1.05, start: 30, speed: 1.65, direction: -1, slot: 1 },
  { color: "#368be8", axis: "z", fixed: 11.05, start: 9, speed: 1.45, direction: -1, slot: 2 },
  { color: "#36ae86", axis: "x", fixed: -11.05, start: -25, speed: 1.7, direction: 1, slot: 6 },
  { color: "#f2a32d", axis: "z", fixed: -21.05, start: 24, speed: 1.55, direction: -1, slot: 7 },
];
export const schoolBus = { axis: "x", fixed: 21.05, start: -35, speed: 1.15, direction: 1, slot: 5 };

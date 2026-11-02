export const cityPlaces = [
  { label: "EDUCATION", position: [-25, 0, -25], color: "#3769c8", height: 4.8, style: "campus" , interactionPosition: [-20, 0, -25] },
  { label: "SKILLS", position: [25, 0, -25], color: "#078a7c", height: 6.2, style: "tower" , interactionPosition: [20, 0, -25] },
  { label: "PROJECTS", position: [-25, 0, 25], color: "#cf7627", height: 4.4, style: "studio" , interactionPosition: [-20, 0, 25] },
  { label: "EXPERIENCE", position: [25, 0, 25], color: "#7742a2", height: 5.6, style: "office" , interactionPosition: [20, 0, 25] },
  { label: "CERTIFICATES", position: [-25, 0, 35], color: "#c14c73", height: 5.2, style: "office" , interactionPosition: [-20, 0, 35] },
  { label: "CONTACT", position: [25, 0, 35], color: "#b83a55", height: 7.2, style: "terminal" , interactionPosition: [20, 0, 35] },
  { label: "GITHUB", position: [-35, 0, -35], color: "#34465f", height: 6.4, style: "tower" , interactionPosition: [-30, 0, -35] },
  { label: "BYTE CAFE", position: [-15, 0, -15], color: "#a95135", height: 2.8, style: "shop" , interactionPosition: [-10, 0, -15] },
  { label: "CAMPUS BOOKS", position: [15, 0, -15], color: "#c08a3f", height: 2.8, style: "shop" , interactionPosition: [10, 0, -15] },
  { label: "CITY GARAGE", position: [-15, 0, 15], color: "#356b78", height: 2.8, style: "shop" , interactionPosition: [-10, 0, 15] },
];

export const residentialPlaces = [
  // Original scenic coastal neighborhood (Eastern shoreline, x: 45)
  { id: "cottage-north", type: "cottage", position: [45, 0, -35], color: "#e7d8b7", roof: "#8f4d43", width: 3.4, depth: 3.1, height: 2.2, showOnMinimap: true },
  { id: "cottage-hill", type: "cottage", position: [45, 0, -25], color: "#d9e0e3", roof: "#45586a", width: 3.4, depth: 3.1, height: 2.2, showOnMinimap: true },
  { id: "cottage-park", type: "cottage", position: [45, 0, -5], color: "#efd3a4", roof: "#a85d43", width: 3.4, depth: 3.1, height: 2.2, showOnMinimap: true },
  { id: "villa", type: "villa", position: [45, 0, 15], color: "#d9e2e0", roof: "#394f5e", width: 5.2, depth: 4.5, height: 2.9, showOnMinimap: true },
  { id: "cottage-coast", type: "cottage", position: [45, 0, 35], color: "#d6dfc7", roof: "#5b704e", width: 3.4, depth: 3.1, height: 2.2, showOnMinimap: true },

  // ---- Central City Clusters: Filling large vacant plots beside the avenues ----
  // Central Northwest Cluster (Block between x: -10..0, z: -10..0)
  { id: "central-nw-1", type: "cottage", position: [-6.4, 0, -6.4], color: "#d47b5d", roof: "#3d4f61", width: 2.2, depth: 2.2, height: 2.1, rotationY: 0, chimney: true, yardColor: "#5e7c52" },
  { id: "central-nw-2", type: "chalet", position: [-3.6, 0, -3.6], color: "#ecd79d", roof: "#8f4339", width: 2.2, depth: 2.2, height: 2.3, rotationY: Math.PI, chimney: false, yardColor: "#618055" },

  // Central Northeast Cluster (Block between x: 0..10, z: -10..0)
  { id: "central-ne-1", type: "cottage", position: [3.6, 0, -6.4], color: "#83a685", roof: "#99473b", width: 2.2, depth: 2.2, height: 2.0, rotationY: 0, chimney: true, yardColor: "#608154" },
  { id: "central-ne-2", type: "townhome", position: [6.4, 0, -3.6], color: "#6c92aa", roof: "#334554", width: 2.2, depth: 2.2, height: 2.5, rotationY: Math.PI, chimney: false, yardColor: "#5d7d51" },

  // Central Southwest Cluster (Block between x: -10..0, z: 0..10)
  { id: "central-sw-1", type: "cottage", position: [-6.4, 0, 3.6], color: "#e8c99e", roof: "#445a6e", width: 2.2, depth: 2.2, height: 2.1, rotationY: Math.PI, chimney: true, yardColor: "#5a7b4f" },
  { id: "central-sw-2", type: "bungalow", position: [-3.6, 0, 6.4], color: "#c5717c", roof: "#2d3f50", width: 2.2, depth: 2.2, height: 1.9, rotationY: 0, chimney: false, yardColor: "#5f7e53" },

  // Midtown South Cluster (Block between x: -10..0, z: 10..20, across from City Garage)
  { id: "midtown-s1", type: "bungalow", position: [-6.4, 0, 13.6], color: "#80a68e", roof: "#964639", width: 2.2, depth: 2.2, height: 2.0, rotationY: Math.PI, chimney: false, yardColor: "#618255" },
  { id: "midtown-s2", type: "townhome", position: [-3.6, 0, 16.4], color: "#f3ede2", roof: "#364555", width: 2.2, depth: 2.2, height: 2.4, rotationY: 0, chimney: true, yardColor: "#597a4f" },

  // Midtown Southeast Cluster (Block between x: 0..10, z: 10..20)
  { id: "midtown-se1", type: "cottage", position: [3.6, 0, 13.6], color: "#deb37b", roof: "#425567", width: 2.2, depth: 2.2, height: 2.1, rotationY: Math.PI, chimney: true, yardColor: "#5e7f53" },
  { id: "midtown-se2", type: "townhome", position: [6.4, 0, 16.4], color: "#a56c7d", roof: "#2c3c4b", width: 2.2, depth: 2.2, height: 2.5, rotationY: 0, chimney: false, yardColor: "#5b7b50" },

  // Central East Park-side Cluster (Block between x: 10..20, z: 0..10, east of Playground)
  { id: "east-1", type: "chalet", position: [13.6, 0, 3.6], color: "#dbe4e5", roof: "#90453a", width: 2.2, depth: 2.2, height: 2.2, rotationY: Math.PI, chimney: true, yardColor: "#5e8155" },
  { id: "east-2", type: "cottage", position: [16.4, 0, 6.4], color: "#e6ac85", roof: "#3b4e60", width: 2.2, depth: 2.2, height: 2.1, rotationY: 0, chimney: false, yardColor: "#5c7d52" },

  // University North Residential Block (x: -10..0, z: -30..-20, east of Education)
  { id: "north-w1", type: "chalet", position: [-5.0, 0, -25.0], color: "#7498b3", roof: "#8b3e34", width: 2.6, depth: 2.4, height: 2.2, rotationY: 0, chimney: true, yardColor: "#608055" },

  // Library Hill Residential Block (x: 0..10, z: -30..-20, west of Skills tower)
  { id: "north-e1", type: "townhome", position: [5.0, 0, -25.0], color: "#edd8a9", roof: "#3d5062", width: 2.5, depth: 2.4, height: 2.4, rotationY: 0, chimney: true, yardColor: "#5d7e52" },

  // South Central Avenue Residence (x: 0..10, z: 20..30, west of Experience)
  { id: "south-e1", type: "cottage", position: [5.0, 0, 25.0], color: "#d98c77", roof: "#314454", width: 2.5, depth: 2.4, height: 2.1, rotationY: 0, chimney: true, yardColor: "#5f8054" },

  // South Central-West Residence (x: -10..0, z: 20..30, east of Projects)
  { id: "south-w1", type: "chalet", position: [-5.0, 0, 25.0], color: "#e4ce9d", roof: "#465a6e", width: 2.5, depth: 2.4, height: 2.2, rotationY: 0, chimney: true, yardColor: "#5c7c51" },

  // West Midtown Buffer Residence (x: -20..-10, z: -10..0, north of Byte Cafe)
  { id: "west-1", type: "chalet", position: [-15.0, 0, -5.0], color: "#e1cca5", roof: "#3b4d5e", width: 2.5, depth: 2.4, height: 2.2, rotationY: 0, chimney: true, yardColor: "#5e7e53" },

  // West Garden Residence (x: -20..-10, z: 0..10, north of City Garage)
  { id: "west-2", type: "bungalow", position: [-15.0, 0, 5.0], color: "#9bb698", roof: "#8b453b", width: 2.5, depth: 2.4, height: 2.0, rotationY: 0, chimney: false, yardColor: "#618155" },

  // Southeast Residential Cottage (x: 10..20, z: 10..20)
  { id: "se-1", type: "cottage", position: [15.0, 0, 15.0], color: "#799db2", roof: "#94463a", width: 2.5, depth: 2.4, height: 2.2, rotationY: 0, chimney: true, yardColor: "#5d7d51" },
];

export const fishingPondPosition = [45, 0, -15];
export const coastStartX = 60;

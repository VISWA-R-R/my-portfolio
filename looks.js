// Outfits and vehicle colours the player can pick in the sidebar. Every entry is applied to the 3D models.
export const outfits = [
  { id: "navy", name: "Navy jacket", note: "Original look", jacket: "#172843", shirt: "#d6e1f3", pants: "#282d38", shoes: "#f3f3f0" },
  { id: "sunset", name: "Sunset bomber", note: "Warm orange", jacket: "#d9532e", shirt: "#f5e6c8", pants: "#2b2f3a", shoes: "#f1d8a0" },
  { id: "night", name: "Night hoodie", note: "Deep violet", jacket: "#6a35c9", shirt: "#e7ddff", pants: "#1d2030", shoes: "#ff4d6d" },
  { id: "field", name: "Field green", note: "Outdoor green", jacket: "#2f6b4f", shirt: "#e5efe0", pants: "#4a3f33", shoes: "#d8c9a3" },
];

// value null keeps each vehicle's original paint.
export const vehicleColors = [
  { id: "original", name: "Original", value: null, swatch: "linear-gradient(135deg, #e4a927 50%, #f4f4ec 50%)" },
  { id: "gold", name: "Sunset gold", value: "#e4a927", swatch: "#e4a927" },
  { id: "flamingo", name: "Flamingo", value: "#ff4d6d", swatch: "#ff4d6d" },
  { id: "ocean", name: "Ocean blue", value: "#2469ad", swatch: "#2469ad" },
  { id: "mint", name: "Mint", value: "#2bb5a0", swatch: "#2bb5a0" },
  { id: "violet", name: "Violet", value: "#7742a2", swatch: "#7742a2" },
  { id: "pearl", name: "Pearl white", value: "#f1f1ea", swatch: "#f1f1ea" },
];

export const vehicleTypes = [
  { id: "CAR", name: "Car", icon: "🚗" },
  { id: "BIKE", name: "Bike", icon: "🏍" },
  { id: "YACHT", name: "Yacht", icon: "🛥" },
];

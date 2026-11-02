// Playable "characters" on the landing screen. Each one is a real side of Viswa's work.
// Drop matching videos into /public/videos (see public/videos/README.md); until they exist the
// still image is shown, so nothing breaks.
export const characters = [
  {
    id: "builder",
    name: "The Builder",
    role: "Backend · Java & Spring Boot",
    blurb: "Designs REST APIs, data models and validation. Built a banking system with Spring Data JPA, MySQL and Swagger docs.",
    stack: ["Java 17", "Spring Boot", "Hibernate", "MySQL", "PostgreSQL"],
    accent: "#ffb02e",
    firstStop: "PROJECTS",
    video: "/videos/builder",
    image: "/viswa-avatar.png",
  },
  {
    id: "interface",
    name: "The Interface Artist",
    role: "Frontend · React & Vite",
    blurb: "Turns APIs into fast, readable screens. Built a student management app with React 19, Axios and TanStack Query.",
    stack: ["React 19", "Vite", "JavaScript", "HTML & CSS", "TanStack Query"],
    accent: "#ff4d6d",
    firstStop: "SKILLS",
    video: "/videos/interface",
    image: "/viswa-avatar.png",
  },
  {
    id: "tinkerer",
    name: "The Tinkerer",
    role: "Hardware · ESP8266 & sensors",
    blurb: "Wired a night motion detection and alert system with a PIR sensor, GSM alerts, LCD, buzzer and LED.",
    stack: ["ESP8266", "PIR sensor", "GSM module", "C++ basics"],
    accent: "#5eead4",
    firstStop: "GITHUB",
    video: "/videos/tinkerer",
    image: "/viswa-avatar.png",
  },
];

export const loadingTips = [
  "Walk up to a glowing building and press E to open it.",
  "Press V to swap between car, bike and yacht.",
  "Press T to change the time of day: day, dusk or night.",
  "Hold Shift to run. Hold the mouse and drag to look around.",
  "Follow the gold line on the radar to reach the next stop.",
  "The yacht marina is on the north shore of the city.",
];

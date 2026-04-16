import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        neon: {
          50: "#e8fefb",
          100: "#b8fff5",
          200: "#7dfaed",
          300: "#44efe3",
          400: "#1cd5cb",
          500: "#12aca5",
          600: "#0f8581",
          700: "#106864",
          800: "#104f4c",
          900: "#0b3635"
        },
        midnight: {
          950: "#060b17"
        }
      },
      fontFamily: {
        display: ["Orbitron", "Rajdhani", "Eurostile", "sans-serif"],
        body: ["Sora", "Manrope", "Segoe UI", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(138, 240, 255, 0.1), 0 22px 60px rgba(3, 9, 24, 0.62)",
        ember: "0 0 26px rgba(98, 255, 233, 0.3)"
      },
      backgroundImage: {
        felt: "radial-gradient(circle at top, rgba(23, 135, 145, 0.32), transparent 45%), linear-gradient(180deg, #091027 0%, #050913 100%)"
      }
    }
  },
  plugins: []
} satisfies Config;

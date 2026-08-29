/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Original "Boys at the Back" palette
        bat: {
          bg: "#0c0d10",
          surface: "#15171c",
          elevated: "#1c1f26",
          border: "#2a2e38",
          muted: "#6b7280",
          text: "#e5e7eb",
          accent: "#f59e0b",      // warm amber
          accentHover: "#d97706",
          success: "#22c55e",
          danger: "#ef4444",
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
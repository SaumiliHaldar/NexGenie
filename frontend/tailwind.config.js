/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // NexGenie loads Source Sans 3 (App.css), not LearnNexus' Source Sans Pro.
      fontFamily: {
        sans: ['"Source Sans 3"', "Source Sans Pro", "sans-serif"],
      },
      // The brand tokens the chatbot uses, as in LearnNexus' config.
      colors: {
        sage: {
          DEFAULT: "#8f9785",
          hover: "#7a8271",
          dark: "#636a5b",
        },
        charcoal: "#1c1b1b",
        slate: "#474545",
      },
    },
  },
  plugins: [],
};

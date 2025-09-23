import { useEffect, useState } from "react";

export function useDarkMode(): boolean {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check if we're in a browser environment
    if (typeof window === "undefined") {
      return false;
    }

    // Check user's system preference
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    // Check if we're in a browser environment
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkMode(e.matches);
    };

    // Listen for changes in the user's color scheme preference
    mediaQuery.addEventListener("change", handleChange);

    // Cleanup function
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return isDarkMode;
}

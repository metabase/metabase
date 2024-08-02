import { useEffect } from "react";

/** Monitor for CSS aberrations */
export const useMonitorCSS = (
  /** Interval in milliseconds to check CSS */
  interval = 15000,
) => {
  // Provide fallback for Safari and Jest which do not currently support requestIdleCallback
  window.requestIdleCallback ??= (cb: IdleRequestCallback) => setTimeout(cb, 0);

  useEffect(() => {
    const timeout = setInterval(() => {
      requestIdleCallback(() => {
        const elementsWithUndefinedClasses = document.querySelectorAll(
          ".undefined:not([data-undefined-class-noted])",
        );
        if (elementsWithUndefinedClasses.length) {
          console.error(
            "Found elements with class 'undefined':",
            elementsWithUndefinedClasses,
          );
          // Mark the elements so we don't alert twice
          elementsWithUndefinedClasses.forEach(element => {
            element.setAttribute("data-undefined-class-noted", "true");
          });
        }
      });
    }, interval);
    return () => clearInterval(timeout);
  });
};

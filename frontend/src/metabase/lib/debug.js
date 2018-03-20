let debug;
if (
  typeof window === "object" &&
  ((window.location && window.location.hash === "#debug") ||
    (window.localStorage && window.localStorage.getItem("debug")))
) {
  debug = true;
} else {
  debug = false;
}

export const DEBUG = debug;

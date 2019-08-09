import { HAS_LOCAL_STORAGE } from "metabase/lib/dom";

let debug;
if (
  typeof window === "object" &&
  ((window.location && window.location.hash === "#debug") ||
    (HAS_LOCAL_STORAGE && window.localStorage.getItem("debug")))
) {
  debug = true;
} else {
  debug = false;
}

export const DEBUG = debug;

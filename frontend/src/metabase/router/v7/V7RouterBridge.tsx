import { useEffect, useRef } from "react";
import {
  type HistoryRouterProps,
  useNavigationType,
  useLocation as useV7Location,
  useNavigate as useV7Navigate,
} from "react-router";

import type { LocationMirror } from "./location-mirror";
import { setV7Navigate } from "./navigator";

/**
 * Wires the live v7 router to the rest of the app, replacing what
 * `routerMiddleware` + `syncHistoryWithStore` did on v3:
 *
 * - registers the live `navigate` so the redux navigator adapter (and thus
 *   `dispatch(push(...))`) can drive the v7 router;
 * - calls `onLocationChange` for every location, which is how the app mirrors
 *   the location into `state.routing` (see `createLocationMirror`).
 *
 * The mirror is driven from the history subscription when one is passed, because
 * v3 dispatched LOCATION_CHANGE as part of the transition rather than after a
 * render. Falls back to the rendered location when no history is available,
 * which is how tests mount the tree under a plain `<MemoryRouter>`.
 */
export function V7RouterBridge({
  history,
  onLocationChange,
}: {
  history?: HistoryRouterProps["history"];
  onLocationChange?: LocationMirror;
}): null {
  const navigate = useV7Navigate();
  const location = useV7Location();
  const action = useNavigationType();

  // Read through a ref so a new callback identity does not re-run the mirror for
  // a location that has not changed.
  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;

  useEffect(() => {
    setV7Navigate(navigate);
    return () => setV7Navigate(null);
  }, [navigate]);

  // When a history is provided the mirroring happens synchronously in
  // `SyncHistoryRouter`'s subscription instead, so nothing to do here.
  useEffect(() => {
    if (history) {
      return;
    }
    onLocationChangeRef.current?.(location, action);
  }, [history, location, action]);

  return null;
}

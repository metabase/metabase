import { useEffect } from "react";
import {
  type HistoryRouterProps,
  useNavigationType,
  useLocation as useV7Location,
  useNavigate as useV7Navigate,
} from "react-router";

import { useDispatch } from "metabase/redux";

import { LOCATION_CHANGE } from "../location-change";

import { toV3Location } from "./location";
import { notifyLocationListeners, setV7Navigate } from "./navigator";

/**
 * Bridges the v7 router to redux, replacing what `routerMiddleware` +
 * `syncHistoryWithStore` did on v3:
 *
 * - registers the live `navigate` so the redux navigator adapter (and thus
 *   `dispatch(push(...))`) can drive the v7 router;
 * - emits LOCATION_CHANGE on every navigation so `isNavbarOpen` / `errorPage`
 *   (and trace-id rotation) keep reacting to route changes.
 *
 * The mirror subscribes to the history when one is passed, because v3 dispatched
 * LOCATION_CHANGE as part of the transition rather than after a render, so the
 * reducers keyed off it (`isNavbarOpen`, `errorPage`) settle before the new route
 * renders.
 * Falls back to the rendered location when no history is available, which is how
 * tests mount the tree under a plain `<MemoryRouter>`. Deleted with the v3 engine
 * in Phase 4.
 */
export function V7ReduxBridge({
  history,
}: {
  history?: HistoryRouterProps["history"];
}): null {
  const navigate = useV7Navigate();
  const location = useV7Location();
  const action = useNavigationType();
  const dispatch = useDispatch();

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
    const v3Location = toV3Location(location, action);
    dispatch({ type: LOCATION_CHANGE, payload: v3Location });
    notifyLocationListeners(v3Location);
  }, [dispatch, history, location, action]);

  return null;
}

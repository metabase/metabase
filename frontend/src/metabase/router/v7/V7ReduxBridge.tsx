import { useEffect } from "react";
import {
  useNavigationType,
  useLocation as useV7Location,
  useNavigate as useV7Navigate,
} from "react-router-v7";

import { useDispatch } from "metabase/redux";

import { LOCATION_CHANGE } from "../routing-reducer";

import { toV3Location } from "./location";
import { notifyLocationListeners, setV7Navigate } from "./navigator";

/**
 * Bridges the v7 router to redux, replacing what `routerMiddleware` +
 * `syncHistoryWithStore` did on v3:
 *
 * - registers the live `navigate` so the redux navigator adapter (and thus
 *   `dispatch(push(...))`) can drive the v7 router;
 * - mirrors every location into `state.routing` via LOCATION_CHANGE, so
 *   `getLocation` / `isNavbarOpen` / `errorPage` keep working.
 *
 * Rendered inside the router but outside `<Routes>`, so it tracks the location
 * regardless of which route matches. Deleted with the v3 engine in Phase 4.
 */
export function V7ReduxBridge(): null {
  const navigate = useV7Navigate();
  const location = useV7Location();
  const action = useNavigationType();
  const dispatch = useDispatch();

  useEffect(() => {
    setV7Navigate(navigate);
    return () => setV7Navigate(null);
  }, [navigate]);

  useEffect(() => {
    const v3Location = toV3Location(location, action);
    dispatch({ type: LOCATION_CHANGE, payload: v3Location });
    // Fan out to the imperative router's `listen` subscribers (v3's
    // `router.listen`), which have no other source of location changes on v7.
    notifyLocationListeners(v3Location);
  }, [dispatch, location, action]);

  return null;
}

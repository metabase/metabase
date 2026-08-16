import { createContext } from "react";
import type { ReactReduxContextValue } from "react-redux";

/**
 * The react-redux context the Metabase store is provided under. It lives in
 * the api module — the lowest store-aware layer — so both api's RTK Query
 * hooks and the redux module's Provider/hooks can share it without api
 * importing upward into redux.
 */
export const metabaseReduxContext =
  createContext<ReactReduxContextValue | null>(null);

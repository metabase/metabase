/**
 * @deprecated These helpers are a compatibility shim for callers that haven't
 * moved to `api.request(...)` yet. New code should call `api.request` directly
 * (or the appropriate RTK endpoint). The exports below are scheduled for
 * removal once every importer migrates — search `metabase/api/legacy-client`
 * to find them.
 */
import { api } from "./client";

export { NetworkError, type RequestMethod } from "./client";
export const { GET, POST, PUT, DELETE } = api;

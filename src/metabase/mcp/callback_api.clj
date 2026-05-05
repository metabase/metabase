(ns metabase.mcp.callback-api
  "Iframe-callback endpoints for the embedded MCP UI. The MCP iframe POSTs here to
   stash query payloads server-side so the agent never has to carry them in the
   model context — it just receives a handle UUID it can pass to the corresponding
   MCP tool. Mounted as a sibling of `/api/mcp` so the JSON-RPC handler doesn't
   have to special-case non-protocol routes."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.validation :as mcp.validation]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]))

(defn- mcp-session-id-from-headers
  [request]
  (get-in request [:headers "mcp-session-id"]))

(defn- check-session-header!
  "Validate the `Mcp-Session-Id` header against `user-id`. Throws an api/check
   exception on failure so defendpoint surfaces the right status code."
  [session-id user-id]
  (api/check (not (str/blank? session-id))
             [400 (tru "Missing Mcp-Session-Id header")])
  (api/check (mcp.session/valid-id? session-id)
             [404 (tru "Invalid or expired session")])
  (api/check (mcp.session/owned-by-user? session-id user-id)
             [404 (tru "Invalid or expired session")]))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/drills"
  "Stash a base64-encoded MBQL query for the iframe's pending drill-through and
   return a handle UUID the iframe will thread into the agent message so the
   `render_drill_through` tool can fetch it."
  [_route-params
   _query-params
   {:keys [encodedQuery]} :- [:map [:encodedQuery ms/NonBlankString]]
   request]
  (let [session-id (mcp-session-id-from-headers request)]
    (check-session-header! session-id api/*current-user-id*)
    {:handle (mcp.session/store-handle! session-id api/*current-user-id* encodedQuery)}))

(def ^{:arglists '([request respond raise])} routes
  "Iframe-callback routes mounted at `/api/embed-mcp`. MCP-feature gated; auth is
   handled by the upstream `+auth` middleware in api-routes."
  (mcp.validation/+mcp-enabled (api.macros/ns-handler *ns*)))

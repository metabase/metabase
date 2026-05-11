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
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.feedback :as metabot.feedback]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
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

(api.macros/defendpoint :post "/feedback" :- [:map
                                              [:status [:= 204]]
                                              [:body :nil]]
  "Proxy MCP Apps visualization feedback to Harbormaster."
  [_route-params
   _query-params
   body :- [:map
            [:feedback [:map
                        [:message_id        ms/NonBlankString]
                        [:positive          :boolean]
                        [:issue_type        {:optional true} [:maybe :string]]
                        [:freeform_feedback {:optional true} [:maybe :string]]]]
            [:conversation_data [:map
                                 [:source [:= "mcp"]]
                                 [:prompt {:optional true} [:maybe :string]]
                                 [:query  {:optional true} [:maybe :string]]]]]
   request]
  (let [session-id (mcp-session-id-from-headers request)
        _          (check-session-header! session-id api/*current-user-id*)
        metabot-id (api/check-500 (metabot.config/normalize-metabot-id metabot.config/embedded-metabot-id))
        body       (assoc body :metabot_id metabot-id)]
    (metabot.config/check-metabot-enabled!)
    (try
      (api/check-400 (metabot.feedback/submit-to-harbormaster!
                      (metabot.feedback/mcp-harbormaster-payload body))
                     "Cannot submit feedback. The license token and/or Store API URL are missing!")
      (catch Exception e
        (log/error "Failed to submit MCP feedback to Harbormaster: " (ex-message e)))))
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "Iframe-callback routes mounted at `/api/embed-mcp`. MCP-feature gated; auth is
   handled by the upstream `+auth` middleware in api-routes."
  (mcp.validation/+mcp-enabled (api.macros/ns-handler *ns*)))

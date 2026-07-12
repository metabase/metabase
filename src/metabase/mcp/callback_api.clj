(ns metabase.mcp.callback-api
  "Iframe-callback endpoints for the embedded MCP UI. The MCP iframe POSTs here to
   stash query payloads server-side so the agent never has to carry them in the
   model context — it just receives a handle UUID it can pass to the corresponding
   MCP tool. Mounted as a sibling of `/api/metabase-mcp` so the JSON-RPC handler doesn't
   have to special-case non-protocol routes.

   The iframe authenticates with the embedding session key `metabase.mcp.session` derives for
   the user, so `+auth` already establishes who is calling, and handles are stored and read
   under that user. There is no transport session to check."
  (:require
   [metabase.agent-api.api :as agent-api]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.validation :as mcp.validation]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]))

(def ^:private feedback-text-max-length
  10000)

(def ^:private OptionalFeedbackText
  [:maybe [:string {:max feedback-text-max-length}]])

(defn- rethrow-api-check-exception
  [e]
  (when (:status-code (ex-data e))
    (throw e)))

(defn- submit-mcp-feedback!
  [body]
  (let [submitted? (try
                     (agent-api/submit-mcp-visualization-feedback! body)
                     (catch clojure.lang.ExceptionInfo e
                       (rethrow-api-check-exception e)
                       (log/error e "Failed to submit MCP feedback to Harbormaster")
                       (api/check false [502 (tru "Could not submit feedback.")]))
                     (catch Exception e
                       (log/error e "Failed to submit MCP feedback to Harbormaster")
                       (api/check false [502 (tru "Could not submit feedback.")])))]
    (api/check-400 submitted?
                   (tru "Cannot submit feedback. The license token and/or Store API URL are missing!"))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/drills"
  "Stash a base64-encoded MBQL query for the iframe's pending drill-through and
   return a handle UUID the iframe will thread into the agent message so the
   `render_drill_through` tool can fetch it."
  [_route-params
   _query-params
   {:keys [encodedQuery]} :- [:map [:encodedQuery ms/NonBlankString]]]
  {:handle (mcp.session/store-handle! api/*current-user-id* encodedQuery)})

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
                        [:freeform_feedback {:optional true} OptionalFeedbackText]]]
            [:conversation_data [:map
                                 [:source [:= "mcp"]]
                                 [:prompt {:optional true} OptionalFeedbackText]
                                 [:query  {:optional true} OptionalFeedbackText]]]]]
  (submit-mcp-feedback! body)
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "Iframe-callback routes mounted at `/api/embed-mcp`. MCP-feature gated; auth is
   handled by the upstream `+auth` middleware in api-routes."
  (mcp.validation/+mcp-enabled (api.macros/ns-handler *ns*)))

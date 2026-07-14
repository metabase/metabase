(ns metabase.mcp.callback-api
  "Iframe-callback endpoints for the embedded MCP UI. The MCP iframe POSTs here to
   stash query payloads server-side so the agent never has to carry them in the
   model context — it just receives a handle UUID it can pass to the corresponding
   MCP tool. Mounted as a sibling of `/api/metabase-mcp` so the JSON-RPC handler doesn't
   have to special-case non-protocol routes.

   The iframe authenticates with the embedding session key `metabase.mcp.session` derives for
   the user, so `+auth` already establishes who is calling, and handles are stored and read
   under that user. There is no transport session to check.

   `+auth` answers *who* is calling and nothing else: every logged-in account reaches both
   endpoints, and neither one reads content the caller has to be authorized for. What each
   account can *spend* here is therefore the only limit that matters — a handle row per
   `/drills` call, an outbound Harbormaster request per `/feedback` call — so both are
   throttled per user and both bound the payload they accept."
  (:require
   [metabase.agent-api.api :as agent-api]
   [metabase.agent-api.handles :as agent-api.handles]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as routes.common]
   [metabase.mcp.validation :as mcp.validation]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [metabase.util.throttle :as u.throttle]
   [throttle.core :as throttle])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(def ^:private feedback-text-max-length
  10000)

(def ^:private OptionalFeedbackText
  [:maybe [:string {:max feedback-text-max-length}]])

(def ^:private issue-type-max-length
  255)

(def ^:private drill-query-max-length
  "Cap on the base64 query a drill-through may stash. A serialized `dataset_query` is orders of
   magnitude smaller than this; the cap is here so one row cannot be made arbitrarily large."
  100000)

(defn- json-object-text?
  [s]
  (boolean (try
             (map? (json/decode s))
             (catch Exception _
               false))))

(defn- encoded-query?
  "True when `payload` is a serialized query: the JSON text of the query object, or — the shape the
   iframe posts — the base64 of that text. Anything else is not a drill-through and never becomes a
   handle row."
  [payload]
  (or (json-object-text? payload)
      (json-object-text? (try
                           (u/decode-base64 payload)
                           (catch Exception _
                             nil)))))

(def ^:private EncodedDrillQuery
  [:and
   ms/NonBlankString
   [:string {:max drill-query-max-length}]
   [:fn {:error/message "must be a base64-encoded query"} encoded-query?]])

(def ^:private one-minute-ms
  (* 60 1000))

(def ^:private throttlers
  "Per-user budgets for the two callbacks, keyed by the authenticated user id.

   Every drill-through click stashes a handle and every thumbs-up sends a request to Harbormaster,
   so the budgets are set well above what the iframe can produce by hand: drill-throughs come in
   bursts as a user explores a chart, feedback is a deliberate one-off."
  {"/drills"   (throttle/make-throttler :user-id :attempts-threshold 60, :attempt-ttl-ms one-minute-ms)
   "/feedback" (throttle/make-throttler :user-id :attempts-threshold 20, :attempt-ttl-ms one-minute-ms)})

(defn- enforce-throttle
  [handler]
  (fn [request respond raise]
    (if-let [throttler (get throttlers ((some-fn :path-info :uri) request))]
      (try
        (throttle/check throttler api/*current-user-id*)
        (handler request respond raise)
        (catch ExceptionInfo e
          (if (u.throttle/throttle-exception? e)
            (respond (u.throttle/throttle-response e {:message (tru "Too many requests. Please try again later.")}))
            (raise e))))
      (handler request respond raise))))

(def ^{:arglists '([handler]), :private true} +throttle
  "Wrap routes so a request spends from the calling user's budget for that route before the endpoint
   body runs — an over-budget caller neither stashes a handle nor reaches Harbormaster."
  (routes.common/wrap-middleware-for-open-api-spec-generation enforce-throttle))

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
   {:keys [encodedQuery]} :- [:map [:encodedQuery EncodedDrillQuery]]]
  {:handle (agent-api.handles/store-handle! api/*current-user-id* encodedQuery)})

(api.macros/defendpoint :post "/feedback" :- [:map
                                              [:status [:= 204]]
                                              [:body :nil]]
  "Proxy MCP Apps visualization feedback to Harbormaster."
  [_route-params
   _query-params
   body :- [:map
            [:feedback [:map
                        [:message_id        ms/UUIDString]
                        [:positive          :boolean]
                        [:issue_type        {:optional true} [:maybe [:string {:max issue-type-max-length}]]]
                        [:freeform_feedback {:optional true} OptionalFeedbackText]]]
            [:conversation_data [:map
                                 [:source [:= "mcp"]]
                                 [:prompt {:optional true} OptionalFeedbackText]
                                 [:query  {:optional true} OptionalFeedbackText]]]]]
  (submit-mcp-feedback! body)
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "Iframe-callback routes mounted at `/api/embed-mcp`. MCP-feature gated and throttled per user;
   auth is handled by the upstream `+auth` middleware in api-routes."
  (mcp.validation/+mcp-enabled (+throttle (api.macros/ns-handler *ns*))))

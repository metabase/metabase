(ns metabase.mcp.tools
  "MCP tool dispatch. Generates tool definitions from defendpoint metadata and delegates
   tool calls to existing agent API endpoints."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [metabase.agent-api.api :as agent-api]
   [metabase.api.common :as api]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.config.core :as config]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.io ByteArrayOutputStream)
   (java.net URLEncoder)
   (metabase.server.streaming_response StreamingResponse)))

(set! *warn-on-reflection* true)

;;; ---------------------------- MCP schema overrides -------------------------------
;;
;; A few tools have an MCP-visible input or output shape that differs from the wire shape declared
;; on the defendpoint. Owning the override here keeps `agent-api` ignorant of MCP: the endpoint
;; describes its own wire schema, and this layer patches the manifest to publish the MCP-visible
;; shape.

;; Shared sub-shapes for the program-shaped tools (`construct_query`, `query`). Extracted so the two
;; tools can't drift on what a program looks like to the LLM — both reuse the same `:source` map and
;; the same flattened `:operations` (`[:sequential [:sequential :any]]`, no tuple-of-anys, no `:and`).
;; The wire schemas under `agent_api` use the precise tuple/composite grammar; this layer publishes
;; the permissive variant strict MCP clients (ChatGPT) accept.

(def ^:private program-source-malli
  [:map
   [:type {:tool/description "Entity kind."}
    [:enum "table" "card" "dataset" "metric"]]
   [:id ms/PositiveInt]])

(def ^:private program-operations-malli
  [:sequential
   [:sequential
    {:tool/description (str "First element is the operator string; remaining "
                            "elements are operator-specific arguments (scalars, "
                            "references, or nested arrays).")}
    :any]])

(def ^:private operations-description
  (str "Array of operator tuples like [\"filter\", clause] or [\"aggregate\", agg-clause]. "
       "See metabase://docs/construct-query.md for the full grammar."))

(def ^:private construct-query-mcp-input-malli
  "MCP-visible input for `construct_query`.
  Deliberately flatter than the wire schema — the operator/ref grammar is conveyed through the tool
  description and the construct-query.md MCP resource, not the schema."
  [:map
   [:source     {:tool/description "Database entity to query."}
    program-source-malli]
   [:operations {:tool/description operations-description}
    program-operations-malli]])

(def ^:private query-mcp-input-malli
  "MCP-visible input for `query`. The wire body is a `:multi` whose `:program` branch references
  agent-lib tuple/composite schemas — those emit `prefixItems`/`allOf` JSON Schema constructs that
  strict MCP clients (ChatGPT) reject. This override publishes the same flattened program shape used
  by `construct_query`, plus the `:continuation_token` alternative for pagination."
  [:map
   [:source             {:optional true
                         :tool/description (str "Database entity to query. Omit when paginating via "
                                                "`continuation_token`.")}
    [:maybe program-source-malli]]
   [:operations         {:optional true
                         :tool/description operations-description}
    [:maybe program-operations-malli]]
   [:continuation_token {:optional true
                         :tool/description (str "Token returned by a previous `query` response — pass "
                                                "it back to fetch the next page. Mutually exclusive "
                                                "with `source`/`operations`.")}
    [:maybe ms/NonBlankString]]])

(def ^:private mcp-input-overrides
  "tool-name → Malli schema. Replaces the manifest's derived `:inputSchema` for tools whose wire
  schema would otherwise emit prefixItems/allOf JSON Schema constructs that strict MCP clients
  (notably ChatGPT) reject."
  {"construct_query" construct-query-mcp-input-malli
   "query"           query-mcp-input-malli})

(defn- override->input-json-schema [malli tool-name]
  (tools-manifest/assert-optional-fields-nullable! malli tool-name)
  (-> malli tools-manifest/malli->json-schema tools-manifest/strict-tool-input-schema))

(defn- apply-schema-overrides
  "Replace `:inputSchema` on tools whose MCP-visible shape differs from the wire shape."
  [tools]
  (mapv (fn [{tool-name :name :as tool}]
          (cond-> tool
            (mcp-input-overrides tool-name)
            (assoc :inputSchema (override->input-json-schema (mcp-input-overrides tool-name) tool-name))))
        tools))

(defn- generate-manifest
  "Generate tools manifest from agent API endpoint metadata, then patch input schemas for tools
  whose MCP-visible shape differs from the wire shape."
  []
  (-> (tools-manifest/generate-tools-manifest
       {'metabase.agent-api.api "/api/agent"})
      (update :tools apply-schema-overrides)))

(def ^:private manifest-delay
  (delay (generate-manifest)))

(defn- manifest
  "Return the tools manifest. Cached in prod, recomputed each call in dev."
  []
  (if config/is-dev?
    (generate-manifest)
    @manifest-delay))

(defn list-tools
  "Return the tool definitions suitable for MCP `tools/list` responses.
   When `token-scopes` is provided, only tools whose scope matches are included."
  [token-scopes]
  (let [{:keys [tools]} (manifest)]
    (into []
          (comp (filter #(mcp.scope/matches? token-scopes (:scope %)))
                (map (fn [tool]
                       (select-keys tool [:name :title :description :inputSchema :outputSchema :annotations]))))
          tools)))

(defn- build-tool-index
  "Build name->tool lookup from manifest tools."
  [tools]
  (into {} (map (juxt :name identity)) tools))

(def ^:private tool-index-delay
  (delay (build-tool-index (:tools @manifest-delay))))

(defn- tool-index
  "Lookup from tool name to its full manifest definition. Cached in prod, recomputed each call in dev."
  []
  (if config/is-dev?
    (build-tool-index (:tools (manifest)))
    @tool-index-delay))

(defn- format-validation-detail
  "Flatten a defendpoint schema-error map — humanized by `malli.error`, whose leaves
   are vectors of message strings and whose intermediate nodes may be nested maps —
   into a compact `field: msg, msg; field: msg` rendering for MCP error text."
  [errors-map]
  (->> errors-map
       (map (fn [[k v]]
              (str (name k) ": "
                   (cond
                     (map? v)        (format-validation-detail v)
                     (sequential? v) (str/join ", " v)
                     :else           (str v)))))
       (str/join "; ")))

(defn- extract-error-message
  "Pull the best human-readable string out of an agent-api error response. Agent-api
   returns `:specific-errors`/`:errors` for schema-validation 400s (see
   [[metabase.api.macros/decode-and-validate-params]]) and `:message`/`:error` for
   other failures — surfacing the validation detail turns \"Invalid body\" into an
   actionable message for MCP clients. String bodies (e.g. 404 \"Not found.\") are
   surfaced as the message rather than collapsed to a bare \"Agent API error: <status>\"."
  [response]
  (let [body                                              (:body response)
        body-map                                          (when (map? body) body)
        body-str                                          (when (and (string? body) (not (str/blank? body))) body)
        {msg :message :keys [specific-errors errors error]} body-map
        detail (cond
                 (seq specific-errors) (format-validation-detail specific-errors)
                 (seq errors)          (format-validation-detail errors))]
    (cond
      (and msg detail) (str msg " (" detail ")")
      detail           detail
      msg              msg
      error            error
      body-str         body-str
      :else            (str "Agent API error: " (:status response)))))

;;; ------------------------------------------------- Tool Dispatch -------------------------------------------------

(defn- text-content
  "Wrap a value as an MCP tool-call result.
   Map/sequential values are surfaced as `structuredContent` — MCP spec requires this for any tool that
   declares an `outputSchema`.
   The `content` array carries a text serialization for clients that don't consume structuredContent."
  [v]
  (cond-> {:content [{:type "text" :text (if (string? v) v (json/encode v))}]}
    (or (map? v) (sequential? v)) (assoc :structuredContent v)))

(defn- error-content
  "Wrap an error message as MCP error content."
  [message]
  {:content [{:type "text" :text message}] :isError true})

(comment streaming-response/keep-me) ; ensure StreamingResponse class is loaded

(defn- capture-streaming-response
  "Execute a StreamingResponse in-process by writing to a ByteArrayOutputStream,
   then parse the JSON output and return it as MCP text content.

   This buffers the full response in memory (~120KB for 200 rows), which is fine for
   the row limits we enforce."
  [^StreamingResponse response]
  (let [baos         (ByteArrayOutputStream.)
        canceled-chan (a/promise-chan)
        f            (.f response)]
    (f baos canceled-chan)
    (text-content (json/decode+kw (.toString baos "UTF-8")))))

(defn- deliver-agent-api-response
  "Dispatch to agent API routes and deliver response to promise.
   For POST requests, `params` is sent as the request body.
   For GET/DELETE requests, `params` is sent as parsed query params.
   Materializes StreamingResponse bodies in-process before delivering."
  [result method path token-scopes params]
  (agent-api/routes
   (cond-> {:request-method   method
            :uri              path
            :metabase-user-id api/*current-user-id*
            :token-scopes     token-scopes}
     (and (seq params) (= :post method))    (assoc :body params)
     (and (seq params) (not= :post method)) (assoc :query-params params))
   (fn [{resp-body :body :as response}]
     (deliver result (if (instance? StreamingResponse resp-body)
                       (capture-streaming-response resp-body)
                       response)))
   (fn [error]
     (let [{:keys [status-code] :as data} (ex-data error)]
       (deliver result {:status (or status-code 500)
                        :body   (merge (select-keys data [:errors :specific-errors])
                                       {:message (or (ex-message error) "Internal error")})})))))

(defn- invoke-agent-api
  "Invoke an Agent API endpoint with a synthetic Ring request.
   Returns MCP content (text-content on success, error-content on failure).
   For POST, `params` becomes the request body; for GET/DELETE, `params` becomes query-params.

   Propagates `token-scopes` from the original MCP request so that scope restrictions
   are preserved through the synthetic request."
  [method path token-scopes params]
  (let [result (promise)]
    (deliver-agent-api-response result method path token-scopes params)
    (let [response (deref result 30000 {:status 504 :body {:message "Timeout"}})]
      (cond
        ;; Already materialized from a StreamingResponse
        (:content response)
        response

        (= 200 (:status response))
        (text-content (:body response))

        :else
        (error-content (extract-error-message response))))))

(defn- interpolate-path
  "Replace `{param}` placeholders in `path` with values from `arguments`.
   Returns `[resolved-path remaining-args]` where remaining-args has path params removed."
  [path arguments]
  (let [params    (re-seq #"\{([^}]+)\}" path)
        resolved  (reduce (fn [p [placeholder k]]
                            (let [v (get arguments (keyword k))]
                              (when (nil? v)
                                (throw (ex-info (str "Missing required path parameter: " k)
                                                {:parameter k :path path})))
                              (str/replace p placeholder (URLEncoder/encode (str v) "UTF-8"))))
                          path
                          params)
        path-keys (set (map (comp keyword second) params))]
    [resolved (apply dissoc arguments path-keys)]))

(defn- strip-api-prefix
  "Strip the `/api/agent` prefix from manifest paths, since `invoke-agent-api`
   calls `agent-api/routes` directly which expects `/v1/...` paths."
  [path]
  (str/replace-first path #"^/api/agent" ""))

(defn- dispatch-via-agent-api
  "Generic dispatch for tools whose responseFormat is \"json\".
   Looks up method/path from the tool definition, interpolates path params,
   and calls `invoke-agent-api`. For POST requests, remaining args are sent as the
   request body. For GET/DELETE requests, remaining args are sent as query params."
  [tool-def arguments token-scopes]
  (let [{:keys [method path]} (:endpoint tool-def)
        method                (keyword (u/lower-case-en method))
        [resolved-path
         remaining-args]      (interpolate-path path arguments)
        api-path              (strip-api-prefix resolved-path)]
    (invoke-agent-api method api-path token-scopes remaining-args)))

;; --- Design note: centralized null-stripping at the MCP boundary --------------------------------
;; The MCP inputSchema we publish makes every optional field required-and-nullable, because strict
;; MCP clients (notably ChatGPT) cannot represent absent fields — they always send every property
;; the schema declares, with `null` for the ones the agent doesn't want to populate. We strip
;; those nulls here so each downstream tool handler can use ordinary Clojure idioms (destructure
;; `:or` defaults, `(when foo …)`, etc.) and treat missing and null identically.
;;
;; The alternative is per-tool auditing: every endpoint handler would need to coerce nil into the
;; right default, and every wire schema's dispatch logic would need to tolerate explicit nulls. We
;; chose centralization because (a) it's the layer that creates the strict-validator artifact, and
;; (b) the codex review found that `query`'s `:multi` dispatch on `:continuation_token` already
;; mishandled a client-sent `null`, so per-tool handling is easy to miss.
;;
;; TRADE-OFF: as a consequence, a top-level `null` argument is indistinguishable from omitted at
;; the MCP boundary. If we ever expose a tool whose semantics genuinely require `null` to mean
;; something different from "missing" (e.g. \"clear this field\" semantics), it must either model
;; the distinction with a sentinel value (`{:clear true}`) or do the bespoke handling before this
;; normalization runs (e.g. as a pre-processing step inside `call-tool`).
(defn- drop-nil-args
  "Strip nil-valued top-level keys from MCP tool arguments.
   Nested values are left alone — the strict-tool transform only rewrites top-level properties."
  [arguments]
  (when arguments
    (into {} (remove (comp nil? val)) arguments)))

(defn call-tool
  "Dispatch an MCP `tools/call` request to the appropriate handler.
   `token-scopes` from the original MCP session are propagated to the synthetic
   agent-api request so that scope restrictions are enforced by the agent API's
   `defendpoint` middleware.
   Returns MCP content on success, or error content on failure."
  [token-scopes tool-name arguments]
  (let [arguments (drop-nil-args arguments)]
    (if-let [tool-def (get (tool-index) tool-name)]
      (try
        (dispatch-via-agent-api tool-def arguments token-scopes)
        (catch Exception e
          (error-content (or (ex-message e) "Internal error"))))
      (error-content (str "Unknown tool: " tool-name)))))

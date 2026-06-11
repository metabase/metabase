(ns metabase.mcp.tools
  "MCP tool dispatch. Generates tool definitions from defendpoint metadata and delegates
   tool calls to existing agent API endpoints."
  (:require
   [clojure.core.async :as a]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.agent-api.api :as agent-api]
   [metabase.api.common :as api]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.config.core :as config]
   [metabase.mcp.resources :as mcp.resources]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.session :as mcp.session]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
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

;; Shared sub-shapes for the representations-shaped tools (`construct_query`, `query`).
;;
;; The wire schemas under `agent-api` describe the body as `{:query <::lib.schema/external-query>}`,
;; and `::external-query` references `::lib.schema/query`, which carries `:optional` keys (notably
;; `:lib/metadata`) that are not `[:maybe ...]`. The new `assert-optional-fields-nullable!` lint in
;; `tools-manifest` walks every reachable map and fails on those — which is the right behaviour for
;; tool inputs but not for the lib-internal query map we never want strict MCP clients to populate.
;;
;; The override here publishes a permissive `:query` field (an opaque JSON object) and conveys the
;; real grammar through the tool description + `metabase://docs/construct-query.md`. Strict MCP
;; clients (ChatGPT) get a clean JSON Schema (no `prefixItems` / `allOf`); the agent learns the
;; actual MBQL 5 shape from the prompt.

(def ^:private external-query-mcp-malli
  "MCP-visible shape for the `query` field of `construct_query` / `query`. Deliberately opaque:
  publishing the full `::lib.schema/external-query` recursively would pull in `::query`'s optional
  non-nullable `:lib/metadata` (which trips the manifest's strict-tool lint) and emit `prefixItems` /
  `allOf` JSON Schema constructs that strict MCP clients (ChatGPT) reject."
  [:map {:tool/description (str "A Metabase MBQL 5 query as a JSON object. See the "
                                "`construct_notebook_query` tool for the format reference.")}])

(def ^:private construct-query-mcp-input-malli
  "MCP-visible input for `construct_query`.
  Deliberately flatter than the wire schema — the MBQL 5 representations grammar is conveyed through
  the tool description and the construct-query.md MCP resource, not the schema."
  [:map
   [:query  {:tool/description "Metabase MBQL 5 query."}
    external-query-mcp-malli]
   ;; Length bounds + description go on the inner `:string` so they end up on the JSON Schema branch
   ;; (and not as an `:allOf`, which ChatGPT's strict validator rejects).
   [:prompt {:optional true}
    [:maybe [:string {:min               1
                      :max               10000
                      :tool/description  (str "The user's exact original message, when available. "
                                              "Pass it as-is without summarizing or rewriting.")}]]]])

(def ^:private query-mcp-input-malli
  "MCP-visible input for `query`. The wire body is a `:multi` whose `:fresh` branch references
  `::lib.schema/external-query` — that pulls in `::query`'s `:optional` non-nullable
  `:lib/metadata` (and emits `prefixItems` / `allOf` JSON Schema constructs that strict MCP
  clients reject). This override publishes the same opaque-object `:query` field used by
  `construct_query`, plus the `:query_handle` and `:continuation_token` alternatives. The handle
  is swapped for the stored base64 `:query` by [[resolve-query-arg]] before dispatch."
  [:map
   [:query              {:optional true
                         :tool/description (str "Metabase MBQL 5 query. Use `query_handle` instead "
                                                "when you have one. Omit when paginating via "
                                                "`continuation_token`.")}
    [:maybe external-query-mcp-malli]]
   [:query_handle       {:optional true
                         :tool/description (str "Handle returned by construct_query — preferred over "
                                                "raw `query`.")}
    [:maybe ms/UUIDString]]
   [:continuation_token {:optional true
                         :tool/description (str "Token returned by a previous `query` response — pass "
                                                "it back to fetch the next page. Mutually exclusive "
                                                "with `query`.")}
    [:maybe ms/NonBlankString]]])

(def ^:private execute-query-mcp-input-malli
  "MCP-visible input for `execute_query`.
  The wire endpoint requires `:query`; the MCP tool also accepts `:query_handle`, resolved by
  [[resolve-query-arg]] before dispatch."
  [:map
   [:query {:optional true
            :tool/description "Base64-encoded MBQL query. Use `query_handle` instead when available."}
    [:maybe ms/NonBlankString]]
   [:query_handle {:optional true
                   :tool/description "Handle returned by construct_query — preferred over raw `query`."}
    [:maybe ms/UUIDString]]])

(def ^:private construct-query-mcp-output-malli
  "MCP-visible output of `construct_query`.
   The agent_api endpoint returns `{:query base64}`; the MCP body transform stores that and emits
   `{:query_handle}`."
  [:map
   [:query_handle
    {:tool/description (str "Opaque UUID handle for the stored query. "
                            "Pass as `query_handle` to `execute_query` or `visualize_query`.")}
    ms/UUIDString]])

(def ^:private mcp-input-overrides
  "tool-name → Malli schema. Replaces the manifest's derived `:inputSchema`."
  {"construct_query" construct-query-mcp-input-malli
   "query"           query-mcp-input-malli
   "execute_query"   execute-query-mcp-input-malli})

(def ^:private mcp-output-overrides
  "tool-name → Malli schema. Replaces the manifest's derived `:outputSchema`."
  {"construct_query" construct-query-mcp-output-malli})

(defn- override->input-json-schema [malli tool-name]
  (tools-manifest/assert-optional-fields-nullable! malli tool-name)
  (-> malli tools-manifest/malli->json-schema tools-manifest/strict-tool-input-schema))

(defn- apply-schema-overrides
  "Replace `:inputSchema`/`:outputSchema` on tools whose MCP-visible shape differs from the wire shape.
   The `overrides-cover-known-tools-test` test asserts every key here matches a real tool name; a
   misspelled or drifted key would otherwise silently no-op and leave the wire shape published."
  [tools]
  (mapv (fn [{tool-name :name :as tool}]
          (cond-> tool
            (mcp-input-overrides tool-name)
            (assoc :inputSchema (override->input-json-schema (mcp-input-overrides tool-name) tool-name))

            (mcp-output-overrides tool-name)
            (assoc :outputSchema (tools-manifest/malli->json-schema (mcp-output-overrides tool-name)))))
        tools))

(defn- generate-manifest
  "Generate tools manifest from agent API endpoint metadata, then patch input/output schemas for tools
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

(def ^:private extension-labels
  "Human-readable labels for required-extension keywords in tool-call error messages."
  {:mcp-app-ui "MCP Apps UI"})

(defn- supported-extensions
  [{:keys [supports-mcp-ui?]}]
  (if supports-mcp-ui?
    #{:mcp-app-ui}
    #{}))

(defn- missing-required-extensions
  [tool supported-extensions]
  (seq (set/difference (:required-extensions tool #{}) supported-extensions)))

(defn- missing-extensions-error
  [tool-name missing-extensions]
  (let [extension-names (str/join ", " (map #(get extension-labels % (name %)) missing-extensions))]
    (str tool-name " requires a client that supports " extension-names ". "
         "Reconnect from a client that advertises text/html;profile=mcp-app.")))

(defn list-tools
  "Return the tool definitions suitable for MCP `tools/list` responses.
   When `token-scopes` is provided, only tools whose scope matches are included."
  ([token-scopes]
   (list-tools token-scopes {:supports-mcp-ui? true}))
  ([token-scopes options]
   (let [{:keys [tools]} (manifest)
         supported       (supported-extensions options)]
     (into []
           (comp (filter #(mcp.scope/matches? token-scopes (:scope %)))
                 (remove #(missing-required-extensions % supported))
                 (map (fn [tool]
                        (select-keys tool [:name :title :description :inputSchema :outputSchema :annotations :_meta]))))
           (concat tools (mcp.resources/list-ui-tools))))))

(defn- pad-left
  [^String s width]
  (if (>= (count s) width)
    s
    (str (apply str (repeat (- width (count s)) \0)) s)))

(defn tools-hash
  "Return a stable hash of the tool list visible to `token-scopes`, formatted as
   an 8-character unsigned hex string. Used by the SSE keepalive loop to detect
   manifest changes and emit `notifications/tools/list_changed`. Hashes the JSON
   encoding of `[name inputSchema outputSchema]` per tool, sorted by name, so the
   result is determined purely by the wire-visible schema bytes — no reliance on
   Clojure's `hash` of map values (which can be unstable for non-data leaves
   like functions, and is order-sensitive for some collection types)."
  [token-scopes]
  (-> (->> (list-tools token-scopes)
           (map (juxt :name :inputSchema :outputSchema))
           (sort-by first)
           json/encode
           hash)
      (Integer/toUnsignedString 16)
      (pad-left 8)))

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

;;; ------------------------------------------- Query Handle Transforms -------------------------------------------

(defn- resolve-query-arg
  "Resolve the query argument for tools that accept a handle.
   If :query_handle is present, look it up and replace with :query.
   If :query is itself a UUID (the LLM passed the handle in the wrong field), resolve
   it too (and log a warning).
   Returns updated arguments, or ::handle-not-found if the handle doesn't exist."
  [session-id tool-name arguments]
  (let [user-id api/*current-user-id*]
    (cond
      (:query_handle arguments)
      (if-let [{:keys [encoded_query]} (mcp.session/resolve-query-handle
                                        session-id user-id (:query_handle arguments))]
        (-> arguments (dissoc :query_handle) (assoc :query encoded_query))
        ::handle-not-found)

      (mcp.session/valid-id? (:query arguments))
      (do (log/warnf "MCP tool %s: agent passed a UUID handle in :query; resolving as :query_handle"
                     tool-name)
          (if-let [{:keys [encoded_query]} (mcp.session/resolve-query-handle
                                            session-id user-id (:query arguments))]
            (assoc arguments :query encoded_query)
            ::handle-not-found))

      :else
      arguments)))

(def ^:private construct-query-output-validator
  (mr/validator construct-query-mcp-output-malli))

(defn- make-store-construct-query-result
  "Build a body-transform fn for construct_query.
   The fn stores the base64 payload server-side under the calling user (with the current MCP session id
   recorded for cleanup) and returns {:query_handle uuid} instead of {:query base64}, so the LLM carries
   a short opaque UUID rather than the full base64 string.
   The optional prompt is stored with the handle for later feedback submission.

   The fn validates its emitted shape against `construct-query-mcp-output-malli` — the same schema the
   manifest publishes as the tool's outputSchema — keeping the published schema and the actual emitted
   body in lockstep."
  [session-id user-id]
  (fn [body]
    (if-let [encoded (:query body)]
      (let [handle   (mcp.session/store-handle! session-id user-id encoded (:prompt body))
            new-body {:query_handle handle}]
        (when-not (construct-query-output-validator new-body)
          (throw (ex-info (str "construct_query body transform produced a shape that doesn't "
                               "match the declared outputSchema")
                          {:body new-body})))
        new-body)
      body)))

;; Tools whose :query_handle is resolved by `resolve-query-arg` (it swaps the handle for the stored
;; base64 :query) before the agent-api dispatch in `call-tool`. `visualize_query` also accepts a
;; handle, but it's a UI tool that resolves the handle itself (see `metabase.mcp.resources`) and
;; never reaches this dispatch path, so it's intentionally absent here.
(def ^:private tools-accepting-query-handle
  #{"execute_query" "query" "create_question" "update_question"})

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
   For POST/PUT/PATCH requests, `params` is sent as the request body.
   For other methods (GET/DELETE), `params` is sent as parsed query params.
   Materializes StreamingResponse bodies in-process before delivering."
  [result method path token-scopes params]
  (agent-api/routes
   (cond-> {:request-method   method
            :uri              path
            :metabase-user-id api/*current-user-id*
            :token-scopes     token-scopes}
     ;; POST/PUT/PATCH carry params in the body; GET/DELETE carry them as query params.
     (and (seq params) (#{:post :put :patch} method))    (assoc :body params)
     (and (seq params) (not (#{:post :put :patch} method))) (assoc :query-params params))
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
   For POST/PUT/PATCH, `params` becomes the request body; otherwise (GET/DELETE)
   `params` becomes query-params.

   Propagates `token-scopes` from the original MCP request so that scope restrictions
   are preserved through the synthetic request.

   `body-transform-fn`, when provided, is applied to the 200 response body before
   wrapping with text-content. Used to post-process construct_query results."
  [method path token-scopes params & {:keys [body-transform-fn]}]
  (let [result (promise)]
    (deliver-agent-api-response result method path token-scopes params)
    (let [response (deref result 30000 {:status 504 :body {:message "Timeout"}})]
      (cond
        ;; Already materialized from a StreamingResponse
        (:content response)
        response

        (= 200 (:status response))
        (text-content (cond-> (:body response)
                        body-transform-fn (body-transform-fn)))

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
   and calls `invoke-agent-api`. For POST/PUT/PATCH requests, remaining args are
   sent as the request body. For other methods (GET/DELETE), remaining args are
   sent as query params."
  [tool-def arguments token-scopes session-id]
  (let [{:keys [method path]} (:endpoint tool-def)
        tool-name             (:name tool-def)
        method                (keyword (u/lower-case-en method))
        [resolved-path
         remaining-args]      (interpolate-path path arguments)
        api-path              (strip-api-prefix resolved-path)
        body-transform-fn     (when (= tool-name "construct_query")
                                (make-store-construct-query-result
                                 session-id api/*current-user-id*))]
    (invoke-agent-api method api-path token-scopes remaining-args
                      :body-transform-fn body-transform-fn)))

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
   `defendpoint` middleware. UI tool response-fns receive `{:session-id session-id}`
   as opts in case a tool needs to scope reads to the calling MCP session.
   Returns MCP content on success, or error content on failure."
  ([token-scopes session-id tool-name arguments]
   (call-tool token-scopes session-id tool-name arguments {:supports-mcp-ui? true}))
  ([token-scopes session-id tool-name arguments options]
   (let [arguments (drop-nil-args arguments)
         supported (supported-extensions options)]
     (if-let [ui-tool (some #(when (= tool-name (:name %)) %) (mcp.resources/list-ui-tools))]
       (if-not (mcp.scope/matches? token-scopes (:scope ui-tool))
         (error-content (str "Insufficient scope to call tool: " tool-name))
         (if-let [missing-extensions (missing-required-extensions ui-tool supported)]
           (error-content (missing-extensions-error tool-name missing-extensions))
           ((:response-fn ui-tool) arguments {:session-id session-id})))
       (if-let [tool-def (get (tool-index) tool-name)]
         (if-not (mcp.scope/matches? token-scopes (:scope tool-def))
           (error-content (str "Insufficient scope to call tool: " tool-name))
           (if-let [missing-extensions (missing-required-extensions tool-def supported)]
             (error-content (missing-extensions-error tool-name missing-extensions))
             (let [arguments (if (tools-accepting-query-handle tool-name)
                               (resolve-query-arg session-id tool-name arguments)
                               arguments)]
               (if (= arguments ::handle-not-found)
                 (error-content "Query handle not found. The query may have expired — try running construct_query again.")
                 (try
                   (dispatch-via-agent-api tool-def arguments token-scopes session-id)
                   (catch Exception e
                     (error-content (or (ex-message e) "Internal error"))))))))
         (error-content (str "Unknown tool: " tool-name)))))))

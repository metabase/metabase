(ns metabase.mcp.tools
  "MCP tool dispatch. Generates tool definitions from defendpoint metadata and delegates
   tool calls to existing agent API endpoints."
  (:require
   [clojure.core.async :as a]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.agent-api.api :as agent-api]
   [metabase.agent-api.catalog :as agent-api.catalog]
   [metabase.agent-api.handles :as agent-api.handles]
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.api.common :as api]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.config.core :as config]
   [metabase.mcp.resources :as mcp.resources]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.usage :as mcp.usage]
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
   "query"           query-mcp-input-malli})

(def ^:private mcp-output-overrides
  "tool-name → Malli schema. Replaces the manifest's derived `:outputSchema`.

   Only the construct tools need one: this layer rewrites their body, storing the base64 payload and
   emitting `{:query_handle}` in its place (see [[tools-storing-query-handle]]), so the endpoint's own
   response schema is not what reaches the client. An endpoint whose MCP-visible output merely *narrows*
   its body — a v2 read publishing its structured channel — declares that schema itself, on the
   defendpoint, and needs no entry here."
  {"construct_query"        construct-query-mcp-output-malli
   "construct_native_query" construct-query-mcp-output-malli})

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
  (-> (tools-manifest/generate-tools-manifest agent-api.catalog/tool-namespaces)
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

(def ^:private tool-switches
  "Tools an admin can turn off instance-wide, and the setting that says so.

   A disabled tool is *absent* from `tools/list`, not merely refused when called: a tool the server
   advertises is a tool a model will spend a turn on, and the turn it spends learning that raw SQL is off is
   a turn the user watches it waste. The endpoint refuses the call as well — a client that cached the list
   before the switch was thrown still reaches it."
  {"execute_sql" agent-api.settings/mcp-execute-sql-enabled})

(defn- disabled?
  [{tool-name :name}]
  (when-let [enabled? (tool-switches tool-name)]
    (not (enabled?))))

(defn- missing-extensions-error
  [tool-name missing-extensions]
  (let [extension-names (str/join ", " (map #(get extension-labels % (name %)) missing-extensions))]
    (str tool-name " requires a client that supports " extension-names ". "
         "Reconnect from a client that advertises text/html;profile=mcp-app.")))

(defn list-tools
  "Return the tool definitions suitable for MCP `tools/list` responses.
   When `token-scopes` is provided, only tools whose scope matches are included.

   Sorted by name across both sources, so the same scopes and client capabilities always produce
   byte-identical bytes on the wire. Clients cache the tool list into the prompt prefix; an
   unstable order costs them the cache hit on every reconnect."
  ([token-scopes]
   (list-tools token-scopes {:supports-mcp-ui? true}))
  ([token-scopes options]
   (let [{:keys [tools]} (manifest)
         supported       (supported-extensions options)]
     (into []
           (comp (filter #(mcp.scope/matches? token-scopes (:scope %)))
                 (remove disabled?)
                 (remove #(missing-required-extensions % supported))
                 (map (fn [tool]
                        (select-keys tool [:name :title :description :inputSchema :outputSchema
                                           :annotations :inputExamples :_meta]))))
           (sort-by :name (concat tools (mcp.resources/list-ui-tools)))))))

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

(defn- uuid-string?
  [v]
  (boolean (and (string? v) (parse-uuid v))))

(defn- resolve-query-arg
  "Resolve the query argument for tools that accept a handle.
   If :query_handle is present, look it up and replace with :query.
   If :query is itself a UUID (the LLM passed the handle in the wrong field), resolve
   it too (and log a warning).
   Returns updated arguments, or ::handle-not-found if the handle doesn't exist."
  [tool-name arguments]
  (let [user-id api/*current-user-id*]
    (cond
      (:query_handle arguments)
      (if-let [{:keys [encoded_query]} (agent-api.handles/resolve-query-handle
                                        user-id (:query_handle arguments))]
        (-> arguments (dissoc :query_handle) (assoc :query encoded_query))
        ::handle-not-found)

      (uuid-string? (:query arguments))
      (do (log/warnf "MCP tool %s: agent passed a UUID handle in :query; resolving as :query_handle"
                     tool-name)
          (if-let [{:keys [encoded_query]} (agent-api.handles/resolve-query-handle
                                            user-id (:query arguments))]
            (assoc arguments :query encoded_query)
            ::handle-not-found))

      :else
      arguments)))

(def ^:private construct-query-output-validator
  (mr/validator construct-query-mcp-output-malli))

(defn- make-store-construct-query-result
  "Build a body-transform fn for the construct tools (`construct_query`, `construct_native_query`).
   The fn stores the base64 payload server-side under the calling user and returns {:query_handle uuid}
   instead of {:query base64}, so the LLM carries a short opaque UUID rather than the full base64 string.
   The optional prompt is stored with the handle for later feedback submission.

   The fn validates its emitted shape against `construct-query-mcp-output-malli` — the same schema the
   manifest publishes as the tool's outputSchema — keeping the published schema and the actual emitted
   body in lockstep."
  [user-id]
  (fn [body]
    (if-let [encoded (:query body)]
      (let [handle   (agent-api.handles/store-handle! user-id encoded (:prompt body))
            new-body {:query_handle handle}]
        (when-not (construct-query-output-validator new-body)
          (throw (ex-info (str "construct_query body transform produced a shape that doesn't "
                               "match the declared outputSchema")
                          {:body new-body})))
        new-body)
      body)))

;; Tools whose endpoint takes a base64 `:query` and has no `query_handle` argument of its own, so
;; `resolve-query-arg` swaps the handle for the stored query before dispatch. Membership is exactly
;; that: a tool whose endpoint resolves handles itself must not be listed, or its handle would be
;; consumed here and never reach it. That covers every v2 tool (a handle is part of their wire
;; contract, so an HTTP caller of the agent API gets the same semantics an MCP client does) and
;; `visualize_query`, a UI tool that resolves the handle in `metabase.mcp.resources` and never reaches
;; this dispatch path at all.
(def ^:private tools-accepting-query-handle
  #{"query" "create_question" "update_question" "create_metric" "update_metric"})

;; Tools whose 200 body is `{:query base64}` and gets stored as a handle, returning `{:query_handle}`.
;; `construct_query` (MBQL) and `construct_native_query` (native SQL) both follow this contract.
(def ^:private tools-storing-query-handle
  #{"construct_query" "construct_native_query"})

;;; ------------------------------------------------- Tool Dispatch -------------------------------------------------

(defn- text-content
  "Wrap a value as an MCP tool-call result.
   Map/sequential values are surfaced as `structuredContent` — MCP spec requires this for any tool that
   declares an `outputSchema`.
   The `content` array carries a text serialization for clients that don't consume structuredContent.

   This is the v1 shape: it mirrors the whole body into both channels. v2 tools use
   [[two-channel-content]] instead, which carries the data once."
  [v]
  (cond-> {:content [{:type "text" :text (if (string? v) v (json/encode v))}]}
    (or (map? v) (sequential? v)) (assoc :structuredContent v)))

(defn two-channel-content
  "v2 MCP tool result with the data carried exactly once.

   `text` is the full human/data payload shown in the `content` text block — a string as-is, or any
   value JSON-encoded once (the dataset REST shape for query results, compact JSON for records).
   `structured`, when given, carries *only* the machine next-step fields — a query handle, counts,
   truncation flags — and is never a mirror of the full body. Declare an `outputSchema` for the
   structured channel where its shape is stable.

   The sibling `text-content` mirrors the whole body into both channels; v2 tools prefer this so the
   data lives in one place and `structuredContent` stays reserved for what the next tool call or the
   iframe actually consumes."
  ([text] {:content [{:type "text" :text (if (string? text) text (json/encode text))}]})
  ([text structured]
   (cond-> {:content [{:type "text" :text (if (string? text) text (json/encode text))}]}
     (some? structured) (assoc :structuredContent structured))))

(def ^:private v2-payload-keys
  "Every key a v2 body carries its payload under: a list envelope's `:data`, `get_parameter_values`' `:values`, and
   `execute_query`'s `:cols` + `:rows` — the two reads whose body is the REST shape verbatim rather than an envelope.
   What is left after they are removed is the machine channel. A v2 tool that puts its payload under a new key must
   name it here, or [[v2-content]] will mirror that payload into `structuredContent` and send it twice."
  [:data :values :cols :rows])

(defn- v2-content
  "MCP result for a v2 tool: the body once in the text block, and in `structuredContent` only the fields
   a next call consumes — counts, a truncation steer, a query handle. Never a second copy of the payload,
   which is what `text-content` does for v1 and what the response budget cannot afford twice. A body that
   is all machine channel (`execute_query` under `validate_only`) has nothing removed and travels whole
   through both."
  [body]
  (two-channel-content body
                       (when (map? body)
                         (not-empty (apply dissoc body v2-payload-keys)))))

;; JSON-RPC error codes recorded as `mcp_tool_call_log.error_code` for failed tool calls.
;; Kept in sync with the `error_code` -> `error_type` CASE in the v_mcp_tool_calls view SQL. The
;; view also maps -32000 ("Server error") defensively (JSON-RPC reserves -32000..-32099), but the
;; recorder never emits it, so there's no constant for it here.
(def ^:private error-code-invalid-request -32600)
(def ^:private error-code-method-not-found -32601)
(def ^:private error-code-invalid-params -32602)
(def ^:private error-code-internal -32603)

(defn- error-content
  "Wrap an error message as MCP error content. The JSON-RPC `code` (default: internal error) is
   carried under a namespaced key for usage logging and stripped from the response before it
   reaches the client (see [[call-tool]])."
  ([message] (error-content message error-code-internal))
  ([message code] {:content [{:type "text" :text message}] :isError true ::error-code code}))

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
   wrapping. Used to post-process construct_query results. `content-fn` wraps the body as MCP content
   and defaults to [[text-content]]; v2 tools pass [[v2-content]]."
  [method path token-scopes params & {:keys [body-transform-fn content-fn]
                                      :or   {content-fn text-content}}]
  (let [result (promise)]
    (deliver-agent-api-response result method path token-scopes params)
    (let [response (deref result 30000 {:status 504 :body {:message "Timeout"}})]
      (cond
        ;; Already materialized from a StreamingResponse
        (:content response)
        response

        (= 200 (:status response))
        (content-fn (cond-> (:body response)
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
  [tool-def arguments token-scopes]
  (let [{:keys [method path]} (:endpoint tool-def)
        tool-name             (:name tool-def)
        method                (keyword (u/lower-case-en method))
        [resolved-path
         remaining-args]      (interpolate-path path arguments)
        api-path              (strip-api-prefix resolved-path)
        body-transform-fn     (when (tools-storing-query-handle tool-name)
                                (make-store-construct-query-result api/*current-user-id*))
        ;; A tool that declared a structured output on its endpoint carries its payload once, in the text
        ;; block, and puts only the next-step fields on the structured channel. Every other tool mirrors its
        ;; whole body into both.
        content-fn            (if (:structuredOutput tool-def) v2-content text-content)]
    (invoke-agent-api method api-path token-scopes remaining-args
                      :body-transform-fn body-transform-fn
                      :content-fn content-fn)))

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

(defn- dispatch-tool-call
  "Resolve and invoke the handler for an MCP `tools/call`, returning MCP content on success
   or error content on failure. The instrumented [[call-tool]] wraps this."
  [token-scopes tool-name arguments options]
  (let [arguments (drop-nil-args arguments)
        supported (supported-extensions options)]
    (if-let [ui-tool (some #(when (= tool-name (:name %)) %) (mcp.resources/list-ui-tools))]
      (if-not (mcp.scope/matches? token-scopes (:scope ui-tool))
        (error-content (str "Insufficient scope to call tool: " tool-name) error-code-invalid-request)
        (if-let [missing-extensions (missing-required-extensions ui-tool supported)]
          (error-content (missing-extensions-error tool-name missing-extensions) error-code-invalid-params)
          ((:response-fn ui-tool) arguments)))
      (if-let [tool-def (get (tool-index) tool-name)]
        (if-not (mcp.scope/matches? token-scopes (:scope tool-def))
          (error-content (str "Insufficient scope to call tool: " tool-name) error-code-invalid-request)
          (if-let [missing-extensions (missing-required-extensions tool-def supported)]
            (error-content (missing-extensions-error tool-name missing-extensions) error-code-invalid-params)
            (let [arguments (if (tools-accepting-query-handle tool-name)
                              (resolve-query-arg tool-name arguments)
                              arguments)]
              (if (= arguments ::handle-not-found)
                (error-content "Query handle not found. The query may have expired — try running construct_query again." error-code-invalid-params)
                (try
                  (dispatch-via-agent-api tool-def arguments token-scopes)
                  (catch Exception e
                    (error-content (or (ex-message e) "Internal error") error-code-internal)))))))
        (error-content (str "Unknown tool: " tool-name) error-code-method-not-found)))))

(defn call-tool
  "Dispatch an MCP `tools/call` request to the appropriate handler.
   `token-scopes` from the caller's token are propagated to the synthetic agent-api request so
   that scope restrictions are enforced by the agent API's `defendpoint` middleware.
   Returns MCP content on success, or error content on failure.

   Every call — including scope-denied, unknown-tool, and error outcomes — is recorded to
   `mcp_tool_call_log` (EE-only, best-effort) with its timing, success/error status, and on
   error the JSON-RPC `error_code` + `error_message` (the latter gated/truncated by the writer)."
  ([token-scopes tool-name arguments]
   (call-tool token-scopes tool-name arguments {:supports-mcp-ui? true}))
  ([token-scopes tool-name arguments options]
   (let [start   (System/nanoTime)
         record! (fn [status error-code error-message]
                   (mcp.usage/record-mcp-tool-call!
                    {:tool-name     tool-name
                     :user-id       api/*current-user-id*
                     ;; Analytics only: pre-RC clients advertise their identity once, at
                     ;; `initialize`, so the recorder falls back to the session row's stored client
                     ;; when the call's `_meta` carries none. Nothing else reads it.
                     :session-id    (:session-id options)
                     :status        status
                     :duration-ms   (quot (- (System/nanoTime) start) 1000000)
                     :error-code    error-code
                     :error-message error-message
                     ;; Identity + PII are denormalized onto the row (the view does not join the
                     ;; session): client from the call's `_meta`, tenant from the current user,
                     ;; IP/UA from the request. The recorder gates the PII columns.
                     :client-info   (:client-info options)
                     :tenant-id     (some-> api/*current-user* deref :tenant_id)
                     :user-agent    (get-in options [:request-context :user-agent])
                     :ip-address    (get-in options [:request-context :ip-address])}))]
     (try
       (let [result (dispatch-tool-call token-scopes tool-name arguments options)
             error? (boolean (:isError result))]
         (record! (if error? "error" "success")
                  (when error? (or (::error-code result) error-code-internal))
                  (when error? (some-> result :content first :text)))
         ;; `::error-code` is an internal classification marker — never expose it to the client.
         (dissoc result ::error-code))
       (catch Throwable e
         ;; A handler that throws instead of returning error content (notably a UI tool
         ;; `:response-fn`, whose path isn't wrapped in `dispatch-tool-call`) would otherwise
         ;; skip instrumentation and under-report errors. Record the failure, then rethrow so the
         ;; transport layer still surfaces it to the client.
         (record! "error" error-code-internal (ex-message e))
         (throw e))))))

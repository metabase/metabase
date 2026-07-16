(ns metabase.mcp.v2.registry
  "The v2 MCP tool registry. Tools are in-code registry entries declared with [[deftool]] —
   not defendpoints — so the v2 surface builds its own manifest and dispatch:

   - `tools/list` ([[list-tools]]) filters by token scopes, the `mcp-v2-disabled-tools` CSV,
     and EE feature availability (EE-only capability is hidden on OSS, never failed at call
     time);
   - `tools/call` ([[call-tool]]) re-checks all three, validates arguments against the tool's
     Malli schema with teaching errors, dispatches to the handler under the already-bound
     current user, and logs every outcome through the shared usage path.

   Every tool carries a `:scope` (task 02's table is authoritative); registration fails loudly
   without one."
  (:require
   [clojure.string :as str]
   [malli.error :as me]
   [metabase.ai-tracing.core :as ait]
   [metabase.api.common :as api]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.mcp.usage :as mcp.usage]
   [metabase.mcp.v2.common :as common]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Registration --------------------------------------------------

(defonce ^:private tools*
  (atom {}))

(defonce ^:private manifest-cache
  (atom nil))

(defn register-tool!
  "Register a v2 tool definition. Called by [[deftool]]; throws at load time when the
   definition is missing its `:scope` (every tool is scope-gated from the first commit),
   `:name`, `:description`, `:args` schema, or `:handler`."
  [{tool-name :name :keys [scope description args handler] :as tool}]
  (when (str/blank? tool-name)
    (throw (ex-info "v2 MCP tool registered without a :name" {:tool tool})))
  (doseq [[k v] {:scope scope :description description}]
    (when-not (and (string? v) (not (str/blank? v)))
      (throw (ex-info (format "v2 MCP tool %s registered without a %s string" tool-name k)
                      {:tool-name tool-name k v}))))
  (when-not args
    (throw (ex-info (format "v2 MCP tool %s registered without an :args Malli schema" tool-name)
                    {:tool-name tool-name})))
  (when-not (ifn? handler)
    (throw (ex-info (format "v2 MCP tool %s registered without a :handler fn" tool-name)
                    {:tool-name tool-name})))
  ;; Fail at load time (not first list) on a schema strict clients can't consume.
  (tools-manifest/assert-optional-fields-nullable! args tool-name)
  (swap! tools* assoc tool-name tool)
  (reset! manifest-cache nil)
  tool-name)

(defmacro deftool
  "Define and register a v2 MCP tool. `description` is both the handler's docstring and the
   tool description published by tools/list.

    (deftool ping-v2
      \"Health-check tool for the v2 MCP surface.\"
      {:name        \"ping_v2\"
       :scope       metabot.scope/agent-search
       :annotations {:readOnlyHint true}
       :args        [:map …]}
      [arguments context]
      …)

   Defines `handler-sym` as the handler fn (2-arity: null-stripped, schema-validated
   `arguments`, and a `context` map of `:session-id`, `:token-scopes`, `:client-info`,
   `:request-context`) and registers the tool. Optional keys: `:update-scope` (the scope
   [[metabase.mcp.v2.common/dispatch-write]] re-checks on `method: \"update\"`; also advertised
   to OAuth via [[registered-scopes]]), `:extra-scopes` (scopes the handler re-checks per
   argument at runtime, likewise advertised), `:feature` (a premium-features keyword; the tool
   is hidden when the instance lacks it), `:annotations` (merged over the always-present MCP
   annotation defaults). Handlers return MCP content (see
   [[metabase.mcp.v2.common/success-content]]) or throw a teaching error."
  [handler-sym description opts argv & body]
  `(do
     (defn ~handler-sym ~description ~argv ~@body)
     ;; Register the var (not the fn value) so re-evaluating the handler in the REPL — or
     ;; redefining it in a test — takes effect without re-registering.
     (register-tool! (assoc ~opts :description ~description :handler (var ~handler-sym)))))

(defn registered-scopes
  "The distinct scope strings the v2 surface relies on: every registered tool's `:scope`,
   `:update-scope`, and `:extra-scopes` (scopes the tool re-checks per argument at runtime,
   e.g. get_content's per-type gates). Folded into [[metabase.mcp.core/all-scopes]] so net-new
   leaf scopes flow into the DCR default grant and RFC 9728 `scopes_supported` as their tools
   land. A net-new leaf must also be declared with `defscope` (and, for in-app metabot users,
   covered by a `perm-type->scopes` bucket) in [[metabase.metabot.scope]] alongside the tool
   that carries it."
  []
  (into #{}
        (comp (mapcat (fn [{:keys [scope update-scope extra-scopes]}]
                        (into [scope update-scope] extra-scopes)))
              (filter some?))
        (vals @tools*)))

;;; ------------------------------------------------ Manifest ------------------------------------------------------

(def ^:private default-annotations
  "`readOnlyHint`, `destructiveHint`, and `openWorldHint` are always present — some MCP clients
   (e.g. the ChatGPT Apps SDK) reject tools that omit them. `openWorldHint` is false because
   Metabase tools stay within the user's own instance."
  {:readOnlyHint    false
   :destructiveHint false
   :openWorldHint   false})

(defn- tool->manifest-entry
  [{:keys [args annotations] :as tool}]
  (assoc tool
         :inputSchema (-> args
                          tools-manifest/malli->json-schema
                          tools-manifest/strict-tool-input-schema)
         :annotations (merge default-annotations annotations)))

(defn- generate-manifest
  []
  (->> (vals @tools*)
       (sort-by :name)
       (mapv tool->manifest-entry)))

(defn- manifest
  "Manifest entries for all registered tools. Cached; [[register-tool!]] invalidates the cache,
   so a tool namespace loaded (or re-evaluated) at any point shows up in the next tools/list."
  []
  (or @manifest-cache
      (reset! manifest-cache (generate-manifest))))

(defn- disabled-tool-names
  []
  (set (mcp.settings/mcp-v2-disabled-tools)))

(defn- feature-available?
  [{:keys [feature]}]
  (or (nil? feature)
      (premium-features/has-feature? feature)))

(defn- visible?
  [token-scopes disabled tool]
  (and (not (contains? disabled (:name tool)))
       (feature-available? tool)
       (mcp.scope/matches? token-scopes (:scope tool))))

(defn list-tools
  "Return the tool definitions for the v2 MCP `tools/list` response, filtered by `token-scopes`,
   the `mcp-v2-disabled-tools` setting, and EE feature availability."
  [token-scopes]
  (let [disabled (disabled-tool-names)]
    (into []
          (comp (filter #(visible? token-scopes disabled %))
                (map #(select-keys % [:name :title :description :inputSchema :outputSchema :annotations :_meta])))
          (manifest))))

(defn tools-hash
  "Stable 8-character hex hash of the tool list visible to `token-scopes`; polled by the
   GET/SSE keepalive to emit `notifications/tools/list_changed` when the visible set changes
   (scope changes, `mcp-v2-disabled-tools` edits, feature flips). Hashes the JSON encoding of
   the wire-visible schema, so the result never depends on Clojure's `hash` of non-data leaves."
  [token-scopes]
  (format "%08x"
          (hash (->> (list-tools token-scopes)
                     (map (juxt :name :inputSchema :outputSchema))
                     (sort-by first)
                     json/encode))))

;;; ------------------------------------------------ Dispatch ------------------------------------------------------

(defn- format-validation-detail
  [errors]
  (cond
    (map? errors)        (str/join "; " (map (fn [[k v]]
                                               (str (if (keyword? k) (name k) (str k))
                                                    ": " (format-validation-detail v)))
                                             errors))
    (sequential? errors) (str/join ", " (map format-validation-detail errors))
    :else                (str errors)))

(defn- validation-error-message
  "Validate `arguments` against the tool's Malli schema; returns a teaching-style message
   string on failure, nil when valid."
  [schema arguments]
  (when-let [explanation ((mr/explainer schema) arguments)]
    (str "Invalid arguments: " (format-validation-detail (me/humanize explanation)))))

(defn- dispatch-tool-call
  [token-scopes session-id tool-name arguments options]
  (let [tool (get @tools* tool-name)]
    (cond
      (not (map? (or arguments {})))
      (common/error-content "Invalid arguments: expected a JSON object." common/error-code-invalid-params)

      ;; Disabled and feature-missing tools are absent from tools/list, so calling one is
      ;; indistinguishable from calling a tool that never existed.
      (or (nil? tool)
          (contains? (disabled-tool-names) tool-name)
          (not (feature-available? tool)))
      (common/error-content (str "Unknown tool: " tool-name) common/error-code-method-not-found)

      (not (mcp.scope/matches? token-scopes (:scope tool)))
      (common/error-content (str "Insufficient scope to call tool: " tool-name)
                            common/error-code-invalid-request)

      :else
      (let [arguments (common/drop-nil-args (or arguments {}))]
        (if-let [message (validation-error-message (:args tool) arguments)]
          (common/error-content message common/error-code-invalid-params)
          (try
            ((:handler tool) arguments {:session-id      session-id
                                        :token-scopes    token-scopes
                                        :client-info     (:client-info options)
                                        :request-context (:request-context options)})
            (catch clojure.lang.ExceptionInfo e
              (common/->mcp-error-content e))
            (catch Exception e
              (common/error-content (or (ex-message e) "Internal error") common/error-code-internal))))))))

(defn call-tool
  "Dispatch a v2 MCP `tools/call`. Returns MCP content on success, or error content on failure.

   Every call — including scope-denied, unknown-tool, and error outcomes — is recorded to
   `mcp_tool_call_log` (EE-only, best-effort) with its timing, success/error status, and on
   error the JSON-RPC `error_code` + `error_message` (the latter gated/truncated by the
   writer)."
  ([token-scopes session-id tool-name arguments]
   (call-tool token-scopes session-id tool-name arguments {}))
  ([token-scopes session-id tool-name arguments options]
   (ait/with-tool-call {:ai/tool-name tool-name :ai/tool-args arguments}
     (let [start   (System/nanoTime)
           record! (fn [status error-code error-message]
                     (mcp.usage/record-mcp-tool-call!
                      {:tool-name     tool-name
                       :user-id       api/*current-user-id*
                       :session-id    session-id
                       :status        status
                       :duration-ms   (quot (- (System/nanoTime) start) 1000000)
                       :error-code    error-code
                       :error-message error-message
                       :client-info   (:client-info options)
                       :tenant-id     (some-> api/*current-user* deref :tenant_id)
                       :user-agent    (get-in options [:request-context :user-agent])
                       :ip-address    (get-in options [:request-context :ip-address])}))]
       (try
         (let [result (dispatch-tool-call token-scopes session-id tool-name arguments options)
               error? (boolean (:isError result))]
           (record! (if error? "error" "success")
                    (when error? (or (::common/error-code result) common/error-code-internal))
                    (when error? (some-> result :content first :text)))
           ;; `::common/error-code` is an internal classification marker — never expose it to the client.
           (let [result (dissoc result ::common/error-code)]
             (ait/record! {:ai/tool-output result})
             result))
         (catch Throwable e
           ;; A handler that throws something the dispatch try doesn't convert would otherwise
           ;; skip instrumentation and under-report errors. Record the failure, then rethrow so
           ;; the transport layer still surfaces it to the client.
           (record! "error" common/error-code-internal (ex-message e))
           (throw e)))))))

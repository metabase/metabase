(ns metabase.mcp.v2.registry
  "The v2 MCP tool registry. Tools are in-code registry entries declared with [[deftool]].
  The v2 surface builds its own manifest and dispatch:

   - `tools/list` ([[list-tools]]) filters by token scopes, the `mcp-v2-disabled-tools` CSV,
     and the client extensions the caller advertised (a tool needing MCP Apps UI is hidden from
     a client that can't render an iframe, rather than failing at call time);
   - `tools/call` ([[call-tool]]) re-checks all three, validates arguments against the tool's
     Malli schema with teaching errors, dispatches to the handler under the already-bound
     current user, and logs every outcome through the shared usage path.

  The three filters are not three boundaries. Scopes come from the verified token and the
  disabled-tools CSV from instance settings, but the extension set is reconstructed from the
  unsigned capability payload the client echoes back in its session id — a client can claim any
  extension it likes, and never has to `initialize` to do so. Treat `:required-extensions` as a
  client-declared hint that keeps a tool out of a list where it could not render, and put nothing
  behind it that the tool's `:scope` does not already protect."
  (:require
   [clojure.string :as str]
   [malli.error :as me]
   [metabase.ai-tracing.core :as ait]
   [metabase.api.common :as api]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.mcp.ui-resource :as mcp.ui-resource]
   [metabase.mcp.usage :as mcp.usage]
   [metabase.mcp.v2.common :as common]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Registration --------------------------------------------------

(defonce ^:private tools*
  (atom {}))

;; Regenerating the manifest is slow. This atom stores a cache.
(defonce ^:private manifest-cache
  (atom nil))

(defn register-tool!
  "Register a v2 tool definition.

  Does basic validation of arguments and throws when invalid."
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
  ;; Dispatch gates on :required-extensions, so a misspelled key (:require-extensions,
  ;; :requires-extension) would silently disable the gate — reject unknown keys loudly instead.
  (when-let [unknown (seq (remove #{:name :scope :description :args :handler :annotations
                                    :output-schema :required-extensions :title :_meta}
                                  (keys tool)))]
    (throw (ex-info (format "v2 MCP tool %s registered with unknown option(s) %s" tool-name (vec unknown))
                    {:tool-name tool-name :unknown-keys (vec unknown)})))
  (when (and (contains? tool :required-extensions)
             (not (and (set? (:required-extensions tool)) (every? keyword? (:required-extensions tool)))))
    (throw (ex-info (format "v2 MCP tool %s :required-extensions must be a set of keywords" tool-name)
                    {:tool-name tool-name :required-extensions (:required-extensions tool)})))
  ;; Fail at load time (not first list) on a schema strict clients can't consume.
  (tools-manifest/assert-optional-fields-nullable! args tool-name)
  ;; The registry is keyed by public name. Re-evaluating the same `deftool` (REPL, test reload) registers
  ;; the same handler var again and may replace its entry; a second definition claiming an existing name
  ;; would otherwise silently shadow the first, with load order deciding which one `tools/call` reaches.
  (when-let [existing (get @tools* tool-name)]
    (when (not= (:handler existing) handler)
      (throw (ex-info (format "v2 MCP tool %s is already registered with a different handler" tool-name)
                      {:tool-name tool-name}))))
  (swap! tools* assoc tool-name tool)
  ;; flush cache to allow for repl/test redefinition.
  (reset! manifest-cache nil)
  tool-name)

(defmacro deftool
  "Define and register a v2 MCP tool.

    (deftool ping-v2
      \"Health-check tool for the v2 MCP surface.\"
      {:name        \"ping_v2\"
       :scope       metabot.scope/agent-content-read
       :annotations {:readOnlyHint true}
       :args        [:map …]}
      [arguments context]
      …)

   `description` is both the handler's docstring and the tool description published by tools/list.

   Defines `handler-sym` via `defn` with two arguments:
   - `arguments` - will be schema validated
   - `context` - a map of
     - `:session-id`
     - `:token-scopes`
     - `:client-info`
     - `:request-context`

   `opts` is a map of:
   - `:name` - the mcp public-facing name of the tool
   - `:scope` - the required scope for the tool
   - `:annotations` - _optional_ - overrides for the default annotations
   - `:args` - malli schema for the arguments, published as `inputSchema`
   - `:output-schema` - _optional_ - malli schema for the structured output, published as `outputSchema`
   - `:required-extensions` - _optional_ - set of client extensions (e.g. `:mcp-app-ui`) the tool
     needs to render. Clients that don't advertise one don't see the tool listed and get a
     teaching error if they call it anyway — but the advertisement is unauthenticated, so this is
     a hint that spares incapable clients an unrenderable tool, not an authorization boundary.
     `:scope` is the boundary; a tool gated only by an extension is a tool with no gate.
   - `:title` - _optional_ - human-readable display name, published alongside `:name` for clients
     that show one; without it clients fall back to the raw tool name
   - `:_meta` - _optional_ - map published verbatim on the tool entry, carrying client-specific
     hints outside the MCP tool schema (e.g. `{:ui {:visibility [\"app\"]}}` to mark a tool as one
     the app calls for itself rather than one the model should choose)

   Handlers return MCP content (see [[metabase.mcp.v2.common/success-content]]) or throw a teaching error."
  [handler-sym description opts argv & body]
  (assert (and (vector? argv)
               (= 2 (count argv))))
  `(do
     (defn ~handler-sym ~description ~argv ~@body)
     ;; Register the var (not the fn value) so re-evaluating the handler in the REPL — or
     ;; redefining it in a test — takes effect without re-registering.
     (register-tool! (assoc ~opts :description ~description :handler (var ~handler-sym)))))

(defn registered-scopes
  "The scopes from registered tools.

  All scopes must also be registered via `defscope`."
  []
  (into #{}
        (map :scope)
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
  [{:keys [args annotations output-schema] :as tool}]
  (cond-> (assoc tool
                 :inputSchema (-> args
                                  tools-manifest/malli->json-schema
                                  tools-manifest/strict-tool-input-schema)
                 :annotations (merge default-annotations annotations))
    ;; No strict transform on outputs — that rewrite exists to satisfy OpenAI's strict-tool rules
    ;; for arguments the model produces, and outputs aren't constrained by them.
    output-schema (assoc :outputSchema (tools-manifest/malli->json-schema output-schema))))

(defn- generate-manifest
  []
  (->> (vals @tools*)
       (sort-by :name)
       (mapv tool->manifest-entry)))

(defn- manifest
  "Cached manifest entries for all registered tools."
  []
  (or @manifest-cache
      (reset! manifest-cache (generate-manifest))))

(defn- disabled-tool-names
  []
  (set (mcp.settings/mcp-v2-disabled-tools)))

(defn list-tools
  "Return the tool definitions for the v2 MCP `tools/list` response, filtered by `token-scopes`,
   the `mcp-v2-disabled-tools` setting, and the client extensions
   `options` advertises (`:supports-mcp-ui?` — MCP Apps tools are hidden from clients that
   can't render an iframe rather than failing at call time).

   The 1-arity assumes full extension support: it backs [[tools-hash]], whose transport hook
   sees only token scopes, so the hash must not depend on per-session capabilities."
  ([token-scopes]
   (list-tools token-scopes {:supports-mcp-ui? true}))
  ([token-scopes options]
   (let [disabled  (disabled-tool-names)
         supported (mcp.ui-resource/supported-extensions options)]
     (into []
           (comp
            ;; no disabled tools
            (filter #(not (contains? disabled (:name %))))
            ;; has all required extensions
            (filter #(empty? (mcp.ui-resource/missing-required-extensions % supported)))
            ;; required scope is available
            (filter #(mcp.scope/matches? token-scopes (:scope %)))
            (map #(select-keys % [:name :title :description :inputSchema :outputSchema :annotations :_meta])))
           (manifest)))))

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

(defn- validation-error-message
  "Validate `arguments` against the tool's Malli schema; returns a teaching-style message
   string on failure, nil when valid."
  [schema arguments]
  (when-let [explanation ((mr/explainer schema) arguments)]
    (str "Invalid arguments: " (common/humanize-detail (me/humanize explanation)))))

(defn- dispatch-tool-call
  [token-scopes session-id tool-name arguments options]
  (let [tool    (get @tools* tool-name)
        missing (mcp.ui-resource/missing-required-extensions
                 tool (mcp.ui-resource/supported-extensions options))]
    (cond
      ;; Disabled tools are absent from tools/list, so calling one is indistinguishable from
      ;; calling a tool that never existed.
      (or (nil? tool)
          (contains? (disabled-tool-names) tool-name))
      (common/error-content (str "Unknown tool: " tool-name) common/error-code-method-not-found)

      (not (map? (or arguments {})))
      (common/error-content "Invalid arguments: expected a JSON object." common/error-code-invalid-params)

      (not (mcp.scope/matches? token-scopes (:scope tool)))
      (common/error-content (str "Insufficient scope to call tool: " tool-name)
                            common/error-code-invalid-request)

      ;; A UI tool the client can't render is a caller error, not a hidden tool: unlike the
      ;; scope/disabled cases it stays listed for capable clients, so name what's missing.
      (seq missing)
      (common/error-content (mcp.ui-resource/missing-extensions-error tool-name missing)
                            common/error-code-invalid-params)

      :else
      ;; Strict MCP clients (ChatGPT) send every declared property with `null` for the ones they
      ;; don't populate; stripping top-level nils at the boundary lets handlers treat missing and
      ;; null identically. Nested values are left alone.
      (let [arguments (u/remove-nils (or arguments {}))]
        (if-let [message (validation-error-message (:args tool) arguments)]
          (common/error-content message common/error-code-invalid-params)
          (try
            ((:handler tool) arguments {:session-id      session-id
                                        :token-scopes    token-scopes
                                        :client-info     (:client-info options)
                                        :request-context (:request-context options)})
            ;; Every failure is sanitized in one place: only deliberately caller-facing errors
            ;; surface their message; internal ones are logged and returned generically.
            (catch Exception e
              (common/->mcp-error-content e))))))))

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
         (let [result (dispatch-tool-call token-scopes session-id tool-name arguments options)]
           (if (:isError result)
             (record! "error"
                      (or (::common/error-code result) common/error-code-internal)
                      (some-> result :content first :text))
             (record! "success" nil nil))
           ;; `::common/error-code` is an internal classification marker — never expose it to the client.
           (let [result (dissoc result ::common/error-code)]
             ;; Trace the result WITHOUT the private MCP Apps block: it can carry a live UI credential, and a
             ;; trace outlives the credential's five-minute window. The client still gets the full result.
             (ait/record! {:ai/tool-output (common/redact-mcp-apps-meta result)})
             result))
         (catch Throwable e
           ;; A handler that throws something the dispatch try doesn't convert would otherwise skip instrumentation
           ;; and under-report errors. Record the failure, then rethrow so the transport layer still surfaces it to
           ;; the client.
           (record! "error" common/error-code-internal (ex-message e))
           (throw e)))))))

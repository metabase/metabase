(ns metabase.mcp.v2.registry
  "The v2 MCP tool registry. Tools are in-code registry entries declared with [[deftool]].
  The v2 surface builds its own manifest and dispatch:

   - `tools/list` ([[list-tools]]) filters by the `mcp-v2-disabled-tools` CSV and the client
     extensions the caller advertised (a tool needing MCP Apps UI is hidden from a client that
     can't render an iframe, rather than failing at call time). It does not filter by token
     scopes: a client can only attempt, and step up for, a tool it can see;
   - `tools/call` ([[call-tool]]) checks token scopes and re-checks both filters, validates
     arguments against the tool's Malli schema with teaching errors, dispatches to the handler
     under the already-bound current user, and logs every outcome through the shared usage path.

  The three call-time checks are not three boundaries. Scopes come from the verified token and the
  disabled-tools CSV from instance settings, but the extension set is reconstructed from the
  unsigned capability payload the client echoes back in its session id — a client can claim any
  extension it likes, and never has to `initialize` to do so. Treat `:required-extensions` as a
  client-declared hint that keeps a tool out of a list where it could not render, and put nothing
  behind it that the tool's `:scope` does not already protect."
  (:require
   [clojure.string :as str]
   [malli.error :as me]
   [metabase.ai-tracing.core :as ait]
   [metabase.api-scope.core :as api-scope]
   [metabase.api.common :as api]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.settings :as mcp.settings]
   [metabase.mcp.ui-resource :as mcp.ui-resource]
   [metabase.mcp.usage :as mcp.usage]
   [metabase.mcp.v2.common :as common]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
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
  ;; Only the extensions a client can actually advertise are gateable: an unknown keyword is never in
  ;; `ui-resource/supported-extensions`'s output, so the tool would be hidden from and refused to every
  ;; client forever, with no error to say why.
  (when (contains? tool :required-extensions)
    (let [exts (:required-extensions tool)]
      (when-not (and (set? exts) (every? keyword? exts))
        (throw (ex-info (format "v2 MCP tool %s :required-extensions must be a set of keywords" tool-name)
                        {:tool-name tool-name :required-extensions exts})))
      (when-let [unknown (seq (remove mcp.ui-resource/known-extensions exts))]
        (throw (ex-info (format "v2 MCP tool %s requires unknown client extension(s) %s — no client can satisfy them"
                                tool-name (vec unknown))
                        {:tool-name tool-name :unknown-extensions (vec unknown)})))))
  ;; Fail at load time (not first list) on a schema strict clients can't consume.
  (tools-manifest/assert-optional-fields-nullable! args tool-name)
  ;; The registry is keyed by public name, so a second definition claiming an existing name would
  ;; silently shadow the first, with load order deciding which one `tools/call` reaches. Compared by the
  ;; handler var's fully-qualified symbol, not by identity: reloading a tool namespace (REPL,
  ;; tools.namespace refresh) mints a fresh var for the same name, which an identity check would reject.
  (let [handler-sym (fn [h] (when (var? h) (symbol h)))]
    (when-let [existing (get @tools* tool-name)]
      (when-not (= (handler-sym (:handler existing)) (handler-sym handler))
        (throw (ex-info (format "v2 MCP tool %s is already registered by a different handler" tool-name)
                        {:tool-name tool-name})))))
  (swap! tools* assoc tool-name tool)
  ;; flush cache to allow for repl/test redefinition.
  (reset! manifest-cache nil)
  tool-name)

(defmacro deftool
  "Define and register a v2 MCP tool.

    (deftool echo
      \"Echo the message back.\"
      {:name        \"echo\"
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

(defn- with-required-permission
  "`description` followed by a sentence naming the permission `scope` requires. `scope-label` is the scope's
   consent-screen description, or nil when it has none."
  [description scope scope-label]
  (str description "\n\nRequires the "
       (if scope-label
         (str "\"" scope-label "\" permission (" scope ").")
         (str scope " permission."))))

(defn- tool->manifest-entry
  "The published manifest entry for `tool`; `scope-label` is as for [[with-required-permission]]."
  [{:keys [args annotations output-schema description scope] :as tool} scope-label]
  (cond-> (assoc tool
                 :description (with-required-permission description scope scope-label)
                 :inputSchema (-> args
                                  tools-manifest/malli->json-schema
                                  tools-manifest/strict-tool-input-schema)
                 :annotations (merge default-annotations annotations))
    ;; No strict transform on outputs — that rewrite exists to satisfy OpenAI's strict-tool rules
    ;; for arguments the model produces, and outputs aren't constrained by them.
    output-schema (assoc :outputSchema (tools-manifest/malli->json-schema output-schema))))

(defn- english-scope-label
  "The consent-screen description registered for `scope`, in English, or nil."
  [scope]
  ;; Model-facing, and the manifest is cached for every caller — never the locale of whoever listed tools first.
  (binding [i18n/*user-locale* "en"]
    (some-> (api-scope/scope-description scope) str)))

(defn- generate-manifest
  []
  (->> (vals @tools*)
       (sort-by :name)
       (mapv #(tool->manifest-entry % (english-scope-label (:scope %))))))

(defn- manifest
  "Cached manifest entries for all registered tools."
  []
  (or @manifest-cache
      (reset! manifest-cache (generate-manifest))))

(defn- disabled-tool-names
  []
  (set (mcp.settings/mcp-v2-disabled-tools)))

(defn list-tools
  "Return the tool definitions for the v2 MCP `tools/list` response, filtered by the
   `mcp-v2-disabled-tools` setting and the client extensions `options` advertises
   (`:supports-mcp-ui?` — MCP Apps tools are hidden from clients that can't render an iframe
   rather than failing at call time). Token scopes don't filter the list; [[call-tool]] enforces them.

   The 0-arity assumes full extension support: it backs [[tools-hash]], whose transport hook
   has no session, so the hash must not depend on per-session capabilities."
  ([]
   (list-tools {:supports-mcp-ui? true}))
  ([options]
   (let [disabled  (disabled-tool-names)
         supported (mcp.ui-resource/supported-extensions options)]
     (into []
           (comp
            ;; no disabled tools
            (filter #(not (contains? disabled (:name %))))
            ;; has all required extensions
            (filter #(empty? (mcp.ui-resource/missing-required-extensions % supported)))
            (map #(select-keys % [:name :title :description :inputSchema :outputSchema :annotations :_meta])))
           (manifest)))))

(defn tools-hash
  "Stable 8-character hex hash of the listed tools; polled by the GET/SSE keepalive to emit
   `notifications/tools/list_changed` when the set changes (`mcp-v2-disabled-tools` edits,
   feature flips). Hashes the JSON encoding of the wire-visible schema, so the result never
   depends on Clojure's `hash` of non-data leaves."
  []
  (format "%08x"
          (hash (->> (list-tools)
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

(defn- insufficient-scope-message
  "The scope-denial error text. Names the scope the tool requires and the ones the token holds — both are
   in hand here, and a message that names only the tool leaves the caller with nothing to act on, against
   the server's own `initialize` instructions promising that a failed call always names its fix.

   `required` is a scope string or a set of alternatives ([[metabase.mcp.scope/matches?]] accepts either);
   `token-scopes` may carry the `::api.scope/unrestricted` keyword alongside its strings, which is not a
   scope a caller can request, so only strings are listed back."
  [tool-name required token-scopes]
  (let [held  (sort (filter string? token-scopes))
        needs (if (set? required)
                (str "one of " (str/join ", " (sort required)))
                (str required))]
    (str "Insufficient scope to call tool: " tool-name ". Requires " needs "; "
         (if (seq held)
           (str "your token holds " (str/join ", " held) ".")
           "your token holds no scopes."))))

(defn- insufficient-scope
  "The `:insufficient-scope` detail of an error refusing `tool-name` for want of `required-scope`."
  [tool-name required-scope]
  {:required-scope required-scope
   :description    (str tool-name " requires " required-scope
                        (when-let [label (english-scope-label required-scope)]
                          (str " (" label ")")))})

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
      {:error {:code common/error-code-method-not-found :message (str "Unknown tool: " tool-name)}}

      (not (map? (or arguments {})))
      {:error {:code common/error-code-invalid-params :message "Invalid arguments: expected a JSON object."}}

      (not (mcp.scope/matches? token-scopes (:scope tool)))
      {:error {:code               common/error-code-invalid-request
               :message            (insufficient-scope-message tool-name (:scope tool) token-scopes)
               :insufficient-scope (insufficient-scope tool-name (:scope tool))}}

      ;; A UI tool the client can't render is a caller error, not a hidden tool: unlike the
      ;; scope/disabled cases it stays listed for capable clients, so name what's missing.
      (seq missing)
      {:error {:code common/error-code-invalid-params :message (mcp.ui-resource/missing-extensions-error tool-name missing)}}

      :else
      ;; Strict MCP clients (ChatGPT) send every declared property with `null` for the ones they
      ;; don't populate; stripping top-level nils at the boundary lets handlers treat missing and
      ;; null identically. Nested values are left alone.
      (let [arguments (u/remove-nils (or arguments {}))]
        (if-let [message (validation-error-message (:args tool) arguments)]
          {:error {:code common/error-code-invalid-params :message message}}
          (try
            {:result ((:handler tool)
                      arguments
                      {:session-id      session-id
                       :token-scopes    token-scopes
                       :client-info     (:client-info options)
                       :request-context (:request-context options)})}
            ;; Every failure is sanitized in one place: only deliberately caller-facing errors
            ;; surface their message; internal ones are logged and returned generically.
            (catch Exception e
              (if-let [required-scope (::common/required-scope (ex-data e))]
                {:error {:code               common/error-code-invalid-request
                         :message            (ex-message e)
                         :insufficient-scope (insufficient-scope tool-name required-scope)}}
                {:result (common/->mcp-error-content e)}))))))))

(defn call-tool
  "Dispatch a v2 MCP `tools/call`. Returns `{:error {:code ... :message ...}}` when the registry rejects the request before dispatch, or `{:result mcp-content}` after handler execution. Only an executed handler can produce an MCP result carrying `:isError`.

   A scope refusal is always an `:error`, whether the registry's own gate or the handler (by throwing with a `::common/required-scope` in its ex-data) refuses, and carries `:insufficient-scope {:required-scope ... :description ...}`.

   Every call is recorded to `mcp_tool_call_log` (EE-only, best-effort) with its timing, success/error status, and on error the JSON-RPC `error_code` + `error_message` (the latter gated/truncated by the writer)."
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
         (let [{:keys [error result] :as outcome}
               (dispatch-tool-call token-scopes session-id tool-name arguments options)
               result-error-code
               (::common/error-code result)]
           (if error
             (record! "error" (:code error) (:message error))
             (if (:isError result)
               (record! "error"
                        (or result-error-code common/error-code-internal)
                        (some-> result :content first :text))
               (record! "success" nil nil)))
           ;; `::common/error-code` is an internal classification marker — never expose it to the client.
           (if (contains? outcome :result)
             (let [result (dissoc result ::common/error-code)]
               ;; Trace the result WITHOUT the private MCP Apps block: it can carry a live UI credential, and a
               ;; trace outlives the credential's five-minute window. The client still gets the full result.
               (ait/record! {:ai/tool-output (common/redact-mcp-apps-meta result)})
               (assoc outcome :result result))
             outcome))
         (catch Throwable e
           ;; A handler that throws something the dispatch try doesn't convert would otherwise skip instrumentation
           ;; and under-report errors. Record the failure, then rethrow so the transport layer still surfaces it to
           ;; the client.
           (record! "error" common/error-code-internal (ex-message e))
           (throw e)))))))

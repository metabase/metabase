(ns metabase.metabot.defendpoint-bridge
  "Bridge from `defendpoint`-defined REST endpoints (annotated with `:tool` metadata)
  to the metabot agent loop.

  The bridge reads the same tools manifest the MCP server uses
  ([[metabase.api.macros.defendpoint.tools-manifest]]), converts each tool entry into
  a `{:tool-name … :doc … :schema … :fn …}` map shaped like the rest of the agent
  loop expects (see [[metabase.metabot.tools/wrap-tools-with-state]]), and synthesises
  Ring requests that dispatch directly to the originating namespace's handler.

  Three design choices worth flagging:

  - `:schema` here is a JSON Schema object (the manifest already produces JSON Schema
    2020-12), not a Malli `[:=> [:cat …] …]` form. The provider adapters detect this
    shape and pass it through to the LLM unchanged — see [[metabase.metabot.self.claude]]
    et al.
  - We dispatch via `api.macros/ns-handler`, not by going back through the top-level
    `+auth` middleware. The agent loop is already authenticated; round-tripping through
    auth would require fabricating session cookies.
  - When a tool entry declares `:fields` (a keyword allowlist on the underlying body
    schema), the bridge double-enforces it: the manifest narrows the LLM-visible
    inputSchema, and [[endpoint-tool-fn]] hard-filters incoming args by `inputSchema`
    keys before forwarding to the handler. Unintended fields can never reach the
    handler even under prompt injection.

  Cache-invalidation hints
  ------------------------
  Bridge tools call handlers in-process, bypassing the browser's HTTP path. That
  means RTK Query mutation lifecycles (which invalidate FE caches) never run for
  bridge writes. To keep the UI in sync, mutating tools attach `entity_changed`
  data parts to their results (see [[entity-changes-for-result]]); the FE handler
  in `metabase/metabot/state/actions.ts` consumes them to invalidate RTK tags
  and (if the QB is viewing the affected card) soft-reload the question."
  (:require
   [clojure.string :as str]
   [metabase.api-scope.core :as api-scope]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.config.core :as config]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.net URLEncoder)))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------------------------------------
;;; Manifest

(def ^:private bridged-namespace-prefixes
  "Map of `{namespace-symbol \"<route-prefix>\"}` whose endpoints we want to expose
  to the agent loop. The namespace-symbol must match the namespace mounted under the
  prefix in `metabase.api-routes.routes`. Namespaces that fail to `require` (e.g. EE
  namespaces on an OSS classpath) are silently skipped at manifest-build time."
  {'metabase.collections-rest.api  "/api/collection"
   'metabase.queries-rest.api.card "/api/card"
   'metabase-enterprise.content-verification.api.moderation-review
   "/api/moderation-review"})

(defn- generate-manifest []
  ;; Eagerly load the bridged namespaces so their `:api/endpoints` metadata is available
  ;; when the manifest is built. EE namespaces may not exist on the OSS classpath, so we
  ;; tolerate require failures and only feed successfully-loaded namespaces to the manifest.
  (let [loaded (into {}
                     (keep (fn [[ns-sym prefix]]
                             (try
                               (require ns-sym)
                               [ns-sym prefix]
                               (catch Throwable t
                                 (log/info t "Bridged namespace not available; skipping"
                                           {:ns ns-sym})
                                 nil))))
                     bridged-namespace-prefixes)]
    (tools-manifest/generate-tools-manifest loaded)))

(def ^:private manifest-delay
  (delay (generate-manifest)))

(defn- manifest
  "Tool manifest for bridge tools. Cached in prod, recomputed each call in dev."
  []
  (if config/is-dev?
    (generate-manifest)
    @manifest-delay))

(def ^:private optional-tool-names
  "Tool names whose backing namespace is OSS-vs-EE conditional, or which sit behind a
  premium feature. These names are always considered valid in profile registration
  so the OSS classpath doesn't reject EE-only tools at JVM start. At request time
  they are filtered out either by the namespace failing to load (on OSS) or by the
  per-tool `:feature` gate in [[endpoint-tools]]."
  #{"verify_card"})

(defn manifest-tool-names
  "Set of tool names registered in the bridge manifest, plus the names of tools that
  live in conditionally-loaded EE namespaces. Used by profile registration to validate
  that an `:endpoint-tools` entry refers to a real annotated endpoint without
  rejecting EE-only tools on an OSS classpath."
  []
  (into optional-tool-names
        (map :name)
        (:tools (manifest))))

;;; ----------------------------------------------------------------------------
;;; Path interpolation

(defn- interpolate-path
  "Replace `{param}` placeholders in `path` with values from `arguments`. Returns
  `[resolved-path remaining-args]` where path-param keys have been removed from
  `arguments`. Throws if a path placeholder has no corresponding argument."
  [path arguments]
  (let [params    (re-seq #"\{([^}]+)\}" path)
        resolved  (reduce (fn [p [placeholder k]]
                            (let [v (or (get arguments (keyword k))
                                        (get arguments k))]
                              (when (nil? v)
                                (throw (ex-info (str "Missing required path parameter: " k)
                                                {:agent-error? true
                                                 :parameter    k
                                                 :path         path})))
                              (str/replace p placeholder (URLEncoder/encode (str v) "UTF-8"))))
                          path
                          params)
        path-keys (into #{}
                        (mapcat (fn [[_ k]] [(keyword k) k]))
                        params)]
    [resolved (apply dissoc arguments path-keys)]))

;;; ----------------------------------------------------------------------------
;;; Dispatch

(defn- ns-handler-for
  "Resolve the underlying ns-handler for one of the bridged namespaces. The handler
  is looked up via [[api.macros/ns-handler]], which gives us the same handler used
  by the production route table — minus the `+auth` wrapper."
  [ns-sym]
  (require ns-sym)
  (api.macros/ns-handler (the-ns ns-sym)))

(defn- handler-for-tool
  "Find the namespace symbol whose prefix matches `tool-path`, then return its
  ns-handler. Memoised in prod so we resolve the handler only once. Skips entries
  whose namespace failed to load (so OSS builds can declare EE namespaces here
  without crashing)."
  [tool-path]
  (some (fn [[ns-sym prefix]]
          (when (and (str/starts-with? tool-path prefix)
                     (find-ns ns-sym))
            [ns-sym prefix (ns-handler-for ns-sym)]))
        ;; Sort by descending prefix length so a more-specific prefix wins over a
        ;; shorter one that happens to be a prefix-of-prefix. (Today none of our
        ;; bridged prefixes are nested, but the comparator is cheap insurance.)
        (sort-by (fn [[_ prefix]] (- (count prefix))) bridged-namespace-prefixes)))

(def ^:private memoised-handler-for-tool
  ;; Cache only in prod; in dev we want REPL-driven changes to defendpoints to take effect.
  (memoize handler-for-tool))

(defn- resolve-handler [tool-path]
  (if config/is-dev?
    (handler-for-tool tool-path)
    (memoised-handler-for-tool tool-path)))

(defn- ring-method [method-str]
  (keyword (u/lower-case-en method-str)))

(defn- invoke-handler
  "Synchronously invoke `handler` with a synthetic Ring request and return the
  response. Errors are caught and converted into `{:status _ :body _}` maps."
  [handler request]
  (let [result (promise)]
    (try
      (handler request
               (fn [response] (deliver result response))
               (fn [error]
                 (let [{:keys [status-code] :as data} (ex-data error)]
                   (deliver result {:status (or status-code 500)
                                    :body   (merge (select-keys data [:errors :specific-errors])
                                                   {:message (or (ex-message error) "Internal error")})}))))
      (catch Throwable t
        (deliver result {:status 500
                         :body   {:message (or (ex-message t) "Internal error")}})))
    (deref result 30000 {:status 504 :body {:message "Timeout"}})))

(defn- build-request
  "Build a synthetic Ring request that the namespace handler can route. The path
  passed in is the full `/api/<prefix>/...` path; we strip the prefix because the
  ns-handler routes relative paths."
  [method full-path prefix arguments]
  (let [relative-path (subs full-path (count prefix))
        path-or-root  (if (str/blank? relative-path) "/" relative-path)
        base          {:request-method method
                       :uri            full-path
                       :path-info      path-or-root}]
    (case method
      :post  (assoc base :body arguments)
      :put   (assoc base :body arguments)
      :patch (assoc base :body arguments)
      ;; GET / DELETE → query params; ring expects string keys here
      (assoc base :query-params (into {}
                                      (map (fn [[k v]] [(name k) v]))
                                      arguments)))))

;;; ----------------------------------------------------------------------------
;;; Result shaping

(defn- format-validation-detail
  "Mirror of [[metabase.mcp.tools/format-validation-detail]] kept private here so the
  bridge can produce humanised error strings without depending on the MCP module."
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
  [{:keys [status body]}]
  (let [body-map (when (map? body) body)
        body-str (when (and (string? body) (not (str/blank? body))) body)
        {msg :message :keys [specific-errors errors error]} body-map
        detail   (cond
                   (seq specific-errors) (format-validation-detail specific-errors)
                   (seq errors)          (format-validation-detail errors))]
    (cond
      (and msg detail) (str msg " (" detail ")")
      detail           detail
      msg              msg
      error            (if (string? error) error (pr-str error))
      body-str         body-str
      :else            (str "HTTP " (or status 500)))))

(def ^:private endpoint-tool-instructions
  "Per-tool follow-up instructions appended to the LLM-visible result. Kept here
  rather than on the defendpoint metadata so the endpoint stays HTTP-shaped, not
  LLM-shaped."
  {"list_collections"
   (str "Pick the smallest set of collections that match the user's request and "
        "propose them by name. Disambiguate by `location` if names collide. "
        "The current user can write to a collection iff `can_write` is true. "
        "Reference a collection with `[name](metabase://collection/{id})`.")

   "get_collection"
   (str "Reference the collection as `[name](metabase://collection/{id})`. "
        "If `can_write` is false, do not attempt to save cards into it.")

   "list_collection_items"
   (str "Reference items using their entity link, e.g. `[name](metabase://question/{id})` "
        "or `[name](metabase://dashboard/{id})`. Filter to specific `models` when the user "
        "asked about one entity type rather than dumping the entire list.")

   "create_collection"
   (str "The collection has been created. Reference it as "
        "`[name](metabase://collection/{id})`. If the user mentioned cards to put in "
        "the collection, call `save_card` next with this `collection_id`.")

   "update_collection"
   (str "Updated `[name](metabase://collection/{id})`. If the user wanted to move the "
        "collection to a different parent, call `move_collection` next. Marking a "
        "collection Official is visible to all users in the org — do not apply it silently.")

   "move_collection"
   (str "Collection moved. Reference the new location as "
        "`[name](metabase://collection/{id})`. Sub-collections move with it; mention "
        "this if the user might be surprised.")

   "update_card"
   (str "Updated `[name](metabase://question/{id})`. The change took effect "
        "immediately; the user does not need to refresh.")

   "move_card"
   (str "Moved `[name](metabase://question/{id})` to "
        "`[collection](metabase://collection/{collection_id})`. The previous "
        "collection no longer contains this card.")

   "archive_card"
   (str "If `archived: true` was passed, the card is now in the Trash and is hidden "
        "from collection listings; tell the user it can be restored from the Trash UI "
        "or by asking you to restore it. If `archived: false` was passed, the card "
        "has been restored to its original collection. Reference it as "
        "`[name](metabase://question/{id})`.")

   "copy_card"
   (str "Duplicated the original. Reference the new card as "
        "`[name](metabase://question/{id})` (it lands in `[collection]"
        "(metabase://collection/{collection_id})`). If the user wanted a different "
        "name, follow up with `update_card`. If they wanted a different collection, "
        "follow up with `move_card`.")

   "verify_card"
   (str "Marked `[name](metabase://question/{id})` as verified (or removed verification). "
        "The verified badge will appear in search results and on the item's detail page "
        "after the next search-index refresh.")

   "archive_collection"
   (str "If `archived: true` was passed, the collection and its descendants are now "
        "in the Trash. If `archived: false`, the collection has been restored. "
        "Reference it as `[name](metabase://collection/{id})`.")})

(defn- json-encode-body [body]
  (try
    (json/encode body)
    (catch Throwable _ (pr-str body))))

;;; ----------------------------------------------------------------------------
;;; Cache-invalidation hints
;;
;; The functions in this section produce `entity_changed` data parts that the FE
;; consumes to invalidate stale caches. The shape of the data-part value is:
;;
;;   {:entity_type   "card"|"collection"|"dashboard"
;;    :id            <primary id>
;;    :collection_id <optional, for cards>
;;    :parent_id     <optional, for collections>}
;;
;; The keys are intentionally snake_case — they cross the wire as JSON to the FE.

(defn- card-changed-parts [body]
  (when-let [id (:id body)]
    [(streaming/entity-changed-part
      (cond-> {:entity_type "card" :id id}
        ;; Always include :collection_id (even if `nil`) so the FE knows to
        ;; invalidate `idTag("collection", "root")` for moves to root.
        (contains? body :collection_id) (assoc :collection_id (:collection_id body))))]))

(defn- collection-changed-parts [body]
  (when-let [id (:id body)]
    [(streaming/entity-changed-part
      (cond-> {:entity_type "collection" :id id}
        (contains? body :parent_id) (assoc :parent_id (:parent_id body))))]))

(defn- moderation-changed-parts
  "verify_card targets a card or a dashboard via `:moderated_item_type`. Map to
  the FE's entity-type vocabulary so the right cache tags get invalidated."
  [body]
  (when-let [id (:moderated_item_id body)]
    (let [item-type (some-> (:moderated_item_type body) name)
          entity    (case item-type
                      "card"      "card"
                      "dashboard" "dashboard"
                      ;; Fall back to "card" — verify_card historically targets cards.
                      "card")]
      [(streaming/entity-changed-part {:entity_type entity :id id})])))

(def ^:private entity-change-fns
  "Per-tool: function `body → [data-parts]` for cache-invalidation hints. Read-only
  tools have no entry; nothing extra is attached to their results."
  {"update_card"         card-changed-parts
   "move_card"           card-changed-parts
   "archive_card"        card-changed-parts
   "copy_card"           card-changed-parts
   "verify_card"         moderation-changed-parts
   "create_collection"   collection-changed-parts
   "update_collection"   collection-changed-parts
   "move_collection"     collection-changed-parts
   "archive_collection"  collection-changed-parts})

(defn- entity-changes-for-result
  "Compute cache-invalidation data parts for a 2xx tool response, or `nil`."
  [tool-name body]
  (when-let [f (get entity-change-fns tool-name)]
    (when (map? body)
      (try
        (seq (f body))
        (catch Throwable t
          ;; Never let a hint-construction bug break a successful tool call.
          (log/warn t "Failed to compute entity-changed parts" {:tool tool-name})
          nil)))))

(defn- shape-success
  "Convert a 2xx HTTP response into a metabot tool result map."
  [tool-name body]
  (let [data-parts (entity-changes-for-result tool-name body)]
    (cond-> {:output            (str "Result from `" tool-name "`:\n" (json-encode-body body))
             :structured-output body}
      (contains? endpoint-tool-instructions tool-name)
      (assoc :instructions (get endpoint-tool-instructions tool-name))

      data-parts
      (assoc :data-parts (vec data-parts)))))

(defn- shape-error
  "Convert a non-2xx HTTP response into a metabot tool result map."
  [tool-name response]
  {:output (str "Error from `" tool-name "`: " (extract-error-message response))})

(defn- shape-result
  [tool-name {:keys [status] :as response}]
  (if (and (integer? status) (<= 200 status 299))
    (shape-success tool-name (:body response))
    (shape-error   tool-name response)))

;;; ----------------------------------------------------------------------------
;;; Tool function

(defn- inputschema-allowed-keys
  "Return the set of keyword keys the LLM is permitted to send for this tool, or nil
  if the schema doesn't enumerate properties (e.g. raw `:or`-shaped bodies)."
  [inputSchema]
  (some-> inputSchema :properties keys (->> (map keyword) set)))

(defn- filter-arguments
  "Hard-filter LLM-supplied arguments to the keys exposed in `inputSchema`. This is
  defence-in-depth on top of the manifest's narrowed schema — even a misbehaving
  model or prompt-injected argument map can never thread a forbidden key through
  to the underlying handler. When `allowed-keys` is nil (no schema constraint),
  arguments pass through unchanged."
  [allowed-keys arguments]
  (let [args (or arguments {})]
    (if (nil? allowed-keys)
      args
      (into {}
            (filter (fn [[k _v]]
                      (contains? allowed-keys
                                 (if (keyword? k) k (keyword (str k))))))
            args))))

(defn- endpoint-tool-fn
  "Build the `:fn` value for a defendpoint-backed tool from its manifest entry."
  [{:keys [name endpoint inputSchema]}]
  (let [{:keys [method path]} endpoint
        ring-method-kw         (ring-method method)
        allowed-keys           (inputschema-allowed-keys inputSchema)]
    (fn [arguments]
      (try
        (let [filtered                     (filter-arguments allowed-keys arguments)
              [resolved-path remaining]    (interpolate-path path filtered)
              [_ns-sym prefix handler]     (resolve-handler resolved-path)]
          (when-not handler
            (throw (ex-info (str "No bridged namespace handles path: " resolved-path)
                            {:agent-error? true :path resolved-path})))
          (let [request  (build-request ring-method-kw resolved-path prefix remaining)
                response (invoke-handler handler request)]
            (shape-result name response)))
        (catch Throwable t
          (log/warn t "Bridge tool failure" {:tool name})
          {:output (str "Error from `" name "`: " (or (ex-message t) "Unknown error"))})))))

;;; ----------------------------------------------------------------------------
;;; Public API

(defn- manifest-entry->tool-def
  "Convert a manifest entry into the `{:tool-name … :doc … :schema … :fn … :scope …}`
  shape the agent loop expects."
  [{:keys [name description inputSchema scope] :as entry}]
  (cond-> {:tool-name name
           :doc       description
           :schema    (or inputSchema {:type "object" :properties {}})
           :fn        (endpoint-tool-fn entry)}
    scope (assoc :scope scope)))

(defn- feature-available?
  "True if `feature` is nil (no gate) or the running instance has the premium feature."
  [feature]
  (or (nil? feature)
      (premium-features/has-feature? feature)))

(defn endpoint-tools
  "Return a `{tool-name → tool-def}` map suitable for merging into the agent loop's
  tool registry. Tools whose `:scope` is not satisfied by the current
  [[scope/*current-user-scope*]] binding, or whose `:feature` is not active for
  the running instance, are filtered out."
  ([]
   (endpoint-tools (manifest-tool-names)))
  ([allowed-names]
   (let [allowed (set allowed-names)
         entries (filter #(contains? allowed (:name %)) (:tools (manifest)))]
     (into {}
           (comp (filter (fn [{:keys [scope feature]}]
                           (and (or (nil? scope)
                                    (api-scope/scope-matches? scope/*current-user-scope* scope))
                                (feature-available? feature))))
                 (map (juxt :name manifest-entry->tool-def)))
           entries))))

(defn endpoint-tools-for-profile
  "Resolve the bridge tools listed under `:endpoint-tools` on a profile, applying
  scope filtering. Returns a `{tool-name → tool-def}` map."
  [profile]
  (when-let [names (seq (:endpoint-tools profile))]
    (endpoint-tools names)))

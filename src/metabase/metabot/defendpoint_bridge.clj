(ns metabase.metabot.defendpoint-bridge
  "Bridge from `defendpoint`-defined REST endpoints (annotated with `:tool` metadata)
  to the metabot agent loop.

  The bridge reads the same tools manifest the MCP server uses
  ([[metabase.api.macros.defendpoint.tools-manifest]]), converts each tool entry into
  a `{:tool-name … :doc … :schema … :fn …}` map shaped like the rest of the agent
  loop expects (see [[metabase.metabot.tools/wrap-tools-with-state]]), and synthesises
  Ring requests that dispatch directly to the originating namespace's handler.

  Two design choices worth flagging:

  - `:schema` here is a JSON Schema object (the manifest already produces JSON Schema
    2020-12), not a Malli `[:=> [:cat …] …]` form. The provider adapters detect this
    shape and pass it through to the LLM unchanged — see [[metabase.metabot.self.claude]]
    et al.
  - We dispatch via `api.macros/ns-handler`, not by going back through the top-level
    `+auth` middleware. The agent loop is already authenticated; round-tripping through
    auth would require fabricating session cookies."
  (:require
   [clojure.string :as str]
   [metabase.api-scope.core :as api-scope]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.config.core :as config]
   [metabase.metabot.scope :as scope]
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
  prefix in `metabase.api-routes.routes`."
  {'metabase.collections-rest.api "/api/collection"})

(defn- generate-manifest []
  ;; Eagerly load the bridged namespaces so their `:api/endpoints` metadata is available
  ;; when the manifest is built. Otherwise profile registration (which forces this delay)
  ;; can fire before `metabase.api-routes.routes` has loaded the endpoint namespace and
  ;; we'd see an empty manifest.
  (doseq [ns-sym (keys bridged-namespace-prefixes)]
    (require ns-sym))
  (tools-manifest/generate-tools-manifest bridged-namespace-prefixes))

(def ^:private manifest-delay
  (delay (generate-manifest)))

(defn- manifest
  "Tool manifest for bridge tools. Cached in prod, recomputed each call in dev."
  []
  (if config/is-dev?
    (generate-manifest)
    @manifest-delay))

(defn manifest-tool-names
  "Set of tool names registered in the bridge manifest. Used by profile registration
  to validate that an `:endpoint-tools` entry refers to a real annotated endpoint."
  []
  (set (map :name (:tools (manifest)))))

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
  ns-handler. Memoised in prod so we resolve the handler only once."
  [tool-path]
  (some (fn [[ns-sym prefix]]
          (when (str/starts-with? tool-path prefix)
            [ns-sym prefix (ns-handler-for ns-sym)]))
        bridged-namespace-prefixes))

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
        "the collection, call `save_card` next with this `collection_id`.")})

(defn- json-encode-body [body]
  (try
    (json/encode body)
    (catch Throwable _ (pr-str body))))

(defn- shape-success
  "Convert a 2xx HTTP response into a metabot tool result map."
  [tool-name body]
  (cond-> {:output            (str "Result from `" tool-name "`:\n" (json-encode-body body))
           :structured-output body}
    (contains? endpoint-tool-instructions tool-name)
    (assoc :instructions (get endpoint-tool-instructions tool-name))))

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

(defn- endpoint-tool-fn
  "Build the `:fn` value for a defendpoint-backed tool from its manifest entry."
  [{:keys [name endpoint]}]
  (let [{:keys [method path]} endpoint
        ring-method-kw         (ring-method method)]
    (fn [arguments]
      (try
        (let [[resolved-path remaining]   (interpolate-path path (or arguments {}))
              [_ns-sym prefix handler]    (resolve-handler resolved-path)]
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

(defn endpoint-tools
  "Return a `{tool-name → tool-def}` map suitable for merging into the agent loop's
  tool registry. Tools whose `:scope` is not satisfied by the current
  [[scope/*current-user-scope*]] binding are filtered out."
  ([]
   (endpoint-tools (manifest-tool-names)))
  ([allowed-names]
   (let [allowed (set allowed-names)
         entries (filter #(contains? allowed (:name %)) (:tools (manifest)))]
     (into {}
           (comp (filter (fn [{:keys [scope]}]
                           (or (nil? scope)
                               (api-scope/scope-matches? scope/*current-user-scope* scope))))
                 (map (juxt :name manifest-entry->tool-def)))
           entries))))

(defn endpoint-tools-for-profile
  "Resolve the bridge tools listed under `:endpoint-tools` on a profile, applying
  scope filtering. Returns a `{tool-name → tool-def}` map."
  [profile]
  (when-let [names (seq (:endpoint-tools profile))]
    (endpoint-tools names)))

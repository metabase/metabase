(ns metabase.mcp.resources
  "MCP resource registry. Resources let clients fetch supplementary content (docs,
   reference material) by URI without inflating tool descriptions.

   Each entry in the registry is a map with `:uri`, `:name`, `:description`,
   `:mimeType`, an optional `:scope`, and a `:render-fn` that returns the textual
   payload. `:scope` mirrors the scope semantics used by tools — nil means \"public\"
   (any authenticated caller), a string is an MCP scope checked via
   [[metabase.mcp.scope/matches?]]."
  (:require
   [clojure.java.io :as io]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;; Single map keyed by URI; `register-resource!` overwrites so REPL reload is idempotent.
(defonce ^:private registry (atom (sorted-map)))

(mu/defn register-resource!
  "Register an MCP resource. Overwrites any existing entry with the same `:uri`."
  [resource :- [:map
                [:uri :string]
                [:name :string]
                [:description :string]
                [:render-fn fn?]
                [:mimeType {:optional true} :string]
                [:scope    {:optional true} [:maybe :string]]]]
  (let [resource (update resource :mimeType #(or % "text/markdown"))]
    (swap! registry assoc (:uri resource) resource)
    resource))

(defn- accessible?
  "True when a resource with `scope` is visible to a caller with `token-scopes`.
   Resources without a scope are public; otherwise scope matching is the same as for
   tools."
  [scope token-scopes]
  (or (nil? scope)
      (mcp.scope/matches? token-scopes scope)))

(defn list-resources
  "Return the MCP `resources/list` payload, filtered by `token-scopes`."
  [token-scopes]
  {:resources (into []
                    (comp (filter #(accessible? (:scope %) token-scopes))
                          (map #(select-keys % [:uri :name :description :mimeType])))
                    (vals @registry))})

(defn check-resource-access
  "Return `:ok`, `:not-found`, or `:scope-denied` for `uri` under `token-scopes`.
   Callers should use this to distinguish missing from forbidden — `read-resource`
   collapses both to nil."
  [uri token-scopes]
  (if-let [{:keys [scope]} (get @registry uri)]
    (if (accessible? scope token-scopes)
      :ok
      :scope-denied)
    :not-found))

(defn read-resource
  "Read a registered resource by URI. Returns nil for unknown or inaccessible URIs;
   callers wanting to distinguish those cases should call [[check-resource-access]]
   first."
  [uri opts]
  (when-let [{:keys [render-fn] :as resource} (get @registry uri)]
    {:contents [(-> (select-keys resource [:uri :mimeType])
                    (assoc :text (render-fn opts)))]}))

;;; -------------------------------------------------- Helpers ----------------------------------------------------

(defn classpath-text-resource
  "Build a `:render-fn` that returns the contents of `path` on the classpath.
   Throws on registration if the file is missing — surfaces a clear error at boot
   rather than the first `resources/read` call."
  [path]
  (let [url (io/resource path)]
    (when-not url
      (throw (ex-info (str "Missing classpath resource: " path) {:path path})))
    (let [content (delay (slurp url))]
      (fn [_opts] @content))))

;;; ------------------------------------------------ Registrations ------------------------------------------------

(register-resource!
 {:uri         "metabase://docs/construct-query.md"
  :name        "Construct Query Reference"
  :description (str "Program syntax for `construct_query` and `query`: source shapes "
                    "(table/card/dataset/metric), top-level operations (filter, aggregate, "
                    "breakout, expression, with-fields, order-by, limit, join, append-stage, "
                    "with-page), reference forms, filter/aggregation/temporal operator "
                    "vocabularies, worked examples, and common pitfalls (stage boundaries, "
                    "ref shapes, joins, metric/date handling).")
  :mimeType    "text/markdown"
  :render-fn   (classpath-text-resource "metabase/agent_api/construct_query.md")})

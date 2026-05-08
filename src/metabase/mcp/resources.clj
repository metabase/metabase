(ns metabase.mcp.resources
  "MCP resource registry. Resources let clients fetch supplementary content (docs,
   reference material) by URI without inflating tool descriptions.

   Each entry in the registry is a map with `:uri`, `:name`, `:description`,
   `:mimeType`, an optional `:scope`, and a `:render-fn` that returns the textual
   payload. For resources, `:scope` uses [[metabase.mcp.scope/public-or-matches?]]:
   nil means \"public\" (any authenticated caller), and a string is an MCP scope
   checked against the token scopes. This intentionally differs from tools, where
   nil scope is treated as internal-only."
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

(defn list-resources
  "Return the MCP `resources/list` payload, filtered by `token-scopes`."
  [token-scopes]
  {:resources (into []
                    (comp (filter #(mcp.scope/public-or-matches? token-scopes (:scope %)))
                          (map #(select-keys % [:uri :name :description :mimeType])))
                    (vals @registry))})

(defn read-resource
  "Read a registered resource by URI, gated by `token-scopes`. Returns one of
   `{:status :ok :contents [...]}`, `{:status :scope-denied}`, or
   `{:status :not-found}`. Single registry lookup keeps the gate atomic with the
   render — no race window where the registry could change between an access
   check and the read, and no way for direct callers to bypass the scope check."
  [uri token-scopes opts]
  (if-let [{:keys [render-fn scope] :as resource} (get @registry uri)]
    (if (mcp.scope/public-or-matches? token-scopes scope)
      {:status   :ok
       :contents [(-> (select-keys resource [:uri :mimeType])
                      (assoc :text (render-fn opts)))]}
      {:status :scope-denied})
    {:status :not-found}))

;;; -------------------------------------------------- Helpers ----------------------------------------------------

(defn classpath-text-resource
  "Build a `:render-fn` that returns the contents of `path` on the classpath.
   Throws on registration if the file is missing — surfaces a clear error at boot
   rather than the first `resources/read` call."
  [path]
  (let [url (io/resource path)]
    (when-not url
      (throw (ex-info (str "Missing classpath resource: " path) {:path path})))
    (let [content (delay (slurp url :encoding "UTF-8"))]
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

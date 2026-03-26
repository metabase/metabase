(ns metabase.mcp.resources
  "MCP resource registry. Resources let clients fetch supplementary content (docs,
   reference material) and UI resources by URI without inflating tool descriptions.

   Each entry in the registry is a map with `:uri`, `:name`, `:description`,
   `:mimeType`, an optional `:scope`, and a `:render-fn` that returns the textual
   payload. For resources, `:scope` uses [[metabase.mcp.scope/public-or-matches?]]:
   nil means \"public\" (any authenticated caller), and a string is an MCP scope
   checked against the token scopes. This intentionally differs from tools, where
   nil scope is treated as internal-only."
  (:require
   [clojure.java.io :as io]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.system.core :as system]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [stencil.core :as stencil]))

(set! *warn-on-reflection* true)

(defonce ^:private registry
  (atom {:key->uri      {}
         :uri->resource (sorted-map)
         :uri->tool     (sorted-map)}))

(defn- ui-csp-meta []
  (let [url (system/site-url)]
    {:ui {:csp {:connectDomains  [url]
                :resourceDomains [url]
                :frameDomains    [url]}}}))

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
    (swap! registry assoc-in [:uri->resource (:uri resource)] resource)
    resource))

(mu/defn- register-ui-resource!
  [key      :- :keyword
   uri      :- :string
   scope    :- :string
   resource :- [:map
                [:name :string]
                [:description :string]
                [:render-fn fn?]]]
  (let [resource (-> (assoc resource :uri uri :scope scope :ui? true)
                     (update :mimeType #(or % "text/html;profile=mcp-app")))]
    (swap! registry #(-> %
                         (assoc-in [:key->uri key] uri)
                         (assoc-in [:uri->resource uri] resource)))
    resource))

(mu/defn- register-ui-tool!
  [resource-key :- :keyword
   tool         :- [:map
                    [:name :string]
                    [:description :string]
                    [:inputSchema :map]
                    [:response-fn fn?]]]
  (if-let [uri (get-in @registry [:key->uri resource-key])]
    (let [scope (get-in @registry [:uri->resource uri :scope])
          tool  (assoc tool :scope scope :_meta {:ui {:resourceUri uri}})]
      (swap! registry assoc-in [:uri->tool uri] tool)
      tool)
    (throw (ex-info "Unknown resource" {:resource-key resource-key}))))

(defn list-ui-tools
  "Return the list of MCP tools corresponding to UI components."
  []
  (vals (:uri->tool @registry)))

(defn list-resources
  "Return the MCP `resources/list` payload, filtered by `token-scopes`."
  [token-scopes]
  {:resources (into []
                    (comp (filter #(mcp.scope/public-or-matches? token-scopes (:scope %)))
                          (map (fn [resource]
                                 (cond-> (select-keys resource [:uri :name :description :mimeType])
                                   (:ui? resource) (assoc :_meta (ui-csp-meta))))))
                    (vals (:uri->resource @registry)))})

(defn check-resource-access
  "Check whether `uri` exists and is accessible under `token-scopes`.
   Returns :ok, :not-found, or :scope-denied."
  [uri token-scopes]
  (if-let [{:keys [scope]} (get-in @registry [:uri->resource uri])]
    (if (mcp.scope/public-or-matches? token-scopes scope)
      :ok
      :scope-denied)
    :not-found))

(defn read-resource
  "Read a registered resource by URI, gated by `token-scopes`. Returns one of
   `{:status :ok :contents [...]}`, `{:status :scope-denied}`, or
   `{:status :not-found}`. Single registry lookup keeps the gate atomic with the
   render, so callers cannot bypass the scope check."
  [uri token-scopes opts]
  (if-let [{:keys [render-fn scope ui?] :as resource} (get-in @registry [:uri->resource uri])]
    (if (mcp.scope/public-or-matches? token-scopes scope)
      {:status   :ok
       :contents [(cond-> (select-keys resource [:uri :mimeType])
                    true (assoc :text (render-fn opts))
                    ui?  (assoc :_meta (ui-csp-meta)))]}
      {:status :scope-denied})
    {:status :not-found}))

;;; -------------------------------------------------- Helpers ----------------------------------------------------

(defn classpath-text-resource
  "Build a `:render-fn` that returns the contents of `path` on the classpath.
   Throws on registration if the file is missing, surfacing a clear error at boot
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

(register-ui-resource!
 :visualize-query
 "ui://metabase/visualize-query.html"
 "agent:visualize"
 {:name        "Visualize Query"
  :description "Interactive Metabase SDK visualization for a query"
  :render-fn   (fn [opts]
                 (let [site-url    (system/site-url)
                       session-key (:session-key opts)]
                   (stencil/render-file
                    "frontend_client/embed-mcp.html"
                    {:instanceUrl    (json/encode site-url)
                     :instanceUrlRaw site-url
                     :sessionToken   (when session-key (json/encode session-key))})))})

(register-ui-tool!
 :visualize-query
 {:name        "visualize_query"
  :description "Visualize a previously constructed query as an interactive chart or table."
  :inputSchema {:type       "object"
                :properties {:query {:type "string" :minLength 1}}
                :required   ["query"]}
  :response-fn (fn [arguments]
                 {:content           [{:type "text" :text "Visualizing query..."}]
                  :structuredContent {:query (:query arguments)}})})

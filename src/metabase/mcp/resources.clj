(ns metabase.mcp.resources
  "MCP resource handlers. Provides the visualize-query HTML resource
   that renders interactive Metabase visualizations via the Embedding SDK."
  (:require
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

(mu/defn- register-ui-resource!
  [key      :- :keyword
   uri      :- :string
   scope    :- :string
   resource :- [:map
                [:name :string]
                [:description :string]
                [:render-fn fn?]]]
  (let [resource (-> (assoc resource :uri uri :scope scope)
                     (update :mimeType #(or % "text/html;profile=mcp-app")))]
    (swap! registry #(-> %
                         (assoc-in [:key->uri key] uri)
                         (assoc-in [:uri->resource uri] resource)))))

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
      (swap! registry assoc-in [:uri->tool uri] tool))
    (throw (ex-info "Unknown resource" {:resource-key resource-key}))))

(defn list-ui-tools
  "Return the list of MCP tools corresponding to UI components"
  []
  (vals (:uri->tool @registry)))

(defn list-resources
  "Return the list of available MCP resources.
   Only resources whose scope matches `token-scopes` are included."
  [token-scopes]
  {:resources (for [resource (vals (:uri->resource @registry))
                    :when (mcp.scope/matches? token-scopes (:scope resource))]
                (-> (select-keys resource [:uri :name :description :mimeType])
                    (assoc :_meta {:ui {:csp (let [url (system/site-url)]
                                               {:connectDomains  [url]
                                                :resourceDomains [url]
                                                :frameDomains    [url]})}})))})

(defn check-resource-access
  "Check whether `uri` exists and is accessible under `token-scopes`.
   Returns :ok, :not-found, or :scope-denied."
  [uri token-scopes]
  (if-let [{:keys [scope]} (get-in @registry [:uri->resource uri])]
    (if (mcp.scope/matches? token-scopes scope)
      :ok
      :scope-denied)
    :not-found))

(defn read-resource
  "Read an MCP resource by URI. The caller should use [[check-resource-access]] first
   to distinguish not-found from scope-denied; this function returns nil for both."
  [uri opts]
  (when-let [{:keys [render-fn] :as resource} (get-in @registry [:uri->resource uri])]
    (let [url (system/site-url)]
      {:contents [(-> (select-keys resource [:uri :mimeType])
                      (assoc :text (render-fn opts)
                             :_meta {:ui {:csp {:connectDomains  [url]
                                                :resourceDomains [url]
                                                :frameDomains    [url]}}}))]})))

;;; registrations

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
                 {:content          [{:type "text" :text "Visualizing query..."}]
                  :structuredContent {:query (:query arguments)}})})

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
   [metabase.mcp.session :as mcp.session]
   [metabase.system.core :as system]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [stencil.core :as stencil]))

(set! *warn-on-reflection* true)

(def ^:private embed-mcp-template-path "frontend_client/embed-mcp.html")

;; The built template is emitted by HtmlWebpackPlugin into resources/frontend_client/
;; during the frontend build. Backend-only test runs (e.g. CI app-db tests) don't produce
;; it, so tests install a minimal inline template via `with-fallback-template`.
(def ^:private test-fallback-template
  (str "<!doctype html><html><body><script>"
       "window.metabaseConfig = {"
       "instanceUrl: {{{instanceUrl}}},"
       "sessionToken: {{{sessionToken}}}"
       "};</script></body></html>"))

;; An atom rather than a dynamic var because `resources/read` is invoked from the
;; HTTP handler thread, which doesn't inherit thread-local bindings from the test
;; thread that installs the fallback.
(defonce ^:private fallback-template (atom nil))

(defn do-with-fallback-template
  "Implementation detail of [[with-fallback-template]]."
  [thunk]
  (try
    (reset! fallback-template test-fallback-template)
    (thunk)
    (finally
      (reset! fallback-template nil))))

(defmacro with-fallback-template
  "Test-only: install an inline Mustache fallback for the embed-mcp template for
   the duration of `body`. Backend-only test runs don't produce the built template,
   so tests that exercise `resources/read` need this."
  [& body]
  `(do-with-fallback-template (fn [] ~@body)))

(defn render-embed-mcp-template
  "Render the embed-mcp.html Mustache template with the given vars map.
   Expected keys: :instanceUrl (JSON-encoded), :instanceUrlRaw, :sessionToken (JSON-encoded or nil),
   :mcpSessionId (JSON-encoded or nil)."
  [vars]
  (cond
    (io/resource embed-mcp-template-path)
    (stencil/render-file embed-mcp-template-path vars)

    @fallback-template
    (stencil/render-string @fallback-template vars)

    :else
    (throw (ex-info (str "Missing MCP embed template: " embed-mcp-template-path
                         ". Run the frontend build to produce it.")
                    {:path embed-mcp-template-path}))))

;; The registry holds two indexes:
;;   `:uri->resource` — URI is unique, one resource (iframe) per URI
;;   `:tools`         — keyed by tool name, which is also unique. Multiple tools may
;;                      target the same resource via :_meta.ui.resourceUri (the iframe
;;                      doesn't care which tool delivered the payload).
;; Both maps overwrite on re-registration so REPL reload is idempotent.
(defonce ^:private registry
  (atom {:key->uri      {}
         :uri->resource (sorted-map)
         :tools         (sorted-map)}))

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
      (swap! registry assoc-in [:tools (:name tool)] tool)
      tool)
    (throw (ex-info "Unknown resource" {:resource-key resource-key}))))

(defn resource-scopes
  "Return the distinct set of scopes registered across all UI resources."
  []
  (into (sorted-set) (keep :scope) (vals (:uri->resource @registry))))

(defn list-ui-tools
  "Return the list of MCP tools corresponding to UI components."
  []
  (vals (:tools @registry)))

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
                       session-key (:session-key opts)
                       session-id  (:session-id opts)]
                   (render-embed-mcp-template
                    {:instanceUrl    (json/encode site-url)
                     :instanceUrlRaw site-url
                     :sessionToken   (when session-key (json/encode session-key))
                     :mcpSessionId   (when session-id (json/encode session-id))})))})

(register-ui-tool!
 :visualize-query
 {:name        "visualize_query"
  :description (str "Visualize a previously constructed query as an interactive chart or table. "
                    "Use this for prompts that ask to show, display, visualize, plot, chart, "
                    "or present results, for example: `Show me customers in Metabase`, "
                    "`Show me orders by month`, `Display revenue by region`, or "
                    "`Visualize active users over time`. This renders the final answer in the UI. "
                    "Do not call execute_query after visualize_query; showing the visualization "
                    "is enough.")
  ;; Both fields are optional rather than expressing "at least one of" via a top-level `anyOf`.
  ;; This is because some MCP clients, e.g. the MCP inspector (mcpjam) rejects top-level combinators.
  ;; The response-fn enforces the at-least-one contract at runtime.
  :inputSchema {:type       "object"
                :properties {:query        {:type "string" :minLength 1
                                            :description "Base64-encoded MBQL query (use query_handle instead when available)"}
                             :query_handle {:type "string" :format "uuid"
                                            :description "Handle returned by construct_query; preferred over raw query"}}}
  :response-fn (fn [arguments {:keys [session-id]}]
                 (let [query   (:query arguments)
                       handle  (:query_handle arguments)
                       resolved (some->> handle (mcp.session/resolve-query-handle session-id))
                       encoded (or query (:encoded_query resolved))
                       prompt  (:prompt resolved)]
                   (cond
                     (and (nil? query) (nil? handle))
                     {:content [{:type "text" :text "Provide either 'query' or 'query_handle'."}]
                      :isError true}

                     encoded
                     {:content           [{:type "text" :text (str "Visualizing query in the interactive UI. "
                                                                   "Do not call execute_query after this; "
                                                                   "the visualization is the final result.")}]
                      ;; If visualize_query was called with a handle, use the stored prompt so the iframe can
                      ;; include the user's original request when submitting visualization feedback.
                      :structuredContent (cond-> {:query encoded}
                                           prompt (assoc :prompt prompt))}

                     :else
                     {:content [{:type "text" :text "Query handle not found. Try running construct_query again."}]
                      :isError true})))})

(register-ui-tool!
 :visualize-query
 {:name        "render_drill_through"
  :description (str "Render the drill-through visualization the user just navigated into. "
                    "Use this tool, not execute_query, when the user asks to show the result and "
                    "their message includes a `handle` UUID. This is the exact follow-up for the "
                    "phrase `Show me the result`. Do not execute the query yourself; pass the "
                    "`handle` UUID as the `handle` argument.")
  :inputSchema {:type       "object"
                :properties {:handle {:type "string" :format "uuid"
                                      :description "Handle UUID from the user's drill-through message."}}
                :required   ["handle"]}
  :response-fn (fn [arguments {:keys [session-id]}]
                 (if-let [handle (:handle arguments)]
                   (if-let [encoded (mcp.session/read-handle session-id handle)]
                     {:content          [{:type "text" :text "Rendering drill-through visualization..."}]
                      :structuredContent {:query encoded}}
                     {:content [{:type "text" :text "No drill-through found for that handle."}]
                      :isError true})
                   {:content [{:type "text" :text "No drill-through found for that handle."}]
                    :isError true}))})

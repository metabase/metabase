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
   [metabase.api.common :as api]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.ui-resource :as mcp.ui-resource]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

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
                [:render-fn fn?]
                [:prefersBorder {:optional true} :boolean]]]
  (let [resource (-> (assoc resource :uri uri :scope scope :ui? true)
                     (update :mimeType #(or % "text/html;profile=mcp-app")))]
    (swap! registry #(-> %
                         (assoc-in [:key->uri key] uri)
                         (assoc-in [:uri->resource uri] resource)))
    resource))

(defn- malli->ui-input-schema
  "Convert a Malli schema for a UI-tool input into the published JSON Schema."
  [schema]
  (-> schema tools-manifest/malli->json-schema tools-manifest/strict-tool-input-schema))

(defn- malli->ui-output-schema
  "Convert a Malli schema for a UI-tool output into the published JSON Schema.
   No strict transform — outputs aren't constrained by OpenAI's strict-tool rules."
  [schema]
  (tools-manifest/malli->json-schema schema))

(mu/defn- register-ui-tool!
  "Register a UI tool. `inputSchema` and `outputSchema` are Malli schemas (not JSON Schema)."
  [resource-key :- :keyword
   tool         :- [:map
                    [:name :string]
                    [:description :string]
                    [:inputSchema  :any]
                    [:outputSchema {:optional true} :any]
                    [:annotations  {:optional true} :map]
                    [:response-fn fn?]]]
  (if-let [uri (get-in @registry [:key->uri resource-key])]
    (let [scope (get-in @registry [:uri->resource uri :scope])
          tool  (-> tool
                    (update :inputSchema  malli->ui-input-schema)
                    (cond-> (:outputSchema tool) (update :outputSchema malli->ui-output-schema))
                    (assoc :scope scope
                           :required-extensions #{:mcp-app-ui}
                           :_meta {:ui {:resourceUri uri}}))]
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
                                   (:ui? resource) (assoc :_meta (mcp.ui-resource/ui-meta resource))))))
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
                    ui?  (assoc :_meta (mcp.ui-resource/ui-meta resource)))]}
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
  :description (str "Format reference for `construct_query` and `query`: top-level / "
                    "stage shape, field references, filter / aggregation / temporal "
                    "operators, joins, expressions, multi-stage queries, worked examples, "
                    "and common pitfalls.")
  :mimeType    "text/markdown"
  :render-fn   (classpath-text-resource "metabot/prompts/tools/construct_notebook_query.md")})

(register-ui-resource!
 :visualize-query
 "ui://metabase/visualize-query.html"
 "agent:viz:mcp-ui:query"
 {:name          "Visualize Query"
  :description   "Lightweight MCP Apps visualization for a query"
  :prefersBorder true
  :render-fn     (mcp.ui-resource/embed-render-fn "visualize-query")})

(register-ui-resource!
 :render-drill-through
 "ui://metabase/render-drill-through.html"
 "agent:viz:mcp-ui:drill-through"
 {:name          "Render Drill Through"
  :description   "Lightweight MCP Apps visualization for a drill-through follow-up"
  :prefersBorder true
  :render-fn     (mcp.ui-resource/embed-render-fn "render-drill-through")})

(register-ui-tool!
 :visualize-query
 {:name        "visualize_query"
  :description (str "Visualize a previously constructed query as an interactive chart or table. "
                    "This renders a lightweight MCP Apps visualization, not the full Metabase "
                    "query builder or standard Metabase UI. Do not tell the user to switch "
                    "display types, use visualization settings, or use a Metabase panel, "
                    "sidebar, or right-hand panel. "
                    "Use this for prompts that ask to show, display, visualize, plot, chart, "
                    "or present results, for example: `Show me customers in Metabase`, "
                    "`Show me orders by month`, `Display revenue by region`, or "
                    "`Visualize active users over time`. This renders the final answer in the UI. "
                    "Do not call execute_query after visualize_query; showing the visualization "
                    "is enough.")
  ;; Both fields are optional rather than expressing "at least one of" via a top-level `anyOf`.
  ;; This is because some MCP clients, e.g. the MCP inspector (mcpjam) rejects top-level combinators.
  ;; The response-fn enforces the at-least-one contract at runtime.
  :inputSchema
  [:map
   [:query        {:optional true
                   :description "Base64-encoded MBQL query (use query_handle instead when available)"}
    [:maybe ms/NonBlankString]]
   [:query_handle {:optional true
                   :description "Handle returned by construct_query; preferred over raw query"}
    [:maybe ms/UUIDString]]]
  :outputSchema
  [:map
   [:query  {:description "Base64-encoded MBQL query that the visualization is rendering."}
    :string]
   [:prompt {:optional true
             :description "User's original request, when stored alongside the handle."}
    [:maybe :string]]]
  :annotations {:readOnlyHint    true
                :destructiveHint false
                :idempotentHint  true
                :openWorldHint   false}
  :response-fn (fn [arguments {:keys [session-id]}]
                 (let [query    (:query arguments)
                       handle   (:query_handle arguments)
                       resolved (some->> handle (mcp.session/resolve-query-handle
                                                 session-id api/*current-user-id*))
                       encoded  (or query (:encoded_query resolved))
                       prompt   (:prompt resolved)]
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
 :render-drill-through
 {:name        "render_drill_through"
  :description (str "Render the drill-through visualization the user just navigated into. "
                    "This renders a lightweight MCP Apps visualization, not the full Metabase "
                    "query builder or standard Metabase UI. Do not tell the user to switch "
                    "display types, use visualization settings, or use a Metabase panel, "
                    "sidebar, or right-hand panel. "
                    "Use this tool, not execute_query, when the user asks to show the result and "
                    "their message includes a `handle` UUID. This is the exact follow-up for the "
                    "phrase `Show me the result`. Do not execute the query yourself; pass the "
                    "`handle` UUID as the `handle` argument.")
  :inputSchema
  [:map
   [:handle {:description "Handle UUID from the user's drill-through message."}
    ms/UUIDString]]
  :outputSchema
  [:map
   [:query {:description "Base64-encoded MBQL query bound to the drill-through handle."}
    :string]]
  :annotations {:readOnlyHint    true
                :destructiveHint false
                :idempotentHint  true
                :openWorldHint   false}
  :response-fn (fn [arguments {:keys [session-id]}]
                 (if-let [handle (:handle arguments)]
                   (if-let [encoded (mcp.session/read-handle session-id api/*current-user-id* handle)]
                     {:content           [{:type "text" :text "Rendering drill-through visualization..."}]
                      :structuredContent {:query encoded}}
                     {:content [{:type "text" :text "No drill-through found for that handle."}]
                      :isError true})
                   {:content [{:type "text" :text "No drill-through found for that handle."}]
                    :isError true}))})

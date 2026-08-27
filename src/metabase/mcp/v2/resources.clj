(ns metabase.mcp.v2.resources
  "The v2 MCP resource registry.

  Contains the `ui://` iframe shells behind the MCP Apps tools (`visualize_query`, `render_drill_through`)
  and the fields-catalog data resource. Documentation/skill resources land with the skills work.

  Every resource carries a required `:scope` and is matched with [[metabase.mcp.scope/matches?]], the same
  all-or-nothing gate v2 tools use. There are deliberately no public resources, so there is no looser gate to
  accidentally ship one through.

   Rendering and the `_meta.ui` sandbox block come from [[metabase.mcp.ui-resource]]."
  (:require
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.ui-resource :as mcp.ui-resource]
   [metabase.mcp.v2.projections :as projections]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private ui-mime-type "text/html;profile=mcp-app")

;; Keyed by URI, which is unique per resource. Overwrites on re-registration so REPL reload is idempotent.
(defonce ^:private resources*
  (atom (sorted-map)))

(mu/defn register-resource!
  "Register a v2 MCP data resource, returning its URI. Overwrites any existing entry with the
   same `:uri`. `:render-fn` produces the resource text at read time, so the content is always
   current rather than a snapshot from registration."
  [resource :- [:map
                [:uri :string]
                [:name :string]
                [:description :string]
                [:mimeType :string]
                [:scope :string]
                [:render-fn fn?]]]
  (swap! resources* assoc (:uri resource) resource)
  (:uri resource))

(mu/defn register-ui-resource!
  "Register a v2 MCP Apps UI resource, returning its URI. Overwrites any existing entry with the
   same `:uri`."
  [resource :- [:map
                [:uri :string]
                [:name :string]
                [:description :string]
                [:scope :string]
                [:render-fn fn?]
                [:prefersBorder {:optional true} :boolean]]]
  (swap! resources* assoc (:uri resource) (assoc resource :mimeType ui-mime-type :ui? true))
  (:uri resource))

(defn resource-scope
  "The scope guarding `uri`, or nil when no such resource is registered. UI tools read this so a
   tool and the resource it renders can never drift onto different scopes."
  [uri]
  (get-in @resources* [uri :scope]))

(defn resource-scopes
  "The distinct scope strings across all registered v2 resources."
  []
  (into (sorted-set) (keep :scope) (vals @resources*)))

(defn list-resources
  "The MCP `resources/list` payload, filtered by `token-scopes`."
  [token-scopes]
  {:resources (into []
                    (comp (filter #(mcp.scope/matches? token-scopes (:scope %)))
                          (map (fn [resource]
                                 (cond-> (select-keys resource [:uri :name :description :mimeType])
                                   (:ui? resource) (assoc :_meta (mcp.ui-resource/ui-meta resource))))))
                    (vals @resources*))})

(defn read-resource
  "Read a registered resource by URI, gated by `token-scopes`. Returns one of
   `{:status :ok :contents [...]}`, `{:status :scope-denied}`, or `{:status :not-found}`. The
   single registry lookup keeps the gate atomic with the render, so callers cannot bypass the
   scope check.

   `opts` is threaded to the `:render-fn` — see [[metabase.mcp.ui-resource/embed-render-fn]]."
  [uri token-scopes opts]
  (if-let [{:keys [render-fn scope] :as resource} (get @resources* uri)]
    (if (mcp.scope/matches? token-scopes scope)
      {:status   :ok
       :contents [(cond-> (-> (select-keys resource [:uri :mimeType])
                              (assoc :text (render-fn opts)))
                    (:ui? resource) (assoc :_meta (mcp.ui-resource/ui-meta resource)))]}
      {:status :scope-denied})
    {:status :not-found}))

;;; ------------------------------------------------ Registrations -------------------------------------------------

;; Two URIs rather than one shared shell: hosts dedupe mounted iframes by `_meta.ui.resourceUri`,
;; so a drill-through that reused the visualize URI would silently not render. See
;; [[metabase.mcp.ui-resource/embed-render-fn]] for the matching body-hash concern.

(def visualize-query-uri
  "URI of the iframe shell `visualize_query` renders into."
  (register-ui-resource!
   {:uri           "ui://metabase/visualize-query.html"
    :name          "Visualize Query"
    :description   "Lightweight MCP Apps visualization for a query"
    :scope         metabot.scope/agent-query-run
    :prefersBorder true
    :render-fn     (mcp.ui-resource/embed-render-fn "visualize-query")}))

(def render-drill-through-uri
  "URI of the iframe shell `render_drill_through` renders into."
  (register-ui-resource!
   {:uri           "ui://metabase/render-drill-through.html"
    :name          "Render Drill Through"
    :description   "Lightweight MCP Apps visualization for a drill-through follow-up"
    :scope         metabot.scope/agent-query-run
    :prefersBorder true
    :render-fn     (mcp.ui-resource/embed-render-fn "render-drill-through")}))

(def fields-catalog-uri
  "URI of the fields catalog: content type -> the dot-paths its `fields` argument accepts.
   Rendered at read time because tool namespaces register their projections at load time.
   The scheme is `catalog://`, NOT `metabase://` — that was v1's resource scheme, and the leak
   test bans it from anything an agent can read so nothing steers one at v1 affordances."
  (register-resource!
   {:uri         "catalog://metabase/fields"
    :name        "Fields Catalog"
    :description "The dot-paths each content type supports in `fields` arguments (e.g. get_content), keyed by type."
    :mimeType    "application/json"
    :scope       metabot.scope/agent-resource-read
    :render-fn   (fn [_opts] (json/encode (projections/all-catalogs)))}))

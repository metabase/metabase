(ns metabase.mcp.v2.resources
  "The v2 MCP resource registry — the `ui://` iframe shells behind the MCP Apps tools
   (`visualize_query`, `render_drill_through`).

   Deliberately narrower than the v1 registry ([[metabase.mcp.resources]]): every v2 resource
   carries a required `:scope` and is matched with [[metabase.mcp.scope/matches?]], the same
   all-or-nothing gate v2 tools use, rather than v1's `public-or-matches?` where a nil scope
   means \"any authenticated caller\". v2 has no public resources, so the looser gate would only
   be a way to accidentally ship one. Documentation/skill resources land with the skills work
   and will need their own registration path here.

   Rendering and the `_meta.ui` sandbox block are shared with v1 via
   [[metabase.mcp.ui-resource]] — that part must not drift between the two surfaces."
  (:require
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.ui-resource :as mcp.ui-resource]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private ui-mime-type "text/html;profile=mcp-app")

;; Keyed by URI, which is unique per resource. Overwrites on re-registration so REPL reload is
;; idempotent.
(defonce ^:private resources*
  (atom (sorted-map)))

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
  "The distinct scope strings across all registered v2 resources. Folded into the OAuth grant by
   [[metabase.mcp.core/all-scopes]], alongside [[metabase.mcp.v2.registry/registered-scopes]]."
  []
  (into (sorted-set) (keep :scope) (vals @resources*)))

(defn list-resources
  "The MCP `resources/list` payload, filtered by `token-scopes`."
  [token-scopes]
  {:resources (into []
                    (comp (filter #(mcp.scope/matches? token-scopes (:scope %)))
                          (map (fn [resource]
                                 (-> (select-keys resource [:uri :name :description :mimeType])
                                     (assoc :_meta (mcp.ui-resource/ui-meta resource))))))
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
       :contents [(-> (select-keys resource [:uri :mimeType])
                      (assoc :text (render-fn opts)
                             :_meta (mcp.ui-resource/ui-meta resource)))]}
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
    :scope         metabot.scope/agent-viz-mcp-ui-query
    :prefersBorder true
    :render-fn     (mcp.ui-resource/embed-render-fn "visualize-query")}))

(def render-drill-through-uri
  "URI of the iframe shell `render_drill_through` renders into."
  (register-ui-resource!
   {:uri           "ui://metabase/render-drill-through.html"
    :name          "Render Drill Through"
    :description   "Lightweight MCP Apps visualization for a drill-through follow-up"
    :scope         metabot.scope/agent-viz-mcp-ui-drill-through
    :prefersBorder true
    :render-fn     (mcp.ui-resource/embed-render-fn "render-drill-through")}))

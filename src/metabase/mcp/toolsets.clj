(ns metabase.mcp.toolsets
  "The v2 MCP toolset registry: 7 toolsets that map 1:1 to OAuth scope groups.

   Admins grant at the toolset level (7 groups) rather than toggling individual
   tools, `tools/list` is filtered by the granted group scopes, and a read-only
   server is a grant policy (read toolsets only) rather than a code fork. Each
   toolset's member tools carry the toolset's group scope in their `defendpoint`
   `:scope` metadata, so the same wildcard matching engine in
   [[metabase.api-scope.core]] gates both `tools/list` and per-call dispatch.

   This is the per-connection least-privilege layer — secondary to the enforcement
   floor (the user's Metabase permissions) and the admin/group ceiling. Its job is to
   give those layers a coarse, stable vocabulary to grant against, not to be the
   safety boundary."
  (:require
   [metabase.api-scope.core :as api-scope]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Toolset group scope declarations
;;; ──────────────────────────────────────────────────────────────────
;;
;; One group scope per toolset. Read toolsets take a `:read` scope, write toolsets a
;; `:write` scope. The `ui` toolset's grant is a wildcard over the two concrete
;; visualization scopes the tools themselves declare.

(api-scope/defscope agent-discover-read "agent:discover:read"
  (deferred-tru "Find and read content, data, and metadata"))
(api-scope/defscope agent-query-read "agent:query:read"
  (deferred-tru "Construct and run queries"))
(api-scope/defscope agent-author-write "agent:author:write"
  (deferred-tru "Create and edit questions, dashboards, collections, and documents"))
(api-scope/defscope agent-curate-write "agent:curate:write"
  (deferred-tru "Bookmark, revert, and annotate content"))
(api-scope/defscope agent-definitions-write "agent:definitions:write"
  (deferred-tru "Create and edit snippets, segments, and measures"))
(api-scope/defscope agent-notify-write "agent:notify:write"
  (deferred-tru "Create and edit alerts and subscriptions"))

;; The wildcard a `ui` grant carries. It covers both concrete visualization scopes —
;; `agent:viz:mcp-ui:query` and `agent:viz:mcp-ui:drill-through` — which the tools
;; themselves declare and which `all-scopes` advertises via the resource registry.
(api-scope/defscope agent-viz-mcp-ui "agent:viz:mcp-ui:*"
  (deferred-tru "Render charts and drill-throughs in the chat"))

;;; ──────────────────────────────────────────────────────────────────
;;; Registry
;;; ──────────────────────────────────────────────────────────────────

(def toolsets
  "Ordered registry of the 7 v2 toolsets. Each entry names the toolset, its risk
   level (`:read` / `:write`), whether it is on by default, the group scope a granted
   token carries to use its tools, and its member tools. The `ui` toolset also carries
   `:requires-extension`, since its tools are only usable by clients that support MCP
   Apps. Order is deterministic (admin UI listing, `tools/list` grouping)."
  [{:toolset    :discover
    :label      (deferred-tru "Discover")
    :risk       :read
    :default-on true
    :scope      agent-discover-read
    :tools      ["search" "browse_data" "browse_collection" "get_content" "get_parameter_values"]}
   {:toolset    :query
    :label      (deferred-tru "Query")
    :risk       :read
    :default-on true
    :scope      agent-query-read
    :tools      ["execute_query" "execute_sql" "run_saved_question"]}
   {:toolset    :author
    :label      (deferred-tru "Author")
    :risk       :write
    :default-on true
    :scope      agent-author-write
    :tools      ["question_write" "metric_write" "dashboard_write"
                 "collection_write" "document_write" "duplicate_content"]}
   {:toolset    :curate
    :label      (deferred-tru "Curate")
    :risk       :write
    :default-on true
    :scope      agent-curate-write
    :tools      ["bookmark_content" "revert_content" "timeline_write" "timeline_event_write"]}
   {:toolset    :definitions
    :label      (deferred-tru "Definitions")
    :risk       :write
    :default-on true
    :scope      agent-definitions-write
    :tools      ["snippet_write" "segment_write" "measure_write"]}
   {:toolset    :notify
    :label      (deferred-tru "Notify")
    :risk       :write
    :default-on true
    :scope      agent-notify-write
    :tools      ["alert_write" "subscription_write"]}
   {:toolset            :ui
    :label              (deferred-tru "In-chat visualizations")
    :risk               :read
    :default-on         true
    :requires-extension :mcp-app-ui
    :scope              agent-viz-mcp-ui
    :tools              ["visualize_query" "render_drill_through"]}])

(def ^:private toolset-index
  (into {} (map (juxt :toolset identity)) toolsets))

(def tool->toolset
  "Map of tool name to its owning toolset keyword."
  (into {} (for [{:keys [toolset tools]} toolsets, t tools] [t toolset])))

(defn all-tools
  "Every tool name across all toolsets, in registry order."
  []
  (into [] (mapcat :tools) toolsets))

(defn toolset-scope
  "The group scope string a granted token carries to use `toolset-kw`'s tools, or nil
   for an unknown toolset."
  [toolset-kw]
  (:scope (toolset-index toolset-kw)))

(def default-toolsets
  "Toolset keywords that are on by default. All 7 ship on; the admin ceiling narrows
   this per group."
  (into [] (comp (filter :default-on) (map :toolset)) toolsets))

(defn group-scopes
  "The group scope strings of the six toolsets that introduce a scope of their own.
   Excludes `ui`, whose grant is a wildcard over the two concrete visualization scopes
   the resource registry already advertises. Fed into [[metabase.mcp.core/all-scopes]]
   so the OAuth server advertises them."
  []
  (into [] (comp (remove #(= :ui (:toolset %))) (map :scope)) toolsets))

(defn grant->scopes
  "Resolve a grant into the set of scope strings a token carries. `granted-toolsets`
   is a collection of toolset keywords. When `read-only?` is true, write toolsets are
   dropped even if granted — the read-only grant policy, expressed purely as which
   scopes the token carries, with no separate read-only code path."
  [granted-toolsets read-only?]
  (into #{}
        (comp (keep toolset-index)
              (filter (fn [{:keys [risk]}] (or (not read-only?) (= :read risk))))
              (map :scope))
        granted-toolsets))

;;; ──────────────────────────────────────────────────────────────────
;;; v1 → v2 scope migration table
;;; ──────────────────────────────────────────────────────────────────

(def v1->v2-scope-migration
  "Best-effort mapping from v1 `agent:*` scope strings to the v2 toolset group scope
   that inherits the capability, so EE usage-log analytics stay interpretable across
   the cutover. v1 scope strings are not accepted at runtime — this table is a
   read-side interpretation aid, not a runtime alias.

   Approximate by nature: several v1 scopes spanned capabilities that v2 splits across
   toolsets, so each maps to the group of its dominant capability. A `nil` value marks
   a v1 scope with no v2 home (a retired capability — transforms authoring and todos
   are out of the v2 surface)."
  {"agent:search"                   "agent:discover:read"
   "agent:resource:read"            "agent:discover:read"
   "agent:metadata:read"            "agent:discover:read"
   "agent:snippets:read"            "agent:discover:read"
   "agent:document:read"            "agent:discover:read"
   "agent:transforms:read"          "agent:discover:read"
   "agent:sql:read"                 "agent:discover:read"
   "agent:viz:read"                 "agent:discover:read"
   "agent:viz:navigate"             "agent:discover:read"
   "agent:sql:construct"            "agent:query:read"
   "agent:sql:execute"              "agent:query:read"
   "agent:notebook:create"          "agent:query:read"
   "agent:query"                    "agent:query:read"
   "agent:query:construct"          "agent:query:read"
   "agent:query:execute"            "agent:query:read"
   "agent:question:execute"         "agent:query:read"
   "agent:sql:create"               "agent:author:write"
   "agent:sql:edit"                 "agent:author:write"
   "agent:question:create"          "agent:author:write"
   "agent:question:update"          "agent:author:write"
   "agent:metric:create"            "agent:author:write"
   "agent:metric:update"            "agent:author:write"
   "agent:dashboard:create"         "agent:author:write"
   "agent:dashboard:update"         "agent:author:write"
   "agent:collection:create"        "agent:author:write"
   "agent:document:create"          "agent:author:write"
   "agent:viz:create"               "agent:author:write"
   "agent:viz:edit"                 "agent:author:write"
   "agent:dashboard:subscribe"      "agent:notify:write"
   "agent:alert:create"             "agent:notify:write"
   "agent:viz:mcp-ui:query"         "agent:viz:mcp-ui:query"
   "agent:viz:mcp-ui:drill-through" "agent:viz:mcp-ui:drill-through"
   "agent:transforms:write"         nil
   "agent:todo:read"                nil
   "agent:todo:write"               nil})

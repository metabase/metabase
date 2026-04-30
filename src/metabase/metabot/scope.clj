(ns metabase.metabot.scope
  "Metabot-specific scope declarations and permission-to-scope mapping.

  Generic scope infrastructure (registry, matching, `defscope`) lives in
  [[metabase.api-scope.core]]. This namespace declares the concrete `agent:*`
  scopes used by metabot tools and maps metabot permission types to wildcard
  scope grants."
  (:require
   [metabase.api-scope.core :as api-scope]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Scope declarations
;;; ──────────────────────────────────────────────────────────────────

;; SQL
(api-scope/defscope agent-sql-create "agent:sql:create"
  (deferred-tru "Create SQL queries"))
(api-scope/defscope agent-sql-edit "agent:sql:edit"
  (deferred-tru "Edit SQL queries"))
(api-scope/defscope agent-sql-read "agent:sql:read"
  (deferred-tru "Read and clarify SQL queries"))

;; Notebook / Query
(api-scope/defscope agent-notebook-create "agent:notebook:create"
  (deferred-tru "Create notebook queries"))
(api-scope/defscope agent-query "agent:query"
  (deferred-tru "Construct and execute queries"))
(api-scope/defscope agent-query-construct "agent:query:construct"
  (deferred-tru "Construct queries"))
(api-scope/defscope agent-query-execute "agent:query:execute"
  (deferred-tru "Execute queries"))

;; Question (saved cards via Agent API)
(api-scope/defscope agent-question-create "agent:question:create"
  (deferred-tru "Create saved questions"))

;; Transforms
(api-scope/defscope agent-transforms-read "agent:transforms:read"
  (deferred-tru "View transforms"))
(api-scope/defscope agent-transforms-write "agent:transforms:write"
  (deferred-tru "Create and edit transforms"))

;; Snippets
(api-scope/defscope agent-snippets-read "agent:snippets:read"
  (deferred-tru "View SQL snippets"))

;; Dashboard
(api-scope/defscope agent-dashboard-create "agent:dashboard:create"
  (deferred-tru "Create dashboards"))
(api-scope/defscope agent-dashboard-subscribe "agent:dashboard:subscribe"
  (deferred-tru "Subscribe to dashboard alerts"))

;; Document
(api-scope/defscope agent-document-read "agent:document:read"
  (deferred-tru "View documents"))
(api-scope/defscope agent-document-create "agent:document:create"
  (deferred-tru "Create documents"))

;; Visualization
(api-scope/defscope agent-viz-read "agent:viz:read"
  (deferred-tru "Analyze charts and visualizations"))
(api-scope/defscope agent-viz-create "agent:viz:create"
  (deferred-tru "Create charts and visualizations"))
(api-scope/defscope agent-viz-edit "agent:viz:edit"
  (deferred-tru "Edit charts and visualizations"))
(api-scope/defscope agent-viz-navigate "agent:viz:navigate"
  (deferred-tru "Navigate to visualizations"))

;; Alert
(api-scope/defscope agent-alert-create "agent:alert:create"
  (deferred-tru "Create alerts"))

;; Search
(api-scope/defscope agent-search "agent:search"
  (deferred-tru "Search for content"))

;; Metadata
(api-scope/defscope agent-metadata-read "agent:metadata:read"
  (deferred-tru "View database metadata"))

;; Resource
(api-scope/defscope agent-resource-read "agent:resource:read"
  (deferred-tru "View resources"))

;; Todo
(api-scope/defscope agent-todo-read "agent:todo:read"
  (deferred-tru "View todos"))
(api-scope/defscope agent-todo-write "agent:todo:write"
  (deferred-tru "Create and edit todos"))

;; Table
(api-scope/defscope agent-table-read "agent:table:read"
  (deferred-tru "View table metadata and field values"))

;; Metric
(api-scope/defscope agent-metric-read "agent:metric:read"
  (deferred-tru "View metric definitions"))

;;; ──────────────────────────────────────────────────────────────────
;;; Metabot permission type definitions
;;; ──────────────────────────────────────────────────────────────────

(def metabot-permissions
  "Metabot permission definitions. Values are ordered from most permissive to least permissive."
  {:permission/metabot                  {:values [:yes :no]}
   :permission/metabot-sql-generation   {:values [:yes :no]}
   :permission/metabot-nlq              {:values [:yes :no]}
   :permission/metabot-other-tools      {:values [:yes :no]}})

(def perm-types
  "The set of defined metabot permission types."
  (set (keys metabot-permissions)))

(def perm-type-defaults
  "Default values for each metabot permission type."
  {:permission/metabot                  :no
   :permission/metabot-sql-generation   :no
   :permission/metabot-nlq              :no
   :permission/metabot-other-tools      :no})

;;; ──────────────────────────────────────────────────────────────────
;;; Metabot-specific scope state
;;; ──────────────────────────────────────────────────────────────────

(def ^:dynamic *current-user-scope*
  "Set of scope strings granted to the current user. Defaults to `#{}` (no
  permissions granted). Bind this in the request path once scope resolution
  is wired up."
  #{})

(def ^:dynamic *current-user-metabot-permissions*
  "Map of metabot permission type to value for the current user.
  e.g. `{:permission/metabot-sql-generation :yes, :permission/metabot-nlq :no, ...}`.
  Bind in the request path alongside `*current-user-scope*`. When nil,
  consumers should fall back to `perm-type-defaults`."
  nil)

;;; ──────────────────────────────────────────────────────────────────
;;; Permission → Scope mapping
;;; ──────────────────────────────────────────────────────────────────

(def ^:private perm-type->scopes
  "Map from metabot permission type to the wildcard scope strings granted when
  that permission is `:yes`."
  {:permission/metabot-sql-generation #{"agent:sql:*" "agent:transforms:*" "agent:snippets:*"}
   :permission/metabot-nlq            #{"agent:notebook:*" "agent:query:*" "agent:table:*" "agent:metric:*" "agent:question:*"}
   :permission/metabot-other-tools    #{"agent:viz:*" "agent:dashboard:*" "agent:document:*" "agent:alert:*"}})

(def always-granted-scopes
  "Scopes granted to every user regardless of permissions."
  #{"agent:search" "agent:resource:*" "agent:todo:*" "agent:metadata:*"})

(def all-yes-permissions
  "Permissions map granting all permissions. Used for superuser context."
  {:permission/metabot                :yes
   :permission/metabot-sql-generation :yes
   :permission/metabot-nlq            :yes
   :permission/metabot-other-tools    :yes})

;;; ──────────────────────────────────────────────────────────────────
;;; Permission resolution
;;; ──────────────────────────────────────────────────────────────────

(defn most-permissive-value
  "Given a perm type and a collection of values from different groups,
  return the most permissive value. Values are ordered most→least permissive
  in `metabot-permissions`."
  [perm-type values]
  (let [ordering (get-in metabot-permissions [perm-type :values])
        rank     (into {} (map-indexed (fn [i v] [v i]) ordering))]
    ;; Lowest index = most permissive
    (first (sort-by #(get rank % Integer/MAX_VALUE) values))))

(defenterprise resolve-user-permissions
  "Resolve the effective metabot permissions for a user by taking the most
  permissive value across all their groups. Returns a map of perm-type → value,
  with defaults filled in for any unset permission types.
  OSS implementation returns defaults for all users."
  metabase-enterprise.metabot.permissions
  [_user-id]
  all-yes-permissions)

(defn user-metabot-perms->scopes
  "Convert a resolved metabot permissions map into a set of scope strings.
  Maps `:yes` permissions to the corresponding wildcard scope sets and always
  includes `always-granted-scopes`."
  [perms]
  (reduce-kv
   (fn [acc perm-type perm-value]
     (if (and (= :yes perm-value) (contains? perm-type->scopes perm-type))
       (into acc (get perm-type->scopes perm-type))
       acc))
   always-granted-scopes
   (or perms perm-type-defaults)))

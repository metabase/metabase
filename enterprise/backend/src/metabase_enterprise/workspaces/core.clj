(ns metabase-enterprise.workspaces.core
  "Small facade the remote-sync module calls into for workspace scoping. Remote-sync depends on
   workspaces, never the reverse, so the honeysql/version helpers workspace-scoped remote-sync flows
   need live here rather than inside remote-sync."
  (:require
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn workspace-filter-clause :- [:sequential :any]
  "HoneySQL clause scoping a `workspace_id`-tagged table (remote_sync_object, remote_sync_task) to one
   workspace's rows. Nil `workspace-id` is the main app: rows with no workspace reference (including all
   default-branch remote sync). The two-arity form scopes an explicitly named column."
  ([workspace-id :- [:maybe pos-int?]]
   (workspace-filter-clause :workspace_id workspace-id))
  ([column       :- :keyword
    workspace-id :- [:maybe pos-int?]]
   [:= column workspace-id]))

(mu/defn set-base-version! :- :nil
  "Record `version` (a git SHA) as `workspace-id`'s sync base — the commit local changes are built on.
   No-op when `version` is nil."
  [workspace-id :- pos-int?
   version      :- [:maybe :string]]
  (when version
    (t2/update! :model/Workspace workspace-id {:base_version version}))
  nil)

(mu/defn check-branch-not-workspace! :- :nil
  "Throw a 400 when `branch` is some workspace's branch. Used before adopting a branch as the main
   remote-sync branch and before stashing to a new branch, so the main app never points at a branch a
   workspace already owns."
  [branch :- :string]
  (when-let [workspace (t2/select-one :model/Workspace :branch branch)]
    (throw (ex-info (format "Branch '%s' belongs to a workspace. It cannot be used as the main remote sync branch."
                            branch)
                    {:status-code  400
                     :workspace_id (:id workspace)})))
  nil)

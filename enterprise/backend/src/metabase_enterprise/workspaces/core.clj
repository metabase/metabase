(ns metabase-enterprise.workspaces.core
  "Small facade the remote-sync module calls into for workspace scoping. Remote-sync depends on
   workspaces, never the reverse, so the honeysql/version helpers workspace-scoped remote-sync flows
   need live here rather than inside remote-sync.

   The [[reconcile-remappings-for-model!]] / [[remappings-for-model]] / [[workspace-created-entities]] /
   [[exists-any-remapping?]] functions are the facade for remote-sync's direct reads and writes of
   `:model/WorkspaceEntityRemapping` -- remote-sync passes and receives Toucan model keywords, same as
   the rest of the workspaces module's public API; the plain kebab-case storage format
   (see [[metabase.workspaces.remapping/model->entity-type]]) never crosses this boundary."
  (:require
   [metabase.util.malli :as mu]
   [metabase.workspaces.remapping :as ws.remapping]
   [metabase.workspaces.schema :as ws.schema]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private entity-type->model
  "Reverse of [[metabase.workspaces.remapping/model->entity-type]]: the plain kebab-case keyword
  stored in `workspace_entity_remapping.entity_type` -> the Toucan model keyword it represents."
  (into {} (map (juxt ws.remapping/model->entity-type identity)) ws.schema/entity-types))

(mu/defn reconcile-remappings-for-model! :- :nil
  "Replace all of `workspace-id`'s `:model/WorkspaceEntityRemapping` rows for `model` with `rows`
  (each a `{:source-entity-id ... :target-entity-id ...}` pair). Used by remote-sync after a
  workspace pull to keep the read-path remapping in step with the copies the pull produced."
  [workspace-id :- pos-int?
   model        :- :keyword
   rows         :- [:sequential [:map
                                 [:source-entity-id pos-int?]
                                 [:target-entity-id pos-int?]]]]
  (let [entity-type (ws.remapping/model->entity-type model)]
    (t2/delete! :model/WorkspaceEntityRemapping :workspace_id workspace-id :entity_type entity-type)
    (when (seq rows)
      (t2/insert! :model/WorkspaceEntityRemapping
                  (for [{:keys [source-entity-id target-entity-id]} rows]
                    {:workspace_id     workspace-id
                     :entity_type      entity-type
                     :source_entity_id source-entity-id
                     :target_entity_id target-entity-id}))))
  nil)

(mu/defn remappings-for-model :- [:map-of pos-int? pos-int?]
  "Map of source-entity-id -> target-entity-id for `workspace-id`'s remappings of `model` among
  `source-ids`. Used to build the workspace overlay export set for a push."
  [workspace-id :- pos-int?
   model        :- :keyword
   source-ids   :- [:sequential pos-int?]]
  (if (empty? source-ids)
    {}
    (into {}
          (map (juxt :source_entity_id :target_entity_id))
          (t2/select [:model/WorkspaceEntityRemapping :source_entity_id :target_entity_id]
                     :workspace_id     workspace-id
                     :entity_type      (ws.remapping/model->entity-type model)
                     :source_entity_id [:in (set source-ids)]))))

(mu/defn workspace-created-entities :- [:sequential [:map [:model :keyword] [:target-entity-id pos-int?]]]
  "All (model, target-entity-id) pairs among `workspace-id`'s remapping rows where source = target --
  i.e. entities created directly inside the workspace rather than copied from main. Used to build the
  workspace overlay export set for a push."
  [workspace-id :- pos-int?]
  (into []
        (keep (fn [{:keys [entity_type target_entity_id]}]
                (when-let [model (entity-type->model entity_type)]
                  {:model model :target-entity-id target_entity_id})))
        (t2/select [:model/WorkspaceEntityRemapping :entity_type :source_entity_id :target_entity_id]
                   :workspace_id workspace-id
                   {:where [:= :source_entity_id :target_entity_id]})))

(mu/defn exists-any-remapping? :- :boolean
  "Whether `workspace-id` has any `:model/WorkspaceEntityRemapping` row at all -- used by
  remote-sync's is-dirty check: a push-first workspace has an empty RemoteSyncObject ledger, so
  any copy-on-write remapping counts as a local change."
  [workspace-id :- pos-int?]
  (t2/exists? :model/WorkspaceEntityRemapping :workspace_id workspace-id))

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

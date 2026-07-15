(ns metabase-enterprise.remote-sync.core
  (:require
   [metabase-enterprise.remote-sync.guards :as guards]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase.api.common :as api]
   [metabase.collections.core :as collections]
   [metabase.events.core :as events]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [potemkin :as p]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment
  source/keep-me)

(p/import-vars
 [source]
 [source.p
  ->ingestable]
 [settings
  remote-sync-url
  remote-sync-token
  remote-sync-branch])

;;; --------------------------- Workspace child-branch helpers ---------------------------

(defn create-workspace-branch!
  "Create `branch` on the configured git remote, cut from the last-synced commit
   (falling back to the `remote-sync-branch` tip when nothing has synced yet).
   No-op when the branch already exists on the remote — which makes workspace
   create idempotent on retry and lets a re-created workspace reuse its old
   branch. Unlike the create-branch API path, this never touches this instance's
   `remote-sync-branch` setting: the branch belongs to a child instance, not us.

   Returns the base commit-ish the branch was cut from, or nil when skipped."
  [branch]
  (let [src (source/source-from-settings)]
    (when-not (contains? (set (source.p/branches src)) branch)
      (let [base (or (remote-sync.task/last-version) (settings/remote-sync-branch))]
        (source.p/create-branch src branch base)
        base))))

(defn initial-import-if-needed!
  "Blocking initial import of the configured `remote-sync-branch`, for a workspace
   child instance's first boot: runs only when remote sync is enabled and no sync
   task has ever completed, and skips (with a log line) when the branch does not
   exist on the remote yet. Blocks until the import task finishes so the caller —
   the config.yml apply path — can treat a 2xx response as \"content is live\".

   Returns the finished RemoteSyncTask row, or nil when skipped."
  []
  (when (and (settings/remote-sync-enabled)
             (nil? (remote-sync.task/last-version)))
    (let [branch (settings/remote-sync-branch)
          src    (source/source-from-settings)]
      (if (contains? (set (source.p/branches src)) branch)
        ;; force? true: first import on a fresh child, nothing local to protect;
        ;; force-deletion? false mirrors finish-remote-config! (GHY-3900).
        (let [{task-id :id} (impl/async-import! branch true {} :force-deletion? false)
              ;; same ceiling run-async! enforces on the task itself
              deadline (+ (System/currentTimeMillis) (* (settings/remote-sync-task-time-limit-ms) 10))]
          (loop []
            (let [task (t2/select-one :model/RemoteSyncTask :id task-id)]
              (cond
                (:ended_at task) task
                (> (System/currentTimeMillis) deadline)
                (do (log/errorf "Initial workspace import (task %d) did not finish in time" task-id)
                    task)
                :else (do (Thread/sleep 500) (recur))))))
        (log/infof "Remote-sync branch %s does not exist on the remote yet; skipping initial import"
                   (pr-str branch))))))

(defenterprise collection-editable?
  "Determines if a remote-synced collection should be editable.

  Takes a collection to check for editability.

  Returns true if the collection is editable, false otherwise. Returns true when remote-sync-type is :read-write
  or when the collection is not a remote-synced collection. Always returns true on OSS."
  :feature :none
  [collection]
  (or (= (settings/remote-sync-type) :read-write)
      (not (collections/remote-synced-collection? collection))))

(defenterprise table-editable?
  "Determines if a table's metadata should be editable.

  Takes a table to check for editability.

  Returns true if the table is editable, false otherwise. Returns false if:
  - remote-sync-type is :read-only AND
  - table is published AND
  - table is in a remote-synced collection

  Always returns true on OSS.

  If the table has a pre-hydrated :collection key, uses that to avoid an extra query."
  :feature :none
  [table]
  (or (= (settings/remote-sync-type) :read-write)
      (not (:is_published table))
      ;; Use pre-hydrated :collection if available, otherwise fall back to :collection_id
      (not (collections/remote-synced-collection? (or (:collection table)
                                                      (:collection_id table))))))

(defenterprise transforms-editable?
  "Determines if transforms should be editable.

  Returns true if transforms are editable, false otherwise. Transforms are globally
  read-only when remote-sync is enabled and remote-sync-type is :read-only.

  Always returns true on OSS."
  :feature :none
  []
  (or (not (settings/remote-sync-enabled))
      (= (settings/remote-sync-type) :read-write)))

(defenterprise model-editable?
  "Determines if a model instance is editable based on remote sync configuration."
  :feature :none
  [model-key instance]
  (spec/model-editable? model-key instance))

(defenterprise batch-model-editable?
  "Batch version of model-editable?. Returns a map of instance-id -> editable? boolean."
  :feature :none
  [model-key instances]
  (spec/batch-model-editable? model-key instances))

(defenterprise batch-model-eligible?
  "Batch check if model instances are eligible for remote sync based on spec rules.
   Returns a map of instance-id -> eligible? boolean."
  :feature :none
  [model-key instances]
  (if-let [spec (spec/spec-for-model-key model-key)]
    (spec/batch-check-eligibility spec instances)
    (into {} (map (fn [inst] [(:id inst) false])) instances)))

(mu/defn bulk-set-remote-sync :- :nil
  "Sets remote sync to true/false on one or collections in a single transaction. Checks that the remote sync state
  afterwards is consistent in terms of dependency rules. Collections are provided as a map of collection-id -> sync state."
  [collection-states :- [:map-of pos-int? :boolean]]
  (guards/ensure-no-active-task!)
  (let [{:keys [sync-on sync-off]} (-> (reduce-kv (fn [sync-states collection-id sync-state]
                                                    (if sync-state
                                                      (update sync-states :sync-on conj collection-id)
                                                      (update sync-states :sync-off conj collection-id)))
                                                  {:sync-on #{} :sync-off #{}}
                                                  collection-states)
                                       (update :sync-on #(when-let [sync-on (seq %)]
                                                           (t2/select :model/Collection :id [:in sync-on])))
                                       (update :sync-off #(when-let [sync-off (seq %)]
                                                            (t2/select :model/Collection :id [:in sync-off]))))]
    (t2/with-transaction [_]
      (when (seq sync-on)
        (t2/query {:update (t2/table-name :model/Collection)
                   :set {:is_remote_synced true}
                   :where [:and
                           [:= :is_remote_synced false]
                           (into [:or [:in :id (map :id sync-on)]]
                                 (for [collection sync-on]
                                   [:like :location (str (collections/location-path collection) "%")]))]}))
      (when (seq sync-off)
        (let [affected-collection-ids
              (t2/select-pks-set :model/Collection
                                 {:where [:and
                                          [:= :is_remote_synced true]
                                          (into [:or [:in :id (map :id sync-off)]]
                                                (for [collection sync-off]
                                                  [:like :location (str (collections/location-path collection) "%")]))]})]
          (when (seq affected-collection-ids)
            (t2/query {:update (t2/table-name :model/Collection)
                       :set {:is_remote_synced false}
                       :where [:in :id affected-collection-ids]})
            (t2/delete! :model/RemoteSyncObject
                        :model_type "Collection"
                        :model_id [:in affected-collection-ids])
            (t2/delete! :model/RemoteSyncObject
                        :model_collection_id [:in affected-collection-ids]))))
      (doseq [collection sync-on]
        (collections/check-non-remote-synced-dependencies collection))
      (doseq [collection sync-off]
        (collections/check-remote-synced-dependents collection)))
    (doseq [collection sync-on
            ;; only publish event when this changed
            :when (not (:is_remote_synced collection))]
      (events/publish-event! :event/collection-update
                             ;; collection is the model originally loaded set the correct sync state
                             {:object (assoc collection :is_remote_synced true)
                              :user-id api/*current-user-id*}))
    (doseq [collection sync-off
            ;; only publish event when this changed
            :when (:is_remote_synced collection)]
      (events/publish-event! :event/collection-update
                             ;; collection is the model originally loaded set the correct sync state
                             {:object (assoc collection :is_remote_synced false)
                              :user-id api/*current-user-id*}))))

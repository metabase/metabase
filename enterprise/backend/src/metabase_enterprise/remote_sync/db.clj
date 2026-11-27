(ns metabase-enterprise.remote-sync.db
  "Application database queries for the remote sync module, each a direct Toucan 2 call, so that no other namespace of
  the module runs a query itself."
  (:require
   [metabase-enterprise.remote-sync.schema :as remote-sync.schema]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defenterprise non-default-worktree-exists?
  "Whether any worktree other than the default one exists, with the `:remote-sync` feature or without it, so that a
  lost feature keeps every request in the default worktree."
  :feature :none
  []
  (t2/exists? :model/RemoteSyncWorktree :is_default false))

(defenterprise user-worktree-id
  "The id of the worktree other than the default one the user with `user-id` checked out, or nil."
  :feature :remote-sync
  [user-id]
  (t2/select-one-fn :worktree_id :model/RemoteSyncWorktreeUser :user_id user-id))

(defenterprise worktree-by-id
  "The worktree with `worktree-id`, or nil."
  :feature :remote-sync
  [worktree-id]
  (t2/select-one :model/RemoteSyncWorktree :id worktree-id))

(mu/defn synced-rows
  "The rows of `model` remote sync syncs with the columns its export takes, ordered by primary key."
  [model :- :keyword]
  (let [pk (first (t2/primary-keys model))]
    (t2/select (into [model] (serialization/columns model))
               pk [:in (remote-sync/synced-ids-clause model nil)]
               {:order-by [[pk :asc]]})))

(mu/defn synced-count :- :int
  "The number of rows of `model` remote sync syncs."
  [model :- :keyword]
  (t2/count model (first (t2/primary-keys model)) [:in (remote-sync/synced-ids-clause model nil)]))

(mu/defn built-in-entity-ids :- [:set :string]
  "Those of the `entity-ids` of rows of `model` that every instance has."
  [model      :- :keyword
   entity-ids :- [:sequential :string]]
  (into #{}
        (map :entity_id)
        (mdb/select-batched #(t2/query {:select [:row.entity_id]
                                        :from   [[(t2/table-name model) :row]]
                                        :where  [:and
                                                 [:in :row.entity_id %]
                                                 (remote-sync/built-in-filter-clause model :row)]})
                            entity-ids)))

(mu/defn rows-not-built-in
  "The rows of `model` with the primary keys `pks` that not every instance has."
  [model :- :keyword
   pks   :- [:sequential [:or :int :string]]]
  (let [pk (u/qualified-key :row (first (t2/primary-keys model)))]
    (mdb/select-batched #(t2/select [model :row.*] {:from  [[(t2/table-name model) :row]]
                                                    :where [:and
                                                            [:in pk %]
                                                            [:not (remote-sync/built-in-filter-clause model :row)]]})
                        pks)))

(mu/defn collections
  "The Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (mdb/select-batched #(t2/select :model/Collection :id [:in %]) collection-ids))

(mu/defn synced-card-counts-by-type :- [:map-of :keyword :int]
  "The number of Cards remote sync syncs, by `:type`."
  []
  (t2/select-fn->fn :type :count [:model/Card :type [:%count.* :count]]
                    :id [:in (remote-sync/synced-ids-clause :model/Card nil)]
                    {:group-by [:type]}))

(mu/defn task
  "The RemoteSyncTask with `task-id`, or nil."
  [task-id :- ms/PositiveInt]
  (t2/select-one :model/RemoteSyncTask :id task-id))

(mu/defn task-cancelled?
  "The cancelled flag of the RemoteSyncTask with `task-id`."
  [task-id :- ms/PositiveInt]
  (t2/select-one-fn :cancelled :model/RemoteSyncTask :id task-id))

(def ^:private last-alive-at
  "The last sign of life of a task: its heartbeat, or its last progress report when it has no heartbeat yet."
  [:coalesce :last_heartbeat_at :last_progress_report_at])

(mu/defn current-task
  "The newest started, unfinished RemoteSyncTask whose owner was alive after `liveness-cutoff`, or nil."
  [liveness-cutoff :- ms/TemporalInstant]
  (t2/select-one :model/RemoteSyncTask
                 {:where    [:and
                             [:<> :started_at nil]
                             [:= :ended_at nil]
                             [:< liveness-cutoff last-alive-at]]
                  :limit    1
                  :order-by [[:started_at :desc]
                             [:id :desc]]}))

(mu/defn most-recent-task
  "The newest started RemoteSyncTask, or nil."
  []
  (t2/select-one :model/RemoteSyncTask
                 {:where    [:and
                             [:<> :started_at nil]]
                  :limit    1
                  :order-by [[:started_at :desc]
                             [:id :desc]]}))

(mu/defn last-synced-task
  "The newest RemoteSyncTask with a version and no conflicts, the last one that synced successfully, or nil."
  []
  (t2/select-one :model/RemoteSyncTask
                 {:where    [:and
                             [:<> nil :version]
                             [:= nil :conflicts]]
                  :limit    1
                  :order-by [[:started_at :desc]
                             [:id :desc]]}))

(mu/defn insert-task!
  "Insert `task` and return the new instance."
  [task :- ::remote-sync.schema/remote-sync-task.update]
  (t2/insert-returning-instance! :model/RemoteSyncTask task))

(mu/defn cancel-running-task!
  "Asks the RemoteSyncTask with `task-id` to stop, unless it already ended."
  [task-id :- ms/PositiveInt]
  (t2/update! :model/RemoteSyncTask {:id task-id :ended_at nil} {:cancelled true}))

(mu/defn update-task!
  "Apply `changes` to the RemoteSyncTask with `task-id`."
  [task-id :- ms/PositiveInt
   changes :- ::remote-sync.schema/remote-sync-task.update]
  (t2/update! :model/RemoteSyncTask :id task-id changes))

(mu/defn end-task!
  "Apply `changes` to the RemoteSyncTask with `task-id` and mark it ended now."
  [task-id :- ms/PositiveInt
   changes :- ::remote-sync.schema/remote-sync-task.update]
  (t2/update! :model/RemoteSyncTask :id task-id (assoc changes :ended_at :%now)))

(mu/defn report-task-progress!
  "Record `progress` for the RemoteSyncTask with `task-id`, stamping the progress report time."
  [task-id  :- ms/PositiveInt
   progress :- number?]
  (t2/update! :model/RemoteSyncTask :id task-id {:progress progress, :last_progress_report_at :%now}))

(mu/defn touch-task!
  "Stamps the heartbeat of the RemoteSyncTask with `task-id` unless it ended, returning the number of rows updated."
  [task-id :- ms/PositiveInt]
  (t2/update! :model/RemoteSyncTask {:id task-id, :ended_at nil} {:last_heartbeat_at :%now}))

(mu/defn supersede-stale-tasks! :- [:sequential ms/PositiveInt]
  "Cancels and ends with the error `message` the running RemoteSyncTasks last alive before `cutoff`, returning their
  ids."
  [cutoff  :- ms/TemporalInstant
   message :- :string]
  (let [stale [:and
               [:<> :started_at nil]
               [:= :ended_at nil]
               [:< last-alive-at cutoff]]
        ids   (vec (t2/select-pks-vec :model/RemoteSyncTask {:where stale}))]
    (when (seq ids)
      (t2/query {:update (t2/table-name :model/RemoteSyncTask)
                 :set    {:cancelled     true
                          :ended_at      :%now
                          :error_message message}
                 :where  [:and stale [:in :id ids]]}))
    ids))

(mu/defn delete-remote-sync-tasks-for-cleanup!
  "Delete the RemoteSyncTasks started before `cutoff` but the one with `kept-id`, returning the number deleted."
  [cutoff  :- ms/TemporalInstant
   kept-id :- [:maybe ms/PositiveInt]]
  (t2/delete! :model/RemoteSyncTask {:where [:and [:< :started_at cutoff] [:not= :id kept-id]]}))

(mu/defn users-by-id
  "A map of User ID to User for `user-ids`."
  [user-ids :- [:sequential [:maybe ::lib.schema.id/user]]]
  (mdb/select-batched-map #(t2/select-pk->fn identity :model/User :id [:in %]) user-ids))

(mu/defn worktree-users :- [:sequential :map]
  "The active users who checked out the worktrees with `worktree-ids`, each with the `worktree_id` they checked out."
  [worktree-ids :- [:sequential ms/PositiveInt]]
  (let [user (t2/table-name :model/User)
        col  (partial u/qualified-key user)]
    (t2/select [:model/User [(col :id) :id] (col :email) (col :first_name) (col :last_name) :wu.worktree_id]
               {:join     [[(t2/table-name :model/RemoteSyncWorktreeUser) :wu] [:= :wu.user_id (col :id)]]
                :where    [:and [:in :wu.worktree_id worktree-ids] [:= (col :is_active) true]]
                :order-by [[(col :id) :asc]]})))

(mu/defn worktrees :- [:sequential ::remote-sync.schema/worktree]
  "Every worktree but the default one, the main app, by branch."
  []
  (t2/select :model/RemoteSyncWorktree :is_default false {:order-by [[:branch :asc] [:id :asc]]}))

(mu/defn worktree-branch :- [:maybe :string]
  "The branch of the worktree with `worktree-id`, or nil."
  [worktree-id :- ms/PositiveInt]
  (t2/select-one-fn :branch :model/RemoteSyncWorktree :id worktree-id))

(mu/defn insert-worktree! :- ::remote-sync.schema/worktree
  "Insert the worktree `worktree` and return it."
  [worktree :- ::remote-sync.schema/worktree.update]
  (t2/insert-returning-instance! :model/RemoteSyncWorktree worktree))

(mu/defn update-worktree!
  "Set the columns `changes` of the worktree with `worktree-id`."
  [worktree-id :- ms/PositiveInt
   changes     :- ::remote-sync.schema/worktree.update]
  (t2/update! :model/RemoteSyncWorktree :id worktree-id changes))

(mu/defn delete-worktree!
  "Delete the worktree with `worktree-id`, the database deleting its content and the checkouts of it."
  [worktree-id :- ms/PositiveInt]
  (t2/delete! :model/RemoteSyncWorktree :id worktree-id))

(mu/defn delete-checkout!
  "Delete the checkout of the user with `user-id`, who then works in the main app."
  [user-id :- ms/PositiveInt]
  (t2/delete! :model/RemoteSyncWorktreeUser :user_id user-id))

(mu/defn insert-checkout!
  "Record that the user with `user-id` checked out the worktree with `worktree-id`."
  [user-id     :- ms/PositiveInt
   worktree-id :- ms/PositiveInt]
  (t2/insert! :model/RemoteSyncWorktreeUser {:user_id user-id :worktree_id worktree-id}))

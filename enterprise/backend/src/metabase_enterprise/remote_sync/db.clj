(ns metabase-enterprise.remote-sync.db
  "Application database queries for the remote sync module, each a direct Toucan 2 call, so that no other namespace of
  the module runs a query itself."
  (:require
   [metabase-enterprise.remote-sync.schema :as remote-sync.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn row
  "The row of `model` with the primary key `pk`, or nil."
  [model :- :keyword
   pk    :- [:or :int :string]]
  (t2/select-one model (first (t2/primary-keys model)) pk))

(mu/defn synced-rows
  "The rows of `model` remote sync syncs, ordered by primary key."
  [model :- :keyword]
  (let [pk (first (t2/primary-keys model))]
    (t2/select model pk [:in (remote-sync/synced-ids-clause model)] {:order-by [[pk :asc]]})))

(mu/defn synced-count :- :int
  "The number of rows of `model` remote sync syncs."
  [model :- :keyword]
  (t2/count model (first (t2/primary-keys model)) [:in (remote-sync/synced-ids-clause model)]))

(mu/defn delete-rows!
  "Deletes the rows of `model` with the primary keys `pks`, running its hooks."
  [model :- :keyword
   pks   :- [:sequential [:or :int :string]]]
  (t2/delete! model (first (t2/primary-keys model)) [:in pks]))

(mu/defn built-in-entity-ids :- [:set :string]
  "Those of the `entity-ids` of rows of `model` that every instance has."
  [model      :- :keyword
   entity-ids :- [:sequential :string]]
  (if (seq entity-ids)
    (into #{}
          (map :entity_id)
          (t2/query {:select [:row.entity_id]
                     :from   [[(t2/table-name model) :row]]
                     :where  [:and [:in :row.entity_id entity-ids] (remote-sync/built-in-filter-clause model :row)]}))
    #{}))

(mu/defn rows-not-built-in
  "The rows of `model` with the primary keys `pks` that not every instance has."
  [model :- :keyword
   pks   :- [:sequential [:or :int :string]]]
  (if (seq pks)
    (let [pk (u/qualified-key :row (first (t2/primary-keys model)))]
      (t2/select [model :row.*] {:from  [[(t2/table-name model) :row]]
                                 :where [:and [:in pk pks] [:not (remote-sync/built-in-filter-clause model :row)]]}))
    []))

(mu/defn collections
  "The Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select :model/Collection :id [:in collection-ids]))

(mu/defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn synced-card-counts-by-type :- [:map-of :keyword :int]
  "The number of Cards remote sync syncs, by `:type`."
  []
  (t2/select-fn->fn :type :count [:model/Card :type [:%count.* :count]]
                    :id [:in (remote-sync/synced-ids-clause :model/Card)]
                    {:group-by [:type]}))

(mu/defn task
  "The RemoteSyncTask with `task-id`, or nil."
  [task-id :- ms/PositiveInt]
  (t2/select-one :model/RemoteSyncTask :id [:auto/param task-id]))

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

(mu/defn delete-tasks-started-before!
  "Delete the RemoteSyncTasks started before `cutoff` but the one with `kept-id`, returning the number deleted."
  [cutoff  :- ms/TemporalInstant
   kept-id :- [:maybe ms/PositiveInt]]
  (t2/delete! :model/RemoteSyncTask {:where [:and [:< :started_at cutoff] [:not= :id kept-id]]}))

(mu/defn users-by-id
  "A map of User ID to User for `user-ids`."
  [user-ids :- [:sequential [:maybe ::lib.schema.id/user]]]
  (t2/select-pk->fn identity :model/User :id [:in user-ids]))

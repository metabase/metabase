(ns metabase-enterprise.remote-sync.db
  "Application database queries for the remote sync module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase-enterprise.remote-sync.schema :as remote-sync.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn row
  "The row of `model` with the primary key `pk`, or nil."
  [model :- :keyword
   pk    :- [:or :int :string]]
  (t2/select-one model (first (t2/primary-keys model)) pk))

(mu/defn rows-in
  "The rows of `model` whose primary keys `pks-query`, a HoneySQL query, selects, ordered by primary key."
  [model     :- :keyword
   pks-query :- [:fn map?]]
  (let [pk (first (t2/primary-keys model))]
    (t2/select model pk [:in pks-query] {:order-by [[pk :asc]]})))

(mu/defn count-in :- :int
  "The number of rows of `model` whose primary keys `pks-query`, a HoneySQL query, selects."
  [model     :- :keyword
   pks-query :- [:fn map?]]
  (t2/count model (first (t2/primary-keys model)) [:in pks-query]))

(mu/defn pks-where
  "The set of those of `pks` whose rows of `model`, aliased `:row`, match `clause`."
  [model  :- :keyword
   pks    :- [:sequential [:or :int :string]]
   clause :- [:fn vector?]]
  (let [pk (first (t2/primary-keys model))]
    (into #{}
          (map pk)
          (t2/query {:select [[(keyword "row" (name pk)) pk]]
                     :from   [[(t2/table-name model) :row]]
                     :where  [:and [:in (keyword "row" (name pk)) (vec pks)] clause]}))))

(mu/defn delete-rows!
  "Deletes the rows of `model` with the primary keys `pks`, running its hooks."
  [model :- :keyword
   pks   :- [:sequential [:or :int :string]]]
  (t2/delete! model (first (t2/primary-keys model)) [:in pks]))

(mu/defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn synced-card-counts-by-type :- [:map-of :keyword :int]
  "The number of Cards whose ids `synced-ids`, a HoneySQL query, selects, by `:type`."
  [synced-ids :- [:fn map?]]
  (t2/select-fn->fn :type :count [:model/Card :type [:%count.* :count]] :id [:in synced-ids] {:group-by [:type]}))

(mu/defn task
  "The RemoteSyncTask with `task-id`, or nil."
  [task-id :- ms/PositiveInt]
  (t2/select-one :model/RemoteSyncTask :id [:auto/param task-id]))

(mu/defn lock-task
  "The RemoteSyncTask with `task-id`, locked for update, or nil."
  [task-id :- ms/PositiveInt]
  (t2/select-one :model/RemoteSyncTask :id task-id {:for :update}))

(mu/defn task-cancelled?
  "The cancelled flag of the RemoteSyncTask with `task-id`."
  [task-id :- ms/PositiveInt]
  (t2/select-one-fn :cancelled :model/RemoteSyncTask :id task-id))

(def ^:private last-alive-at
  "The time the task's owning thread last proved it was alive: its heartbeat, or its last progress write for
  rows that predate the heartbeat column or whose worker died before its first beat."
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
  "The newest RemoteSyncTask whose commit the local content matches, or nil. `version` is written inside the
  transaction that commits an import or a push, and by the conflict path (which also writes `conflicts`), so
  `version` set with `conflicts` null identifies a landed commit whatever `ended_at`, `cancelled`, or
  `error_message` say: a task cancelled or superseded after its transaction committed is still the sync base."
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
  "Stamp the heartbeat time of the RemoteSyncTask with `task-id` if it has not ended, returning the number of rows
  updated. Never touches an ended row, so a cancel or supersede is not undone by a late beat."
  [task-id :- ms/PositiveInt]
  (t2/update! :model/RemoteSyncTask {:id task-id, :ended_at nil} {:last_heartbeat_at :%now}))

(mu/defn supersede-stale-tasks! :- [:sequential ms/PositiveInt]
  "Cancel and end now, with `message` as the error message, the started, unfinished RemoteSyncTasks whose owner
  was last alive before `cutoff`. Returns the ids of the rows ended, empty when none were stale."
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
  "Delete the RemoteSyncTasks started before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (t2/delete! :model/RemoteSyncTask {:where [:< :started_at cutoff]}))

(mu/defn users-by-id
  "A map of User ID to User for `user-ids`."
  [user-ids :- [:sequential [:maybe ::lib.schema.id/user]]]
  (t2/select-pk->fn identity :model/User :id [:in user-ids]))

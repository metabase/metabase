(ns metabase.task-history.db
  "Application database queries for the task history module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.task-history.schema :as task-history.schema]
   [metabase.toucan.core :as t2]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(mu/defn database-names-by-id
  "A map of id to name for the Databases with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select-pk->fn :name :model/Database :id [:in ids]))

(mu/defn card-names-by-id
  "A map of id to name for the Cards with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select-pk->fn :name :model/Card :id [:in ids]))

(mu/defn dashboard-names-by-id
  "A map of id to name for the Dashboards with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select-pk->fn :name :model/Dashboard :id [:in ids]))

(mu/defn task-counts-for-runs
  "The total, successful, and failed TaskHistory counts of the TaskRuns with `run-ids`, grouped by run."
  [run-ids :- [:sequential ms/PositiveInt]]
  (t2/query {:select   [:run_id
                        [[:count :id] :task_count]
                        [[:sum [:case [:= :status "success"] [:inline 1] :else [:inline 0]]] :success_count]
                        [[:sum [:case [:= :status "failed"] [:inline 1] :else [:inline 0]]] :failed_count]]
             :from     :task_history
             :where    [:in :run_id run-ids]
             :group-by [:run_id]}))

(defn- run-where
  "The `:where` for the TaskRuns matching `filters`, with qualified columns because the entity_name/task_count sorts add
  joins whose tables may share column names (e.g. report_card.entity_id)."
  [{:keys [run-type entity-type entity-id status started-at-start started-at-end]}]
  (t2/fragment [:and
                (when run-type (t2/fragment [:= :task_run.run_type run-type]))
                (when entity-type (t2/fragment [:= :task_run.entity_type entity-type]))
                (when entity-id (t2/fragment [:= :task_run.entity_id entity-id]))
                (when status (t2/fragment [:= :task_run.status status]))
                (when started-at-start (t2/fragment [:>= :task_run.started_at started-at-start]))
                (when started-at-end (t2/fragment [:< :task_run.started_at started-at-end]))]))

(defn- runs-left-join
  "The `:left-join` the TaskRuns list needs to sort by `sort-column`: `:entity_name` LEFT JOINs the three entity tables
  and `:task_count` LEFT JOINs a grouped `task_history` subquery."
  [sort-column]
  (case sort-column
    :entity_name
    (t2/fragment [[:metabase_database :sort_db]
                  [:and [:= :task_run.entity_type "database"]  [:= :task_run.entity_id :sort_db.id]]
                  [:report_card :sort_card]
                  [:and [:= :task_run.entity_type "card"]      [:= :task_run.entity_id :sort_card.id]]
                  [:report_dashboard :sort_dash]
                  [:and [:= :task_run.entity_type "dashboard"] [:= :task_run.entity_id :sort_dash.id]]])

    :task_count
    (t2/fragment [[^:allow-subquery {:select   [:run_id [[:count :*] :task_count]]
                                     :from     [:task_history]
                                     :group-by [:run_id]}
                   :sort_tc]
                  [:= :sort_tc.run_id :task_run.id]])

    (t2/fragment [])))

(defn- runs-sort-item
  "The `:order-by` item sorting the TaskRuns list by `sort-column`, descending when `desc?`."
  [sort-column desc?]
  (case sort-column
    :entity_name (if desc?
                   (t2/fragment [[:coalesce :sort_db.name :sort_card.name :sort_dash.name] :desc])
                   (t2/fragment [[:coalesce :sort_db.name :sort_card.name :sort_dash.name] :asc]))
    :task_count  (if desc?
                   (t2/fragment [[:coalesce :sort_tc.task_count [:inline 0]] :desc])
                   (t2/fragment [[:coalesce :sort_tc.task_count [:inline 0]] :asc]))
    :started_at  (if desc? (t2/fragment [:started_at :desc]) (t2/fragment [:started_at :asc]))
    :ended_at    (if desc? (t2/fragment [:ended_at :desc]) (t2/fragment [:ended_at :asc]))
    :run_type    (if desc? (t2/fragment [:run_type :desc]) (t2/fragment [:run_type :asc]))
    :status      (if desc? (t2/fragment [:status :desc]) (t2/fragment [:status :asc]))))

(def ^:private RunFilters
  [:map {:closed true}
   [:run-type          [:maybe :string]]
   [:entity-type       [:maybe :string]]
   [:entity-id         [:maybe ms/PositiveInt]]
   [:status            [:maybe [:or :keyword :string]]]
   [:started-at-start  [:maybe ms/TemporalInstant]]
   [:started-at-end    [:maybe ms/TemporalInstant]]])

(mu/defn task-runs
  "Up to `limit` (offset by `offset`) TaskRuns matching `filters` (see [[run-where]] for the supported keys), sorted
  by `sort-column`/`sort-direction`."
  [filters        :- RunFilters
   sort-column    :- [:enum :started_at :ended_at :run_type :status :entity_name :task_count]
   sort-direction :- [:enum :asc :desc]
   limit          :- [:maybe ms/PositiveInt]
   offset         :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select :model/TaskRun
             {:select    [:task_run.*]
              :left-join (runs-left-join sort-column)
              :where     (run-where filters)
              :order-by  [(runs-sort-item sort-column (= sort-direction :desc)) [:task_run.id :desc]]
              :limit     (or limit Integer/MAX_VALUE)
              :offset    (or offset 0)}))

(mu/defn task-run-count
  "The number of TaskRuns matching `filters` (see [[run-where]] for the supported keys)."
  [filters :- RunFilters]
  (t2/count :model/TaskRun {:where (run-where filters)}))

(mu/defn task-run
  "The TaskRun with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/TaskRun :id id))

(mu/defn tasks-for-run
  "The TaskHistory rows of the TaskRun with `run-id`, oldest first."
  [run-id :- ms/PositiveInt]
  (t2/select :model/TaskHistory :run_id run-id {:order-by [[:started_at :asc]]}))

(mu/defn distinct-run-entities
  "The distinct entity type and id of the TaskRuns of `run-type` started in [`started-at-start`, `started-at-end`)."
  [run-type          :- :string
   started-at-start  :- [:maybe ms/TemporalInstant]
   started-at-end    :- [:maybe ms/TemporalInstant]]
  (t2/query {:select-distinct [:entity_type :entity_id]
             :from            :task_run
             :where           [:and
                               [:= :run_type run-type]
                               (when started-at-start (t2/fragment [:>= :started_at started-at-start]))
                               (when started-at-end (t2/fragment [:< :started_at started-at-end]))]}))

(mu/defn nth-newest-task-history-ended-at
  "The `ended_at` of the TaskHistory row `offset` rows from the most recently ended, or nil."
  [offset :- ms/IntGreaterThanOrEqualToZero]
  (t2/select-one-fn :ended_at :model/TaskHistory {:limit    1
                                                  :offset   offset
                                                  :order-by [[:ended_at :desc]]}))

(mu/defn delete-task-history-ended-before!
  "Delete the TaskHistory rows that ended at or before `ended-before`."
  [ended-before :- ms/TemporalInstant]
  (t2/delete! (t2/table-name :model/TaskHistory) :ended_at [:<= ended-before]))

(defn- task-history-where
  "The `:where` for the TaskHistory rows narrowed to `status` and/or `task`, with qualified columns so filters stay
  unambiguous when the db_name/db_engine sorts join metabase_database."
  [status task]
  (t2/fragment [:and
                (when task (t2/fragment [:= :task_history.task task]))
                (when status (t2/fragment [:= :task_history.status (name status)]))]))

(defn- task-histories-left-join
  "The `:left-join` the TaskHistory list needs to sort by `sort-column`: `:db_name` and `:db_engine` LEFT JOIN
  `metabase_database`."
  [sort-column]
  (case sort-column
    (:db_name :db_engine) (t2/fragment [:metabase_database [:= :task_history.db_id :metabase_database.id]])
    (t2/fragment [])))

(defn- task-histories-sort-item
  "The `:order-by` item sorting the TaskHistory list by `sort-column`, descending when `desc?`."
  [sort-column desc?]
  (case sort-column
    :db_name    (if desc? (t2/fragment [:metabase_database.name :desc]) (t2/fragment [:metabase_database.name :asc]))
    :db_engine  (if desc? (t2/fragment [:metabase_database.engine :desc]) (t2/fragment [:metabase_database.engine :asc]))
    :started_at (if desc? (t2/fragment [:started_at :desc]) (t2/fragment [:started_at :asc]))
    :ended_at   (if desc? (t2/fragment [:ended_at :desc]) (t2/fragment [:ended_at :asc]))
    :duration   (if desc? (t2/fragment [:duration :desc]) (t2/fragment [:duration :asc]))
    :task       (if desc? (t2/fragment [:task :desc]) (t2/fragment [:task :asc]))
    :status     (if desc? (t2/fragment [:status :desc]) (t2/fragment [:status :asc]))))

(mu/defn task-histories
  "Up to `limit` (offset by `offset`) TaskHistory rows, optionally narrowed to `status` and/or `task`, sorted by
  `sort-column` (an allow-listed column, joining to Database for `:db_name`/`:db_engine`) and `sort-direction`, with
  `:id desc` as a stable tiebreaker."
  [status         :- [:maybe [:enum :started :success :failed :unknown]]
   task           :- [:maybe ms/NonBlankString]
   sort-column    :- [:enum :started_at :ended_at :duration :task :status :db_name :db_engine]
   sort-direction :- [:enum :asc :desc]
   limit          :- [:maybe ms/PositiveInt]
   offset         :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select :model/TaskHistory
             {:select    [:task_history.*]
              :left-join (task-histories-left-join sort-column)
              :where     (task-history-where status task)
              :order-by  [(task-histories-sort-item sort-column (= sort-direction :desc)) [:task_history.id :desc]]
              :limit     (or limit Integer/MAX_VALUE)
              :offset    (or offset 0)}))

(mu/defn task-history-count
  "The number of TaskHistory rows, optionally narrowed to `status` and/or `task`."
  [status :- [:maybe [:enum :started :success :failed :unknown]]
   task   :- [:maybe ms/NonBlankString]]
  (t2/count :model/TaskHistory {:where (task-history-where status task)}))

(mu/defn distinct-task-names
  "The distinct task names of the TaskHistory rows, in alphabetical order."
  []
  (t2/select-fn-vec :task [:model/TaskHistory :task] {:group-by [:task]
                                                      :order-by [:task]}))

(mu/defn update-task-history!
  "Apply `changes` to the TaskHistory row with `id`."
  [id      :- ms/PositiveInt
   changes :- ::task-history.schema/task-history.update]
  (t2/update! :model/TaskHistory :id id changes))

(mu/defn insert-task-history!
  "Insert the TaskHistory `row` and return its id."
  [row :- ::task-history.schema/task-history.update]
  (t2/insert-returning-pk! :model/TaskHistory row))

(mu/defn insert-task-run!
  "Insert the TaskRun `row` and return its id."
  [row :- ::task-history.schema/task-run.update]
  (t2/insert-returning-pk! :model/TaskRun row))

(mu/defn task-statuses-for-run
  "The set of statuses of the TaskHistory rows of the TaskRun with `run-id`."
  [run-id :- ms/PositiveInt]
  (t2/select-fn-set :status :model/TaskHistory :run_id run-id))

(mu/defn finish-started-task-run!
  "Set the status and end time of the started TaskRun with `run-id`."
  [run-id   :- ms/PositiveInt
   status   :- :keyword
   ended-at :- ms/TemporalInstant]
  (t2/update! :model/TaskRun {:id run-id :status :started} {:status status, :ended_at ended-at}))

(mu/defn heartbeat-started-task-runs!
  "Touch `updated_at` of the started TaskRuns of `process-uuid` with the app DB's now, returning the number updated."
  [process-uuid :- :string]
  (t2/update! :model/TaskRun {:status :started, :process_uuid process-uuid} {:updated_at :%now}))

(mu/defn mark-started-tasks-unknown!
  "Set the started TaskHistory rows of the TaskRuns with `run-ids` to unknown, ended at the app DB's now, returning
  the number updated."
  [run-ids :- [:set ms/PositiveInt]]
  (t2/update! :model/TaskHistory
              {:status :started, :run_id [:in run-ids]}
              {:status :unknown, :ended_at :%now}))

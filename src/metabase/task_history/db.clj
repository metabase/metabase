(ns metabase.task-history.db
  "Application database queries for the task history module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as mdb]
   [metabase.run-tracking.core :as rt]
   [metabase.task-history.schema :as task-history.schema]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn database-names-by-id
  "A map of id to name for the Databases with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched-map #(t2/select-pk->fn :name :model/Database :id [:in %]) ids))

(mu/defn card-names-by-id
  "A map of id to name for the Cards with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched-map #(t2/select-pk->fn :name :model/Card :id [:in %]) ids))

(mu/defn dashboard-names-by-id
  "A map of id to name for the Dashboards with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched-map #(t2/select-pk->fn :name :model/Dashboard :id [:in %]) ids))

(mu/defn task-counts-for-runs
  "The total, successful, and failed TaskHistory counts of the TaskRuns with `run-ids`, grouped by run."
  [run-ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/query {:select   [:run_id
                                             [[:count :id] :task_count]
                                             [[:sum [:case [:= :status (h2x/literal "success")] [:inline 1] :else [:inline 0]]] :success_count]
                                             [[:sum [:case [:= :status (h2x/literal "failed")] [:inline 1] :else [:inline 0]]] :failed_count]]
                                  :from     (t2/table-name :model/TaskHistory)
                                  :where    [:in :run_id %]
                                  :group-by [:run_id]})
                      run-ids))

(defn- run-where
  ;; columns are qualified because the entity_name/task_count sorts add joins whose tables may share column names
  ;; (e.g. report_card.entity_id)
  [{:keys [run-type entity-type entity-id status started-at-start started-at-end]}]
  (let [conditions (cond-> []
                     run-type          (conj [:= (u/qualified-key (t2/table-name :model/TaskRun) :run_type) run-type])
                     entity-type       (conj [:= (u/qualified-key (t2/table-name :model/TaskRun) :entity_type) entity-type])
                     entity-id         (conj [:= (u/qualified-key (t2/table-name :model/TaskRun) :entity_id) entity-id])
                     status            (conj [:= (u/qualified-key (t2/table-name :model/TaskRun) :status) status])
                     started-at-start  (conj [:>= (u/qualified-key (t2/table-name :model/TaskRun) :started_at) started-at-start])
                     started-at-end    (conj [:< (u/qualified-key (t2/table-name :model/TaskRun) :started_at) started-at-end]))]
    (when (seq conditions)
      {:where (into [:and] conditions)})))

(defn- runs-order-by
  "Build the honeysql fragment used to order the task runs list. Direct columns order in place; `:entity_name`
  LEFT JOINs the three entity tables and orders by the coalesced name; `:task_count` LEFT JOINs a grouped
  `task_history` subquery. Derived-column variants keep the selected shape to `task_run.*` and add a
  deterministic `[:id :desc]` secondary key."
  [sort-column sort-direction]
  (let [secondary [(u/qualified-key (t2/table-name :model/TaskRun) :id) :desc]]
    (case sort-column
      :entity_name
      {:select    [(u/qualified-key (t2/table-name :model/TaskRun) :*)]
       :left-join [[(t2/table-name :model/Database) :sort_db]
                   [:and [:= (u/qualified-key (t2/table-name :model/TaskRun) :entity_type) "database"]  [:= (u/qualified-key (t2/table-name :model/TaskRun) :entity_id) :sort_db.id]]
                   [(t2/table-name :model/Card) :sort_card]
                   [:and [:= (u/qualified-key (t2/table-name :model/TaskRun) :entity_type) "card"]      [:= (u/qualified-key (t2/table-name :model/TaskRun) :entity_id) :sort_card.id]]
                   [(t2/table-name :model/Dashboard) :sort_dash]
                   [:and [:= (u/qualified-key (t2/table-name :model/TaskRun) :entity_type) "dashboard"] [:= (u/qualified-key (t2/table-name :model/TaskRun) :entity_id) :sort_dash.id]]]
       :order-by  [[[:coalesce :sort_db.name :sort_card.name :sort_dash.name] sort-direction] secondary]}

      :task_count
      {:select    [(u/qualified-key (t2/table-name :model/TaskRun) :*)]
       :left-join [[^:allow-subquery {:select   [:run_id [[:count :*] :task_count]]
                                      :from     [(t2/table-name :model/TaskHistory)]
                                      :group-by [:run_id]}
                    :sort_tc]
                   [:= :sort_tc.run_id (u/qualified-key (t2/table-name :model/TaskRun) :id)]]
       :order-by  [[[:coalesce :sort_tc.task_count [:inline 0]] sort-direction] secondary]}

      {:order-by [[sort-column sort-direction] secondary]})))

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
             (h2x/assert-map-or-nil!
              (cond-> (merge (run-where filters) (runs-order-by sort-column sort-direction))
                limit  (assoc :limit limit)
                offset (assoc :offset offset)))))

(mu/defn task-run-count
  "The number of TaskRuns matching `filters` (see [[run-where]] for the supported keys)."
  [filters :- RunFilters]
  (t2/count :model/TaskRun (h2x/assert-map-or-nil! (or (run-where filters) {}))))

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
             :from            (t2/table-name :model/TaskRun)
             :where           (into [:and [:= :run_type run-type]]
                                    (keep identity)
                                    [(when started-at-start [:>= :started_at started-at-start])
                                     (when started-at-end [:< :started_at started-at-end])])}))

(mu/defn nth-newest-task-history-ended-at
  "The `ended_at` of the TaskHistory row `offset` rows from the most recently ended, or nil."
  [offset :- ms/IntGreaterThanOrEqualToZero]
  (t2/select-one-fn :ended_at :model/TaskHistory {:limit    1
                                                  :offset   offset
                                                  :order-by [[:ended_at :desc]]}))

(mu/defn task-history-ids-ended-before :- [:sequential ms/PositiveInt]
  "The ids of the TaskHistory rows that ended at or before `ended-before`."
  [ended-before :- ms/TemporalInstant]
  (vec (t2/select-pks-vec :model/TaskHistory :ended_at [:<= ended-before])))

(defn- join-sort-columns
  "Sort columns that require a LEFT JOIN to `metabase_database`, mapped to the joined column to order by."
  []
  {:db_name   (u/qualified-key (t2/table-name :model/Database) :name)
   :db_engine (u/qualified-key (t2/table-name :model/Database) :engine)})

(defn- task-history-where
  ;; qualified so filters stay unambiguous when the db_name/db_engine sorts join metabase_database
  [status task]
  (when (or status task)
    (cond-> [:and]
      task   (conj [:= (u/qualified-key (t2/table-name :model/TaskHistory) :task) task])
      status (conj [:= (u/qualified-key (t2/table-name :model/TaskHistory) :status) (name status)]))))

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
             (cond-> (if-let [where (task-history-where status task)]
                       {:where where}
                       {})
               ((join-sort-columns) sort-column)
               (merge {:select    [(u/qualified-key (t2/table-name :model/TaskHistory) :*)]
                       :left-join [(t2/table-name :model/Database) [:= (u/qualified-key (t2/table-name :model/TaskHistory) :db_id) (u/qualified-key (t2/table-name :model/Database) :id)]]
                       :order-by  [[((join-sort-columns) sort-column) sort-direction] [(u/qualified-key (t2/table-name :model/TaskHistory) :id) :desc]]})

               (not ((join-sort-columns) sort-column))
               (assoc :order-by [[sort-column sort-direction] [:id :desc]])

               limit  (assoc :limit limit)
               offset (assoc :offset offset))))

(mu/defn task-history-count
  "The number of TaskHistory rows, optionally narrowed to `status` and/or `task`."
  [status :- [:maybe [:enum :started :success :failed :unknown]]
   task   :- [:maybe ms/NonBlankString]]
  (t2/count :model/TaskHistory (if-let [where (task-history-where status task)] {:where where} {})))

(mu/defn distinct-task-names
  "The distinct task names of the TaskHistory rows, in alphabetical order."
  []
  (t2/select-fn-vec :task [:model/TaskHistory :task] {:group-by [:task]
                                                      :order-by [:task]}))

(defn- now-clause
  "A HoneySQL form for the app DB's time at the start of the statement, which unlike `now()` on Postgres moves on
  inside a transaction."
  []
  (case (mdb/db-type)
    :postgres :%statement_timestamp
    (h2x/current-datetime-honeysql-form (mdb/db-type))))

(defn- duration-clause
  "A HoneySQL form for the whole milliseconds, never negative, from the stored `started_at` of a TaskHistory row to the
  database's now, which within one statement is the same instant as the `ended_at` it sets."
  []
  (let [db-type (mdb/db-type)
        now     (now-clause)]
    [:greatest
     [:inline 0]
     (case db-type
       :postgres [:cast [:floor [:* [:inline 1000] [::h2x/extract :epoch [:- now :started_at]]]] :integer]
       :mysql    [:floor [:/ [::h2x/timestampdiff :microsecond :started_at now] [:inline 1000]]]
       :h2       [:datediff (h2x/literal "millisecond") :started_at now])]))

(mu/defn end-task-history!
  "Record the end of the TaskHistory row with `id` with `changes`: `ended_at` is the database's now and `duration` the
  milliseconds since its `started_at`, unless `changes` gives them."
  [id      :- ms/PositiveInt
   changes :- (mut/dissoc ::task-history.schema/task-history.update :started_at)]
  (t2/update! :model/TaskHistory :id id (merge {:ended_at (now-clause)
                                                :duration (duration-clause)}
                                               changes)))

(mu/defn insert-task-history!
  "Insert the TaskHistory `row`, started at the database's now unless it gives `started_at`, and return its id."
  [row :- ::task-history.schema/task-history.update]
  (t2/insert-returning-pk! :model/TaskHistory
                           (merge {:started_at (now-clause)} row)))

(mu/defn insert-task-run!
  "Insert the TaskRun `row` and return its id."
  [row :- ::task-history.schema/task-run.update]
  (t2/insert-returning-pk! :model/TaskRun row))

(mu/defn task-statuses-for-run
  "The set of statuses of the TaskHistory rows of the TaskRun with `run-id`."
  [run-id :- ms/PositiveInt]
  (t2/select-fn-set :status :model/TaskHistory :run_id run-id))

(mu/defn finish-started-task-run!
  "Set the status of the started TaskRun with `run-id` and its end time to the database's now, the clock that set its
  start."
  [run-id :- ms/PositiveInt
   status :- :keyword]
  (t2/update! :model/TaskRun {:id run-id :status :started} {:status   status
                                                            :ended_at (now-clause)}))

(mu/defn heartbeat-started-task-runs!
  "Touch `updated_at` of the started TaskRuns of `process-uuid` with the app DB's now, returning the number updated."
  [process-uuid :- :string]
  (t2/update! :model/TaskRun {:status :started, :process_uuid process-uuid} {:updated_at :%now}))

(mu/defn mark-started-tasks-unknown!
  "Set the started TaskHistory rows of the TaskRuns with `run-ids` to unknown, ended at the app DB's now, returning
  the number updated."
  [run-ids :- [:set ms/PositiveInt]]
  (mdb/sum-batched mdb/update-partition-size #(t2/update! :model/TaskHistory
                                                          {:status :started, :run_id [:in %]}
                                                          {:status :unknown, :ended_at :%now}) run-ids))

(mu/defn set-started-task-runs-terminal!
  "Apply the `terminal` column values to the started TaskRuns with `run-ids`, returning the number updated."
  [run-ids  :- [:sequential ms/PositiveInt]
   terminal :- [:map {:closed true}
                [:status    {:optional true} [:maybe [:or :string :keyword]]]
                [:end_time  {:optional true} [:maybe [:or :string :keyword]]]
                [:ended_at  {:optional true} [:maybe [:or :string :keyword]]]
                [:is_active {:optional true} [:maybe :boolean]]
                [:message   {:optional true} [:maybe :string]]]]
  [(mdb/sum-batched mdb/update-partition-size #(first (t2/query (rt/terminal-statement :model/TaskRun [:status "started"] % terminal))) run-ids)])

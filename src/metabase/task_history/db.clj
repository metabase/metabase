(ns metabase.task-history.db
  "Application database queries for the task history module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn database-names-by-id
  "A map of id to name for the Databases with `ids`."
  [ids]
  (t2/select-pk->fn :name :model/Database :id [:in ids]))

(defn card-names-by-id
  "A map of id to name for the Cards with `ids`."
  [ids]
  (t2/select-pk->fn :name :model/Card :id [:in ids]))

(defn dashboard-names-by-id
  "A map of id to name for the Dashboards with `ids`."
  [ids]
  (t2/select-pk->fn :name :model/Dashboard :id [:in ids]))

(defn task-counts-for-runs
  "The total, successful, and failed TaskHistory counts of the TaskRuns with `run-ids`, grouped by run."
  [run-ids]
  (t2/query {:select   [:run_id
                        [[:count :id] :task_count]
                        [[:sum [:case [:= :status [:metabase.util.honey-sql-2/literal "success"]] [:inline 1] :else [:inline 0]]] :success_count]
                        [[:sum [:case [:= :status [:metabase.util.honey-sql-2/literal "failed"]] [:inline 1] :else [:inline 0]]] :failed_count]]
             :from     :task_history
             :where    [:in :run_id run-ids]
             :group-by [:run_id]}))

(defn- run-where
  ;; columns are qualified because the entity_name/task_count sorts add joins whose tables may share column names
  ;; (e.g. report_card.entity_id)
  [{:keys [run-type entity-type entity-id status started-at-start started-at-end]}]
  (let [conditions (cond-> []
                     run-type          (conj [:= :task_run.run_type run-type])
                     entity-type       (conj [:= :task_run.entity_type entity-type])
                     entity-id         (conj [:= :task_run.entity_id entity-id])
                     status            (conj [:= :task_run.status status])
                     started-at-start  (conj [:>= :task_run.started_at started-at-start])
                     started-at-end    (conj [:< :task_run.started_at started-at-end]))]
    (when (seq conditions)
      {:where (into [:and] conditions)})))

(defn- runs-order-by
  "Build the honeysql fragment used to order the task runs list. Direct columns order in place; `:entity_name`
  LEFT JOINs the three entity tables and orders by the coalesced name; `:task_count` LEFT JOINs a grouped
  `task_history` subquery. Derived-column variants keep the selected shape to `task_run.*` and add a
  deterministic `[:id :desc]` secondary key."
  [sort-column sort-direction]
  (let [secondary [:task_run.id :desc]]
    (case sort-column
      :entity_name
      {:select    [:task_run.*]
       :left-join [[:metabase_database :sort_db]
                   [:and [:= :task_run.entity_type "database"]  [:= :task_run.entity_id :sort_db.id]]
                   [:report_card :sort_card]
                   [:and [:= :task_run.entity_type "card"]      [:= :task_run.entity_id :sort_card.id]]
                   [:report_dashboard :sort_dash]
                   [:and [:= :task_run.entity_type "dashboard"] [:= :task_run.entity_id :sort_dash.id]]]
       :order-by  [[[:coalesce :sort_db.name :sort_card.name :sort_dash.name] sort-direction] secondary]}

      :task_count
      {:select    [:task_run.*]
       :left-join [[^:allow-subquery {:select   [:run_id [[:count :*] :task_count]]
                                      :from     [:task_history]
                                      :group-by [:run_id]}
                    :sort_tc]
                   [:= :sort_tc.run_id :task_run.id]]
       :order-by  [[[:coalesce :sort_tc.task_count [:inline 0]] sort-direction] secondary]}

      {:order-by [[sort-column sort-direction] secondary]})))

(defn task-runs
  "Up to `limit` (offset by `offset`) TaskRuns matching `filters` (see [[run-where]] for the supported keys), sorted
  by `sort-column`/`sort-direction`."
  [filters sort-column sort-direction limit offset]
  (t2/select :model/TaskRun
             (cond-> (merge (run-where filters) (runs-order-by sort-column sort-direction))
               limit  (assoc :limit limit)
               offset (assoc :offset offset))))

(defn task-run-count
  "The number of TaskRuns matching `filters` (see [[run-where]] for the supported keys)."
  [filters]
  (t2/count :model/TaskRun (or (run-where filters) {})))

(defn task-run
  "The TaskRun with `id`, or nil."
  [id]
  (t2/select-one :model/TaskRun :id id))

(defn tasks-for-run
  "The TaskHistory rows of the TaskRun with `run-id`, oldest first."
  [run-id]
  (t2/select :model/TaskHistory :run_id run-id {:order-by [[:started_at :asc]]}))

(defn distinct-run-entities
  "The distinct entity type and id of the TaskRuns of `run-type` started in [`started-at-start`, `started-at-end`)."
  [run-type started-at-start started-at-end]
  (t2/query {:select-distinct [:entity_type :entity_id]
             :from            :task_run
             :where           (into [:and [:= :run_type run-type]]
                                    (keep identity)
                                    [(when started-at-start [:>= :started_at started-at-start])
                                     (when started-at-end [:< :started_at started-at-end])])}))

(defn nth-newest-task-history-ended-at
  "The `ended_at` of the TaskHistory row `offset` rows from the most recently ended, or nil."
  [offset]
  (t2/select-one-fn :ended_at :model/TaskHistory {:limit    1
                                                  :offset   offset
                                                  :order-by [[:ended_at :desc]]}))

(defn delete-task-history-ended-before!
  "Delete the TaskHistory rows that ended at or before `ended-before`."
  [ended-before]
  (t2/delete! (t2/table-name :model/TaskHistory) :ended_at [:<= ended-before]))

(def ^:private join-sort-columns
  "Sort columns that require a LEFT JOIN to `metabase_database`, mapped to the joined column to order by."
  {:db_name   :metabase_database.name
   :db_engine :metabase_database.engine})

(defn- task-history-where
  ;; qualified so filters stay unambiguous when the db_name/db_engine sorts join metabase_database
  [status task]
  (when (or status task)
    (cond-> [:and]
      task   (conj [:= :task_history.task task])
      status (conj [:= :task_history.status (name status)]))))

(defn task-histories
  "Up to `limit` (offset by `offset`) TaskHistory rows, optionally narrowed to `status` and/or `task`, sorted by
  `sort-column` (an allow-listed column, joining to Database for `:db_name`/`:db_engine`) and `sort-direction`, with
  `:id desc` as a stable tiebreaker."
  [status task sort-column sort-direction limit offset]
  (t2/select :model/TaskHistory
             (cond-> (if-let [where (task-history-where status task)]
                       {:where where}
                       {})
               (join-sort-columns sort-column)
               (merge {:select    [:task_history.*]
                       :left-join [:metabase_database [:= :task_history.db_id :metabase_database.id]]
                       :order-by  [[(join-sort-columns sort-column) sort-direction] [:task_history.id :desc]]})

               (not (join-sort-columns sort-column))
               (assoc :order-by [[sort-column sort-direction] [:id :desc]])

               limit  (assoc :limit limit)
               offset (assoc :offset offset))))

(defn task-history-count
  "The number of TaskHistory rows, optionally narrowed to `status` and/or `task`."
  [status task]
  (t2/count :model/TaskHistory (if-let [where (task-history-where status task)] {:where where} {})))

(defn distinct-task-names
  "The distinct task names of the TaskHistory rows, in alphabetical order."
  []
  (t2/select-fn-vec :task [:model/TaskHistory :task] {:group-by [:task]
                                                      :order-by [:task]}))

(defn update-task-history!
  "Apply `changes` to the TaskHistory row with `id`."
  [id changes]
  (t2/update! :model/TaskHistory id changes))

(defn insert-task-history!
  "Insert the TaskHistory `row` and return its id."
  [row]
  (t2/insert-returning-pk! :model/TaskHistory row))

(defn insert-task-run!
  "Insert the TaskRun `row` and return its id."
  [row]
  (t2/insert-returning-pk! :model/TaskRun row))

(defn task-statuses-for-run
  "The set of statuses of the TaskHistory rows of the TaskRun with `run-id`."
  [run-id]
  (t2/select-fn-set :status :model/TaskHistory :run_id run-id))

(defn finish-started-task-run!
  "Set the status and end time of the started TaskRun with `run-id`."
  [run-id status ended-at]
  (t2/update! :model/TaskRun {:id run-id :status :started} {:status status, :ended_at ended-at}))

(defn heartbeat-started-task-runs!
  "Touch `updated_at` of the started TaskRuns of `process-uuid`, returning the number updated."
  [process-uuid updated-at]
  (t2/update! :model/TaskRun {:status :started, :process_uuid process-uuid} {:updated_at updated-at}))

(defn mark-started-tasks-unknown!
  "Set the started TaskHistory rows of the TaskRuns with `run-ids` to unknown, returning the number updated."
  [run-ids ended-at]
  (t2/update! :model/TaskHistory
              {:status :started, :run_id [:in run-ids]}
              {:status :unknown, :ended_at ended-at}))

(ns metabase.task-history.queries
  "Application database queries for the task history module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn names-by-id
  "A map of id to name for the `model` rows with `ids`."
  [model ids]
  (t2/select-pk->fn :name model :id [:in ids]))

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

(defn task-runs
  "The TaskRuns selected by the Honey SQL `query`."
  [query]
  (t2/select :model/TaskRun query))

(defn task-run-count
  "The number of TaskRuns selected by the Honey SQL `query`."
  [query]
  (t2/count :model/TaskRun query))

(defn task-run
  "The TaskRun with `id`, or nil."
  [id]
  (t2/select-one :model/TaskRun :id id))

(defn tasks-for-run
  "The TaskHistory rows of the TaskRun with `run-id`, oldest first."
  [run-id]
  (t2/select :model/TaskHistory :run_id run-id {:order-by [[:started_at :asc]]}))

(defn distinct-run-entities
  "The distinct entity type and id of the TaskRuns matching the Honey SQL `where` clause."
  [where]
  (t2/query {:select-distinct [:entity_type :entity_id]
             :from            :task_run
             :where           where}))

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

(defn task-histories
  "The TaskHistory rows selected by the Honey SQL `query`."
  [query]
  (t2/select :model/TaskHistory query))

(defn task-history-count
  "The number of TaskHistory rows selected by the Honey SQL `query`."
  [query]
  (t2/count :model/TaskHistory query))

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

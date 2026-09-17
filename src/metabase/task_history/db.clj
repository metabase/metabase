(ns metabase.task-history.db
  "Application database queries for the task history module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.task-history.schema :as task-history.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

;;; The queries below follow [[::task-history-opts]] / [[::task-run-opts]]; queries that do not fit them live in the
;;; task-history-only section at the bottom of this namespace.

(mr/def ::task-history-filters
  "Which TaskHistory rows a query applies to. Keys mirror the columns of `task_history`: a scalar matches that value
  and a set matches any of its values."
  [:map {:closed true}
   [:id     {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:run_id {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:status {:optional true} [:or :keyword :string]]])

(mr/def ::task-history-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::task-history-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::task-history.schema/task-history.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::task-history.schema/task-history.column
                                              [:tuple ::task-history.schema/task-history.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->task-history-model
  [columns]
  (u.query/model-with-columns :model/TaskHistory columns))

(defn- ->task-history-args
  [opts]
  (u.query/opts->args opts))

(mr/def ::task-run-filters
  "Which TaskRun rows a query applies to. Keys mirror the columns of `task_run`: a scalar matches that value and a
  set matches any of its values."
  [:map {:closed true}
   [:id           {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:status       {:optional true} [:or :keyword :string]]
   [:process_uuid {:optional true} :string]])

(mr/def ::task-run-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::task-run-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::task-history.schema/task-run.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::task-history.schema/task-run.column
                                              [:tuple ::task-history.schema/task-run.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->task-run-model
  [columns]
  (u.query/model-with-columns :model/TaskRun columns))

(defn- ->task-run-args
  [opts]
  (u.query/opts->args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-task-histories :- [:sequential ::task-history.schema/task-history.partial]
  "The TaskHistory rows matching `opts`."
  ([]
   (select-task-histories nil))
  ([{:keys [columns] :as opts} :- [:maybe ::task-history-opts]]
   (apply t2/select (->task-history-model columns) (->task-history-args opts))))

(mu/defn select-one-task-run :- [:maybe ::task-history.schema/task-run.partial]
  "The first TaskRun matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::task-run-opts]]
  (apply t2/select-one (->task-run-model columns) (->task-run-args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-task-history! :- ms/PositiveInt
  "Insert the TaskHistory `row` and return its id."
  [row :- ::task-history.schema/task-history.create]
  (t2/insert-returning-pk! :model/TaskHistory row))

(mu/defn update-task-histories! :- :int
  "Apply `changes` to every TaskHistory row matching `opts`, returning the number updated."
  [opts    :- [:maybe ::task-history-opts]
   changes :- ::task-history.schema/task-history.update]
  (apply t2/update! :model/TaskHistory (conj (u.query/opts->kv-args opts) changes)))

(mu/defn delete-task-history-ended-before! :- :int
  "Delete the TaskHistory rows that ended at or before `ended-before`, returning the number deleted."
  [ended-before :- ms/TemporalInstant]
  (t2/delete! (t2/table-name :model/TaskHistory) :ended_at [:<= ended-before]))

(mu/defn insert-task-run! :- ms/PositiveInt
  "Insert the TaskRun `row` and return its id."
  [row :- ::task-history.schema/task-run.create]
  (t2/insert-returning-pk! :model/TaskRun row))

(mu/defn update-task-runs! :- :int
  "Apply `changes` to every TaskRun matching `opts`, returning the number updated."
  [opts    :- [:maybe ::task-run-opts]
   changes :- ::task-history.schema/task-run.update]
  (apply t2/update! :model/TaskRun (conj (u.query/opts->kv-args opts) changes)))

;;; --------------------------------------- Queries used only by the task-history module ---------------------------------------

(mu/defn select-task-history-statuses-for-run :- [:set [:or :keyword :string]]
  "The distinct statuses of the TaskHistory rows of the TaskRun with `run-id`."
  [run-id :- ms/PositiveInt]
  (or (t2/select-fn-set :status :model/TaskHistory :run_id run-id) #{}))

(mu/defn distinct-task-names :- [:sequential :string]
  "The distinct task names of the TaskHistory rows, in alphabetical order."
  []
  (or (t2/select-fn-vec :task [:model/TaskHistory :task] {:group-by [:task]
                                                          :order-by [:task]})
      []))

(mu/defn card-names-by-id
  "A map of id to name for the Cards with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select-pk->fn :name :model/Card :id [:in ids]))

(mu/defn dashboard-names-by-id
  "A map of id to name for the Dashboards with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/select-pk->fn :name :model/Dashboard :id [:in ids]))

(mu/defn select-task-counts-for-runs
  "The total, successful, and failed TaskHistory counts of the TaskRuns with `run-ids`, grouped by run."
  [run-ids :- [:sequential ms/PositiveInt]]
  (t2/query {:select   [:run_id
                        [[:count :id] :task_count]
                        [[:sum [:case [:= :status (h2x/literal "success")] [:inline 1] :else [:inline 0]]] :success_count]
                        [[:sum [:case [:= :status (h2x/literal "failed")] [:inline 1] :else [:inline 0]]] :failed_count]]
             :from     :task_history
             :where    [:in :run_id run-ids]
             :group-by [:run_id]}))

(defn- task-run-listing-where
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

(defn- task-run-listing-order-by
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

(def ^:private TaskRunListingFilters
  [:map {:closed true}
   [:run-type          [:maybe :string]]
   [:entity-type       [:maybe :string]]
   [:entity-id         [:maybe ms/PositiveInt]]
   [:status            [:maybe [:or :keyword :string]]]
   [:started-at-start  [:maybe ms/TemporalInstant]]
   [:started-at-end    [:maybe ms/TemporalInstant]]])

(mu/defn select-task-runs-page :- [:sequential ::task-history.schema/task-run]
  "Up to `limit` (offset by `offset`) TaskRuns matching `filters` (see [[task-run-listing-where]] for the supported
  keys), sorted by `sort-column`/`sort-direction`."
  [filters        :- TaskRunListingFilters
   sort-column    :- [:enum :started_at :ended_at :run_type :status :entity_name :task_count]
   sort-direction :- [:enum :asc :desc]
   limit          :- [:maybe ms/PositiveInt]
   offset         :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select :model/TaskRun
             (cond-> (merge (task-run-listing-where filters) (task-run-listing-order-by sort-column sort-direction))
               limit  (assoc :limit limit)
               offset (assoc :offset offset))))

(mu/defn count-task-runs-page :- :int
  "The number of TaskRuns matching `filters` (see [[task-run-listing-where]] for the supported keys)."
  [filters :- TaskRunListingFilters]
  (t2/count :model/TaskRun (or (task-run-listing-where filters) {})))

(mu/defn select-distinct-run-entities
  "The distinct entity type and id of the TaskRuns of `run-type` started in [`started-at-start`, `started-at-end`)."
  [run-type          :- :string
   started-at-start  :- [:maybe ms/TemporalInstant]
   started-at-end    :- [:maybe ms/TemporalInstant]]
  (t2/query {:select-distinct [:entity_type :entity_id]
             :from            :task_run
             :where           (into [:and [:= :run_type run-type]]
                                    (keep identity)
                                    [(when started-at-start [:>= :started_at started-at-start])
                                     (when started-at-end [:< :started_at started-at-end])])}))

(def ^:private join-sort-columns
  "Sort columns that require a LEFT JOIN to `metabase_database`, mapped to the joined column to order by."
  {:db_name   :metabase_database.name
   :db_engine :metabase_database.engine})

(defn- task-history-listing-where
  ;; qualified so filters stay unambiguous when the db_name/db_engine sorts join metabase_database
  [status task]
  (when (or status task)
    (cond-> [:and]
      task   (conj [:= :task_history.task task])
      status (conj [:= :task_history.status (name status)]))))

(mu/defn select-task-histories-page :- [:sequential ::task-history.schema/task-history.partial]
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
             (cond-> (if-let [where (task-history-listing-where status task)]
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

(mu/defn count-task-histories-page :- :int
  "The number of TaskHistory rows, optionally narrowed to `status` and/or `task`."
  [status :- [:maybe [:enum :started :success :failed :unknown]]
   task   :- [:maybe ms/NonBlankString]]
  (t2/count :model/TaskHistory (if-let [where (task-history-listing-where status task)] {:where where} {})))

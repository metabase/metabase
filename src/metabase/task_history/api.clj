(ns metabase.task-history.api
  "/api/task endpoints"
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.permissions.core :as perms]
   [metabase.query-processor.parameters.dates :as params.dates]
   [metabase.request.core :as request]
   [metabase.task-history.models.task-history :as task-history]
   [metabase.task-history.models.task-run :as task-run]
   [metabase.task.core :as task]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Fetch a list of recent tasks stored as Task History"
  [_
   params :- [:maybe [:merge task-history/FilterParams task-history/SortParams]]]
  (perms/check-has-application-permission :monitoring)
  {:total  (task-history/total params)
   :limit  (request/limit)
   :offset (request/offset)
   :data   (task-history/all (request/limit) (request/offset) params)})

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Get `TaskHistory` entry with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-404 (api/read-check :model/TaskHistory id)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/info"
  "Return raw data about all scheduled tasks (i.e., Quartz Jobs and Triggers)."
  []
  (perms/check-has-application-permission :monitoring)
  (task/scheduler-info))

;;; TODO -- this is not necessarily a 'task history' thing and maybe belongs in the `task` module's API rather than
;;; here... maybe a problem for another day.
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/unique-tasks"
  "Returns possibly empty vector of unique task names in alphabetical order. It is expected that number of unique
  tasks is small, hence no need for pagination. If that changes this endpoint and function that powers it should
  reflect that."
  [] :- [:vector string?]
  (perms/check-has-application-permission :monitoring)
  (task-history/unique-tasks))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Task Runs endpoints                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(mr/def ::RunFilterParams
  [:map
   [:run-type    {:optional true} (into [:enum] (map name task-run/run-types))]
   [:entity-type {:optional true} (into [:enum] (map name task-run/entity-types))]
   [:entity-id   {:optional true} ms/PositiveInt]
   [:status      {:optional true} [:enum "started" "success" "failed" "abandoned"]]
   [:started-at  {:optional true} ms/NonBlankString]])

(def ^:private run-sort-columns
  "Columns that runs can be sorted by. `:entity_name` and `:task_count` are derived via joins in [[runs-order-by]]."
  #{:started_at :ended_at :run_type :status :entity_name :task_count})

(mr/def ::RunSortParams
  [:map
   [:sort-column    {:default :started_at} (into [:enum] run-sort-columns)]
   [:sort-direction {:default :desc}       [:enum :asc :desc]]])

(mr/def ::TaskRun
  [:map
   [:id          ms/PositiveInt]
   [:run_type    (into [:enum] task-run/run-types)]
   [:entity_type (into [:enum] task-run/entity-types)]
   [:entity_id   ms/PositiveInt]
   [:started_at  :any]
   [:ended_at    [:maybe :any]]
   [:status      [:enum :started :success :failed :abandoned]]
   [:entity_name {:optional true} [:maybe :string]]
   [:task_count  {:optional true} :int]
   [:success_count {:optional true} :int]
   [:failed_count {:optional true} :int]])

(mr/def ::TaskRunsResponse
  [:map
   [:total  ms/IntGreaterThanOrEqualToZero]
   [:limit  [:maybe ms/PositiveInt]]
   [:offset [:maybe ms/IntGreaterThanOrEqualToZero]]
   [:data   [:sequential ::TaskRun]]])

(mr/def ::TaskHistory
  [:map
   [:id           ms/PositiveInt]
   [:task         :string]
   [:started_at   :any]
   [:ended_at     [:maybe :any]]
   [:duration     [:maybe :int]]
   [:status       [:enum :started :success :failed :unknown]]
   [:task_details {:optional true} [:maybe :map]]
   [:run_id       {:optional true} [:maybe ms/PositiveInt]]
   [:logs         {:optional true} [:maybe :any]]])

(mr/def ::TaskRunWithTasks
  [:merge ::TaskRun
   [:map
    [:tasks [:sequential ::TaskHistory]]]])

(mr/def ::RunEntity
  [:map
   [:entity_type (into [:enum] task-run/entity-types)]
   [:entity_id   ms/PositiveInt]
   [:entity_name {:optional true} [:maybe :string]]])

(def ^:private entity-type->model
  {:database  :model/Database
   :card      :model/Card
   :dashboard :model/Dashboard})

(defn- hydrate-entity-names
  "Hydrate entity names based on entity_type and entity_id."
  [runs]
  (if (empty? runs)
    runs
    (let [grouped    (group-by :entity_type runs)
          name-lookup (into {}
                            (mapcat (fn [[entity-type model]]
                                      (when-let [entity-runs (grouped entity-type)]
                                        (let [ids   (map :entity_id entity-runs)
                                              names (t2/select-pk->fn :name model :id [:in ids])]
                                          (map (fn [[id name]] [[entity-type id] name]) names))))
                                    entity-type->model))]
      (map #(assoc % :entity_name (get name-lookup [(:entity_type %) (:entity_id %)])) runs))))

(defn- hydrate-task-counts
  "Add task_count, success_count, failed_count to runs."
  [runs]
  (if (empty? runs)
    runs
    (let [run-ids      (map :id runs)
          counts       (t2/query {:select   [:run_id
                                             [[:count :id] :task_count]
                                             [[:raw "SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)"]
                                              :success_count]
                                             [[:raw "SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)"]
                                              :failed_count]]
                                  :from     :task_history
                                  :where    [:in :run_id run-ids]
                                  :group-by [:run_id]})
          ;; Coerce counts to int (MySQL may return BigDecimal)
          counts-by-id (into {} (map (fn [{:keys [run_id task_count success_count failed_count]}]
                                       [run_id {:task_count    (int task_count)
                                                :success_count (int success_count)
                                                :failed_count  (int failed_count)}])
                                     counts))]
      (map #(merge {:task_count 0 :success_count 0 :failed_count 0}
                   %
                   (get counts-by-id (:id %)))
           runs))))

(defn- timestamp-constraint
  [field-name date-string]
  (let [{:keys [start end]}
        (try
          (params.dates/date-string->range date-string {:inclusive-end? false})
          (catch Exception e
            (throw (ex-info (tru "Failed to parse datetime value: {0}" date-string)
                            {:status-code 400}
                            e))))
        start (some-> start u.date/parse)
        end   (some-> end   u.date/parse)]
    (into [:and] (remove nil?)
          [(when start
             [:>= field-name start])
           (when end
             [:< field-name end])])))

(defn- build-run-where-clause
  [{:keys [run-type entity-type entity-id status started-at]}]
  ;; columns are qualified because the entity_name/task_count sorts add joins whose tables may share column names
  ;; (e.g. report_card.entity_id)
  (let [conditions (cond-> []
                     run-type    (conj [:= :task_run.run_type run-type])
                     entity-type (conj [:= :task_run.entity_type entity-type])
                     entity-id   (conj [:= :task_run.entity_id entity-id])
                     status      (conj [:= :task_run.status status])
                     started-at  (conj (timestamp-constraint :task_run.started_at started-at)))]
    (if (seq conditions)
      {:where (into [:and] conditions)}
      {})))

(defn- runs-order-by
  "Build the honeysql fragment used to order the task runs list. Direct columns order in place; `:entity_name`
  LEFT JOINs the three entity tables and orders by the coalesced name; `:task_count` LEFT JOINs a grouped
  `task_history` subquery. Derived-column variants keep the selected shape to `task_run.*` and add a
  deterministic `[:id :desc]` secondary key."
  [{col :sort-column dir :sort-direction}]
  (let [secondary [:task_run.id :desc]]
    (case col
      :entity_name
      {:select    [:task_run.*]
       :left-join [[:metabase_database :sort_db]
                   [:and [:= :task_run.entity_type "database"]  [:= :task_run.entity_id :sort_db.id]]
                   [:report_card :sort_card]
                   [:and [:= :task_run.entity_type "card"]      [:= :task_run.entity_id :sort_card.id]]
                   [:report_dashboard :sort_dash]
                   [:and [:= :task_run.entity_type "dashboard"] [:= :task_run.entity_id :sort_dash.id]]]
       :order-by  [[[:coalesce :sort_db.name :sort_card.name :sort_dash.name] dir] secondary]}

      :task_count
      {:select    [:task_run.*]
       :left-join [[{:select   [:run_id [[:count :*] :task_count]]
                     :from     [:task_history]
                     :group-by [:run_id]}
                    :sort_tc]
                   [:= :sort_tc.run_id :task_run.id]]
       :order-by  [[[:coalesce :sort_tc.task_count [:inline 0]] dir] secondary]}

      {:order-by [[col dir] secondary]})))

(api.macros/defendpoint :get "/runs" :- ::TaskRunsResponse
  "List task runs with optional filters. Returns runs with hydrated entity names and task counts."
  [_
   params :- [:maybe [:merge ::RunFilterParams ::RunSortParams]]]
  (perms/check-has-application-permission :monitoring)
  (let [where-clause (build-run-where-clause params)
        limit        (request/limit)
        offset       (request/offset)
        runs         (t2/select :model/TaskRun (merge where-clause
                                                      (runs-order-by params)
                                                      (when limit {:limit limit})
                                                      (when offset {:offset offset})))]
    {:total  (t2/count :model/TaskRun where-clause)
     :limit  limit
     :offset offset
     :data   (-> runs hydrate-entity-names hydrate-task-counts)}))

(api.macros/defendpoint :get "/runs/:id" :- ::TaskRunWithTasks
  "Get a single task run with all its child tasks."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (perms/check-has-application-permission :monitoring)
  (let [run   (api/check-404 (t2/select-one :model/TaskRun :id id))
        tasks (t2/select :model/TaskHistory :run_id id {:order-by [[:started_at :asc]]})]
    (-> [run]
        hydrate-entity-names
        hydrate-task-counts
        first
        (assoc :tasks tasks))))

(api.macros/defendpoint :get "/runs/entities" :- [:sequential ::RunEntity]
  "Get distinct entities that have task runs for a given run type. Used for populating entity filter picker."
  [_
   params :- [:map
              [:run-type   (into [:enum] (map name task-run/run-types))]
              [:started-at ms/NonBlankString]]]
  (perms/check-has-application-permission :monitoring)
  (let [where-conditions [[:= :run_type (:run-type params)]
                          (timestamp-constraint :started_at (:started-at params))]]
    (->> (t2/query {:select-distinct [:entity_type :entity_id]
                    :from            :task_run
                    :where           (into [:and] where-conditions)})
         (map #(update % :entity_type keyword))
         hydrate-entity-names)))

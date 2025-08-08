(ns metabase-enterprise.worker.models.worker-run
  (:require
   [metabase-enterprise.worker.models.worker-run-cancelation :as cancel]
   [metabase.app-db.core :as mdb]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(methodical/defmethod t2/table-name :model/WorkerRun [_model] :worker_run)

(derive :model/WorkerRun :metabase/model)

(t2/deftransforms :model/WorkerRun
  {:work_type mi/transform-keyword
   :status mi/transform-keyword
   :run_method mi/transform-keyword})

(defn- check-is-active [{:keys [status is_active] :as run}]
  (when (= (keyword status) :started)
    (when (not is_active)
      (throw (ex-info "If WorkerRun has started status, is_active should be true"
                      {:run run}))))
  (when is_active
    (when (not= (keyword status) :started)
      (throw (ex-info "If WorkerRun is_active = true, should have started status"
                      {:run run})))))

#_(t2/define-before-insert :model/WorkerRun
    [run]
    (check-is-active run)
    run)

#_(t2/define-before-update :model/WorkerRun
    [run]
    (check-is-active run)
    run)

(defmulti model->work-type
  "Convert the toucan model name to a keyword representing the type of work."
  {:arglists '([model-name])}
  identity)

(defmethod model->work-type :default
  [model-name]
  (throw (ex-info "No implementation of model->work-type for this model name."
                  {:model-name model-name})))

(mi/define-simple-hydration-method add-worker-runs
  :worker-runs
  "Add worker-runs for a transform or other work. Must have :id field."
  [work]
  (t2/select :model/WorkerRun
             :work_id (:id work)
             :work_type (model->work-type (t2/model work))
             {:order-by [[:start_time :desc] [:end_time :desc]]}))

(defn- latest-runs-query [work-type work-ids]
  {:with [[:ranked_runs
           {:select [:*
                     [[:over [[:row_number] {:partition-by :work_id, :order-by [[:start_time :desc]]}]] :rn]]
            :from [:worker_run]
            :where [:and
                    [:= :work_type work-type]
                    [:in :work_id work-ids]]}]]
   :select [:*]
   :from [:ranked_runs]
   :where [:= :rn [:inline 1]]})

(defn latest-runs
  "Return the latest runs for `work-type` and `work-ids`."
  [work-type work-ids]
  (when (seq work-ids)
    (into [] (map (comp t2.realize/realize #(dissoc % :rn)))
          (t2/reducible-select :model/WorkerRun (latest-runs-query (name work-type) work-ids)))))

(defn inactive-runs
  "Return the runs with run IDs in `run-ids` that are not active."
  [run-ids]
  (when (seq run-ids)
    (t2/select :model/WorkerRun
               :run_id    [:in run-ids]
               :is_active nil)))

(defn start-run!
  "Start a run"
  ([run-id work-type work-id]
   (start-run! run-id work-type work-id {}))
  ([run-id work-type work-id properties]
   (t2/insert! :model/WorkerRun
               (assoc properties
                      :run_id run-id
                      :work_type work-type
                      :work_id work-id
                      :status :started
                      :is_active true))))

(defn succeed-started-run!
  "Mark a started run as successfully completed."
  ([run-id]
   (succeed-started-run! run-id {}))
  ([run-id properties]
   (u/prog1 (t2/update! :model/WorkerRun
                        :run_id    run-id
                        :is_active true
                        (merge {:end_time :%now}
                               properties
                               {:status    :succeeded
                                :is_active nil}))
     (cancel/delete-old-canceling-runs!))))

(defn fail-started-run!
  "Mark the started active run as failed and inactive."
  [run-id properties]
  (u/prog1 (t2/update! :model/WorkerRun
                       :run_id    run-id
                       :is_active true
                       (merge {:end_time :%now}
                              properties
                              {:status :failed
                               :is_active nil}))
    (cancel/delete-old-canceling-runs!)))

(defn reducible-active-remote-runs
  "Return a reducible sequence of active remote runs."
  []
  (t2/reducible-select :model/WorkerRun :is_local false :is_active true))

(defn cancel-run!
  "Cancel a started run."
  ([run-id]
   (cancel-run! run-id {:message "Canceled by user"}))
  ([run-id properties]
   (u/prog1 (t2/update! :model/WorkerRun
                        :run_id    run-id
                        :is_active true
                        (merge {:end_time :%now}
                               properties
                               {:status    :canceled
                                :is_active nil}))
     (cancel/delete-old-canceling-runs!))))

(defn timeout-run!
  "Mark a started run as timed out."
  ([run-id]
   (timeout-run! run-id {}))
  ([run-id properties]
   (u/prog1 (t2/update! :model/WorkerRun
                        :run_id    run-id
                        :is_active true
                        (merge {:end_time :%now
                                :message  "Timed out"}
                               properties
                               {:status    :timeout
                                :is_active nil}))
     (cancel/delete-old-canceling-runs!))))

(defn timeout-old-runs!
  "Time out all active runs older than the specified age."
  [age unit]
  (u/prog1 (t2/update! :model/WorkerRun
                       :is_active true
                       :start_time [:< (sql.qp/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit)]
                       {:status :timeout
                        :end_time :%now
                        :is_active nil
                        :message "Timed out by metabase"})
    (cancel/delete-old-canceling-runs!)))

(defn cancel-old-canceling-runs!
  "Cancel all canceling runs older than the specified age."
  [age unit]
  (u/prog1 (t2/update! :model/WorkerRun
                       :is_active true
                       :run_id [:in {:select :run_id
                                     :from   :worker_run_cancelation
                                     :where  [:<
                                              :worker_run_cancelation.time
                                              (sql.qp/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit)]}]
                       {:status :canceled
                        :end_time :%now
                        :is_active nil
                        :message "Canceled by user but could not guarantee run stopped."})
    (cancel/delete-old-canceling-runs!)))

(defn running-execution-for-work-id
  "Return a single active work run or nil."
  [id work-type]
  (t2/select-one :model/WorkerRun
                 :work_id id
                 :work_type work-type
                 :is_active true))

(defn paged-executions
  "Return a page of the list of the executions.

  Follows the conventions used by the FE."
  [{:keys [offset
           limit
           sort_column
           sort_direction
           work_type
           work_ids
           statuses]}]
  (let [offset (or offset 0)
        limit  (or limit 20)
        sort-direction (or (keyword sort_direction) :desc)
        nulls-sort (if (= sort-direction :asc)
                     :nulls-last
                     :nulls-first)
        sort-column (keyword sort_column)
        order-by (case sort_column
                   :started_at [[sort-column sort-direction]]
                   :ended_at   [[sort-column sort-direction nulls-sort]]
                   [[:start_time sort-direction]
                    [:end_time   sort-direction nulls-sort]])
        conditions (concat (when work_type
                             [:work_type work_type])
                           (when (seq work_ids)
                             [:work_id [:in work_ids]])
                           (when (seq statuses)
                             [:status [:in statuses]])
                           (when (and (seq statuses)
                                      (some #(= % "started") statuses))
                             [:is_active true]))
        conditions-with-sort-and-pagination (concat conditions [{:order-by order-by
                                                                 :offset offset
                                                                 :limit limit}])
        runs (apply t2/select :model/WorkerRun conditions-with-sort-and-pagination)]
    {:data (t2/hydrate runs :transform)
     :limit limit
     :offset offset
     :total (apply t2/count :model/WorkerRun conditions)}))

(comment
  (t2/select :model/WorkerRun)
  (cancel-run! "slo7dhL7zoclb0uI0Zchj")
  -)

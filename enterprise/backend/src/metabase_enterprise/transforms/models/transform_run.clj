(ns metabase-enterprise.transforms.models.transform-run
  (:require
   [metabase-enterprise.transforms.models.transform-run-cancelation :as cancel]
   [metabase.app-db.core :as mdb]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformRun [_model] :transform_run)

(derive :model/TransformRun :metabase/model)

(t2/deftransforms :model/TransformRun
  {:status mi/transform-keyword
   :run_method mi/transform-keyword})

(mi/define-simple-hydration-method add-transform-runs
  :transform-runs
  "Add transform-runs for a transform. Must have :id field."
  [transform]
  (t2/select :model/TransformRun
             :transform_id (:id transform)
             {:order-by [[:start_time :desc] [:end_time :desc]]}))

(defn- latest-runs-query [transform-ids]
  {:with [[:ranked_runs
           {:select [:*
                     [[:over [[:row_number] {:partition-by :transform_id, :order-by [[:start_time :desc]]}]] :rn]]
            :from [:transform_run]
            :where [:in :transform_id transform-ids]}]]
   :select [:*]
   :from [:ranked_runs]
   :where [:= :rn [:inline 1]]})

(defn latest-runs
  "Return the latest runs for `transform-ids`."
  [transform-ids]
  (when (seq transform-ids)
    (into [] (map (comp t2.realize/realize #(dissoc % :rn)))
          (t2/reducible-select :model/TransformRun (latest-runs-query transform-ids)))))

(defn inactive-runs
  "Return the runs with run IDs in `run-ids` that are not active."
  [run-ids]
  (when (seq run-ids)
    (t2/select :model/TransformRun
               :id    [:in run-ids]
               :is_active nil)))

(defn start-run!
  "Start a run"
  ([transform-id]
   (start-run! transform-id {}))
  ([transform-id properties]
   (t2/insert-returning-instance! :model/TransformRun
                                  (assoc properties
                                         :transform_id transform-id
                                         :status :started
                                         :is_active true))))

(defn succeed-started-run!
  "Mark a started run as successfully completed."
  ([run-id]
   (succeed-started-run! run-id {}))
  ([run-id properties]
   (u/prog1 (t2/update! :model/TransformRun
                        :id    run-id
                        :is_active true
                        (merge properties
                               {:end_time  :%now
                                :status    :succeeded
                                :is_active nil}))
     (cancel/delete-cancelation! run-id))))

(defn fail-started-run!
  "Mark the started active run as failed and inactive."
  [run-id properties]
  (u/prog1 (t2/update! :model/TransformRun
                       :id    run-id
                       :is_active true
                       (merge properties
                              {:end_time  :%now
                               :status    :failed
                               :is_active nil}))
    (cancel/delete-cancelation! run-id)))

(defn cancel-run!
  "Cancel a started run."
  ([run-id]
   (cancel-run! run-id {:message "Canceled by user"}))
  ([run-id properties]
   (u/prog1 (t2/update! :model/TransformRun
                        :id    run-id
                        :is_active true
                        (merge properties
                               {:end_time  :%now
                                :status    :canceled
                                :is_active nil}))
     (cancel/delete-cancelation! run-id))))

(defn timeout-run!
  "Mark a started run as timed out."
  ([run-id]
   (timeout-run! run-id {}))
  ([run-id properties]
   (u/prog1 (t2/update! :model/TransformRun
                        :id    run-id
                        :is_active true
                        (merge properties
                               {:end_time  :%now
                                :message   "Timed out"
                                :status    :timeout
                                :is_active nil}))
     (cancel/delete-cancelation! run-id))))

(defn timeout-old-runs!
  "Time out all active runs older than the specified age."
  [age unit]
  (u/prog1 (t2/update! :model/TransformRun
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
  (u/prog1 (t2/update! :model/TransformRun
                       :is_active true
                       :id [:in {:select :run_id
                                 :from   :transform_run_cancelation
                                 :where  [:<
                                          :transform_run_cancelation.time
                                          (sql.qp/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit)]}]
                       {:status :canceled
                        :end_time :%now
                        :is_active nil
                        :message "Canceled by user but could not guarantee run stopped."})
    (cancel/delete-old-canceling-runs!)))

(defn running-run-for-run-id
  "Return a single active transform run or nil."
  [id]
  (t2/select-one :model/TransformRun
                 :id id
                 :is_active true))

(defn paged-runs
  "Return a page of the list of the runs.

  Follows the conventions used by the FE."
  [{:keys [offset
           limit
           sort_column
           sort_direction
           transform_ids
           transform_tag_ids
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
        ;; Build WHERE clause conditions
        where-conditions (cond-> []
                           ;; transform_ids and transform_tag_ids (intersection)
                           (and (seq transform_ids) (seq transform_tag_ids))
                           (conj [:and
                                  [:in :transform_id transform_ids]
                                  [:in :transform_id {:select [:transform_id]
                                                      :from [:transform_tags]
                                                      :where [:in :tag_id transform_tag_ids]}]])

                           ;; Only transform_ids
                           (and (seq transform_ids) (not (seq transform_tag_ids)))
                           (conj [:in :transform_id transform_ids])

                           ;; Only transform_tag_ids
                           (and (seq transform_tag_ids) (not (seq transform_ids)))
                           (conj [:in :transform_id {:select [:transform_id]
                                                     :from [:transform_tags]
                                                     :where [:in :tag_id transform_tag_ids]}])

                           ;; statuses condition
                           (seq statuses)
                           (conj [:in :status statuses])

                           ;; is_active condition for started status
                           (and (seq statuses)
                                (some #(= % "started") statuses))
                           (conj [:= :is_active true]))

        where-clause     (when (seq where-conditions)
                           (if (= 1 (count where-conditions))
                             (first where-conditions)
                             (into [:and] where-conditions)))
        query-options    (cond-> {:order-by order-by
                                  :offset offset
                                  :limit    limit}
                           where-clause (assoc :where where-clause))
        runs             (t2/select :model/TransformRun query-options)
        count-options    (cond-> {}
                           where-clause (assoc :where where-clause))]

    {:data (t2/hydrate runs :transform)
     :limit limit
     :offset offset
     :total (t2/count :model/TransformRun count-options)}))

(comment
  (t2/select :model/TransformRun)
  (cancel-run! "slo7dhL7zoclb0uI0Zchj")
  -)

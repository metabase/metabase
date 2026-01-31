(ns metabase-enterprise.transforms.models.transform-run
  (:require
   [medley.core :as m]
   [metabase-enterprise.transforms.models.transform-run-cancelation :as cancel]
   [metabase.app-db.core :as mdb]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.query-processor.parameters.dates :as params.dates]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformRun [_model] :transform_run)

(derive :model/TransformRun :metabase/model)

(t2/deftransforms :model/TransformRun
  {:status     mi/transform-keyword
   :run_method mi/transform-keyword})

(mi/define-simple-hydration-method add-transform-runs
  :transform-runs
  "Add transform-runs for a transform. Must have :id field."
  [transform]
  (t2/select :model/TransformRun
             :transform_id (:id transform)
             {:order-by [[:start_time :desc] [:end_time :desc]]}))

(defn- latest-run-cte
  ([] (latest-run-cte nil))
  ([where]
   [[:latest_runs
     (-> {:select [:*
                   [[:over [[:row_number] {:partition-by :transform_id, :order-by [[:start_time :desc]]}]] :rn]]
          :from   [:transform_run]}
         (m/assoc-some :where where))]]))

(defn- latest-runs-query [transform-ids]
  {:with   (latest-run-cte [:in :transform_id transform-ids])
   :select [:*]
   :from   [:latest_runs]
   :where  [:= :rn [:inline 1]]})

(defn latest-runs
  "Return the latest runs for `transform-ids`."
  [transform-ids]
  (when (seq transform-ids)
    (into [] (map (comp t2.realize/realize #(dissoc % :rn)))
          (t2/reducible-select :model/TransformRun (latest-runs-query transform-ids)))))

(defn start-run!
  "Start a run. If `user_id` is provided in properties, it will be stored with the run
   and used for attribution in the audit log (avoiding 'External user' for scheduled runs).
   Also captures `transform_name` and `transform_entity_id` for historical reference."
  ([transform-id]
   (start-run! transform-id {}))
  ([transform-id properties]
   (let [transform (t2/select-one [:model/Transform :name :entity_id] :id transform-id)
         run (t2/insert-returning-instance! :model/TransformRun
                                            (assoc properties
                                                   :transform_id transform-id
                                                   :transform_name (:name transform)
                                                   :transform_entity_id (:entity_id transform)
                                                   :status :started
                                                   :is_active true))]
     ;; Pass user_id to the event so audit log properly attributes the run
     (events/publish-event! :event/transform-run-start
                            (cond-> {:object run}
                              (:user_id run) (assoc :user-id (:user_id run))))
     run)))

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
                       :start_time [:< (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit)]
                       {:status    :timeout
                        :end_time  :%now
                        :is_active nil
                        :message   "Timed out by metabase"})
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
                                          (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit)]}]
                       {:status    :canceled
                        :end_time  :%now
                        :is_active nil
                        :message   "Canceled by user but could not guarantee run stopped."})
    (cancel/delete-old-canceling-runs!)))

(defn running-run-for-transform-id
  "Return a single active transform run or nil."
  [transform-id]
  (t2/select-one :model/TransformRun
                 :transform_id transform-id
                 :is_active true))

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

(defn paged-runs
  "Return a page of the list of the runs.

  Follows the conventions used by the FE."
  [{:keys [offset
           limit
           start_time
           end_time
           run_methods
           sort_column
           sort_direction
           transform_ids
           transform_tag_ids
           statuses]}]
  (let [offset           (or offset 0)
        limit            (or limit 20)
        sort-column      (or (keyword sort_column) :start-time)
        sort-direction   (or (keyword sort_direction) :desc)
        nulls-sort       (if (= sort-direction :asc)
                           :nulls-last
                           :nulls-first)
        run-method-expr  [:case
                          [:= :run_method "manual"] (tru "Manual")
                          [:= :run_method "cron"] (tru "Schedule")
                          :run_method]
        order-by         (case sort-column
                           :start-time  [[:start_time sort-direction]]
                           :end-time    [[:end_time sort-direction nulls-sort]]
                           :run-method  [[:run_method sort-direction]]
                           [[:start_time sort-direction]
                            [:end_time   sort-direction nulls-sort]])
        where-cond       (cond-> []
                           (some? start_time)
                           (conj (timestamp-constraint :start_time start_time))

                           (some? end_time)
                           (conj (timestamp-constraint :end_time end_time))

                           (seq run_methods)
                           (conj [:in :run_method (set run_methods)])

                           (seq transform_ids)
                           (conj [:in :transform_id transform_ids])

                           (seq transform_tag_ids)
                           (conj [:in :transform_id {:select [:transform_id]
                                                     :from   [:transform_transform_tag]
                                                     :where  [:in :tag_id transform_tag_ids]}])

                           (seq statuses)
                           (conj [:in :status (set statuses)])

                           ;; optimization: is_active condition for started status
                           (and (= (first statuses) "started")
                                (nil? (next statuses)))
                           (conj [:= :is_active true]))
        where-clause     (when (seq where-cond)
                           (into [:and] where-cond))
        count-options    (m/assoc-some {} :where where-clause)
        query-options    (merge {:order-by order-by :offset offset :limit limit}
                                count-options)
        runs             (t2/select :model/TransformRun query-options)]
    {:data   (t2/hydrate runs [:transform :transform_tag_ids])
     :limit  limit
     :offset offset
     :total  (t2/count :model/TransformRun count-options)}))

(comment
  (t2/select :model/TransformRun)
  (cancel-run! "slo7dhL7zoclb0uI0Zchj")
  -)

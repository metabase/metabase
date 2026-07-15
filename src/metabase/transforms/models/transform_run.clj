(ns metabase.transforms.models.transform-run
  (:require
   [medley.core :as m]
   [metabase.analytics-interface.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.run-tracking.core :as rt]
   [metabase.transforms.models.transform-run-cancelation :as cancel]
   [metabase.transforms.models.util :as transforms.models.u]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize])
  (:import
   (java.time OffsetDateTime ZoneOffset)))

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
   (let [transform  (t2/select-one [:model/Transform :name :entity_id :source_type] :id transform-id)
         metered-as (premium-features/transform-metered-as (:source_type transform))
         run (t2/insert-returning-instance! :model/TransformRun
                                            (assoc properties
                                                   :transform_id transform-id
                                                   :transform_name (:name transform)
                                                   :transform_entity_id (:entity_id transform)
                                                   :status :started
                                                   :is_active true
                                                   :metered_as metered-as))]
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

(defn- publish-timeout-event!
  "Publish `:event/transform-run-timeout` for `run`. Wrapped so that audit-log handler
  failures don't bubble into the caller's timeout flow."
  [run]
  (try
    (events/publish-event! :event/transform-run-timeout
                           (cond-> {:object run}
                             (:user_id run) (assoc :user-id (:user_id run))))
    (catch Throwable t
      (log/warnf t "Failed to publish transform-run-timeout event for run %s" (pr-str (:id run))))))

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
     (cancel/delete-cancelation! run-id)
     (when (pos? <>)
       (analytics/inc! :metabase-transforms/timeouts-total {:type "transform"})
       (when-let [run (t2/select-one :model/TransformRun :id run-id)]
         (publish-timeout-event! run))))))

(defn- reap-transform-runs!
  "Reap active transform runs by `stale-column` into a timeout carrying `message`, publishing a timeout
  event per run. See [[metabase.run-tracking.core/reap-orphaned!]]."
  [stale-column age unit message]
  (let [end-time (OffsetDateTime/now ZoneOffset/UTC)
        reaped   (rt/reap-orphaned!
                  {:model    :model/TransformRun
                   :active   [:= :is_active true]
                   :stale    [:< stale-column (rt/cutoff age unit)]
                   :terminal {:status "timeout" :end_time :%now :is_active nil :message message}
                   :metrics  {:total-metric   :metabase-transforms/timeouts-total
                              :latency-metric :metabase-transforms/timeout-detection-latency-ms
                              :tags           {:type "transform"}
                              :latency-column stale-column
                              :timeout-ms     (rt/unit->ms age unit)}})]
    (doseq [run reaped]
      (publish-timeout-event! (assoc run
                                     :status    :timeout
                                     :is_active nil
                                     :end_time  end-time
                                     :message   message)))
    (cancel/delete-old-canceling-runs!)
    reaped))

(defn timeout-old-runs!
  "Time out all active runs whose `start_time` is older than the specified age. Returns the rows that were
  timed out."
  [age unit]
  (reap-transform-runs! :start_time age unit "Timed out by metabase"))

(defn heartbeat-runs!
  "Stamp `last_heartbeat = now` on the given still-active `run-ids`."
  [run-ids]
  (rt/heartbeat-ids! :model/TransformRun [:= :is_active true] :last_heartbeat run-ids))

(defn reap-orphaned-runs!
  "Time out active runs whose `last_heartbeat` is older than `stale-minutes` (their owning process is
  presumed dead). Returns the rows that were timed out."
  [stale-minutes]
  (reap-transform-runs! :last_heartbeat stale-minutes :minute "Timed out: crashed"))

(defn cancel-old-canceling-runs!
  "Atomically force-cancels active runs whose cancelation requests are older than `age` `unit`. Returns the
  pre-update run rows we transitioned, each augmented with `:request_time` from its cancelation row, so callers
  can emit observability only for runs we actually changed.

  Race-free per app-db semantics: SELECT … FOR UPDATE row-locks the chosen runs across the transaction, so
  concurrent writers (`cancel-run!`, `timeout-run!`) block until we commit and the matching UPDATE-by-id hits
  exactly the locked rows. Rows another writer already transitioned (no longer `is_active`) simply drop out of
  the lock set and are not reported."
  [age unit]
  (t2/with-transaction [_conn]
    (let [cutoff (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit)
          times  (into {} (map (juxt :run_id :time))
                       (t2/select [:model/TransformRunCancelation :run_id :time]
                                  :time [:< cutoff]))
          locked (when (seq times)
                   (t2/select :model/TransformRun
                              {:where [:and [:= :is_active true] [:in :id (keys times)]]
                               :for   :update}))]
      (when (seq locked)
        (t2/update! :model/TransformRun
                    :id        [:in (mapv :id locked)]
                    :is_active true
                    {:status    :canceled
                     :end_time  :%now
                     :is_active nil
                     :message   "Canceled by user but could not guarantee run stopped."})
        (cancel/delete-old-canceling-runs!))
      (mapv #(assoc % :request_time (times (:id %)))
            (when (seq locked)
              (t2/select :model/TransformRun :id [:in (mapv :id locked)]))))))

(defn running-run-for-transform-id
  "Return a single active transform run or nil."
  [transform-id]
  (t2/select-one :model/TransformRun
                 :transform_id transform-id
                 :is_active true))

(defn last-successful-run-times
  "Map each id in `transform-ids` with a succeeded run to its most recent run's `end_time`. Ids with
  no succeeded run are absent."
  [transform-ids]
  (when (seq transform-ids)
    (into {}
          (map (juxt :transform_id :last_success))
          (t2/select :model/TransformRun
                     {:select   [:transform_id [[:max :end_time] :last_success]]
                      :where    [:and
                                 [:in :transform_id transform-ids]
                                 [:= :status [:inline "succeeded"]]]
                      :group-by [:transform_id]}))))

(defn- paged-runs-join-clause
  "Returns a `:left-join` clause for transform runs sort columns that require joining other tables."
  [{:keys [sort-column]}]
  (case (keyword sort-column)
    :transform-name [:transform [:= :transform_run.transform_id :transform.id]]
    nil))

(defn- paged-runs-where-clause
  "Builds a `:where` clause for transform runs from the given filter parameters."
  [{:keys [start-time end-time run-methods transform-ids transform-tag-ids statuses user-id]}]
  (let [where-cond (cond-> []
                     (some? start-time)
                     (conj (transforms.models.u/timestamp-constraint :start_time start-time))

                     (some? end-time)
                     (conj (transforms.models.u/timestamp-constraint :end_time end-time))

                     (seq run-methods)
                     (conj [:in :run_method (set run-methods)])

                     (seq transform-ids)
                     (conj [:in :transform_id transform-ids])

                     (seq transform-tag-ids)
                     (conj [:in :transform_id {:select [:transform_id]
                                               :from   [:transform_transform_tag]
                                               :where  [:in :tag_id transform-tag-ids]}])

                     (seq statuses)
                     (conj [:in :status (set statuses)])

                     ;; optimization: is_active condition for started status
                     (and (= (first statuses) "started")
                          (nil? (next statuses)))
                     (conj [:= :is_active true])

                     (some? user-id)
                     (conj [:= :user_id user-id]))]
    (when (seq where-cond)
      (into [:and] where-cond))))

(defn- translate-run-method-clause
  "Returns a HoneySQL `:case` expression that translates run method values to display names."
  []
  [:case
   [:= :run_method "manual"] (tru "Manual")
   [:= :run_method "cron"] (tru "Schedule")
   :run_method])

(defn- translate-status-clause
  "Returns a HoneySQL `:case` expression that translates run status values to display names."
  []
  [:case
   [:= :status "started"]   (tru "In progress")
   [:= :status "succeeded"] (tru "Success")
   [:= :status "failed"]    (tru "Failed")
   [:= :status "timeout"]   (tru "Timeout")
   [:= :status "canceling"] (tru "Canceling")
   [:= :status "canceled"]  (tru "Canceled")
   :status])

(defn- translate-tag-name-clause
  "Returns a HoneySQL `:case` expression that translates built-in tag names.
   `name-field` is the keyword for the name column (e.g. `:transform_tag.name`),
   `built-in-type-field` is the keyword for the built_in_type column (e.g. `:transform_tag.built_in_type`)."
  [name-field built-in-type-field]
  [:case
   [:= built-in-type-field "hourly"]  (tru "hourly")
   [:= built-in-type-field "daily"]   (tru "daily")
   [:= built-in-type-field "weekly"]  (tru "weekly")
   [:= built-in-type-field "monthly"] (tru "monthly")
   :else name-field])

(defn- first-tag-name-subquery
  "Returns a correlated subquery that selects the translated name of the first tag
   (by minimum position) assigned to the transform for a transform run."
  []
  {:select [[(translate-tag-name-clause :tt.name :tt.built_in_type) :tag_name]]
   :from   [[:transform_transform_tag :ttt]]
   :join   [[:transform_tag :tt] [:= :ttt.tag_id :tt.id]]
   :where  [:and
            [:= :ttt.transform_id :transform_run.transform_id]
            [:= :ttt.position {:select [[[:min :ttt2.position]]]
                               :from   [[:transform_transform_tag :ttt2]]
                               :where  [:= :ttt2.transform_id :transform_run.transform_id]}]]})

(defn- paged-runs-order-by-clause
  "Builds a HoneySQL `:order-by` clause for transform runs, translating display values for sortable columns."
  [{:keys [sort-column sort-direction]}]
  (let [sort-column    (or (keyword sort-column) :start-time)
        sort-direction (or (keyword sort-direction) :desc)
        nulls-sort     (if (= sort-direction :asc)
                         :nulls-last
                         :nulls-first)]
    (conj
     (case sort-column
       :transform-name  [[:transform.name sort-direction]]
       :start-time      [[:start_time sort-direction]]
       :end-time        [[:end_time sort-direction nulls-sort]]
       :status          [[(translate-status-clause) sort-direction]]
       :run-method      [[(translate-run-method-clause) sort-direction]]
       :transform-tags  [[(first-tag-name-subquery) sort-direction nulls-sort]]
       ;; In-progress runs (end_time = nil) sink to the bottom in BOTH
       ;; directions — null means "no measurable duration yet," not
       ;; "longest duration."
       :duration        [[[:is :end_time nil] :asc]
                         [(h2x/calculate-interval-honeysql-form
                           (mdb/db-type) :end_time :start_time)
                          sort-direction]]
       [[:start_time sort-direction]
        [:end_time   sort-direction nulls-sort]])
     [:transform_run.id sort-direction])))

(defn paged-runs
  "Return a page of the list of the runs.

  Follows the conventions used by the FE."
  [{:keys [offset limit] :as params}]
  (let [offset          (or offset 0)
        limit           (or limit 20)
        order-by        (paged-runs-order-by-clause params)
        where-clause    (paged-runs-where-clause params)
        join-clause     (paged-runs-join-clause params)
        count-options   (m/assoc-some {} :where where-clause)
        query-options   (m/assoc-some {:order-by order-by :offset offset :limit limit}
                                      :select (when join-clause [:transform_run.*])
                                      :where where-clause
                                      :left-join join-clause)
        runs            (t2/select :model/TransformRun query-options)
        root-collection (collection.root/hydrated-root-collection :transforms)]
    {:data   (->> (t2/hydrate runs [:transform :collection :transform_tag_ids])
                  (map #(update % :transform collection.root/hydrate-root-collection root-collection)))
     :limit  limit
     :offset offset
     :total  (t2/count :model/TransformRun count-options)}))

(comment
  (t2/select :model/TransformRun)
  (cancel-run! "slo7dhL7zoclb0uI0Zchj")
  -)

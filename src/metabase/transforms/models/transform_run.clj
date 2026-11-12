(ns metabase.transforms.models.transform-run
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.api.common :as api]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.run-tracking.core :as rt]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.models.transform-run-cancelation :as cancel]
   [metabase.transforms.models.util :as transforms.models.u]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize])
  (:import
   (java.time OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformRun [_model] :transform_run)

(derive :model/TransformRun :metabase/model)

(def ^:private terminal-statuses
  #{:succeeded :failed :canceled :timeout})

(t2/define-before-update :model/TransformRun
  [run]
  (let [changes (t2/changes run)]
    (cond-> run
      (and (contains? terminal-statuses (keyword (:status changes))) (not (contains? changes :end_time)))
      (assoc :end_time (mi/now)))))

(t2/deftransforms :model/TransformRun
  {:status     mi/transform-keyword
   :run_method mi/transform-keyword})

;; a run is only readable if its transform is; orphaned runs (transform deleted) are superuser-only
(defmethod mi/can-read? :model/TransformRun
  ([instance]
   (or api/*is-superuser?*
       (boolean (when-let [transform-id (:transform_id instance)]
                  (mi/can-read? :model/Transform transform-id)))))
  ([_model pk]
   (when-let [run (transforms.db/run pk)]
     (mi/can-read? run))))

(mi/define-simple-hydration-method add-transform-runs
  :transform-runs
  "Add transform-runs for a transform. Must have :id field."
  [transform]
  (transforms.db/runs-for-transform (:id transform)))

(mr/def ::canceled-run
  "A TransformRun force-canceled by [[cancel-old-canceling-runs!]], with the time its cancelation was requested."
  [:merge
   ::transforms.schema/transform-run
   [:map {:closed true}
    [:request_time ms/TemporalInstant]]])

(mr/def ::paged-run-transform
  "The `:transform` hydrated onto a run listed by [[paged-runs]]: a summary of its live Transform, or the name
  snapshotted on a run whose Transform was deleted."
  [:map {:closed true}
   [:id            {:optional true} ::lib.schema.id/transform]
   [:name          {:optional true} :string]
   [:collection_id {:optional true} [:maybe ::lib.schema.id/collection]]
   [:collection    {:optional true} [:maybe :metabase.collections.schema/collection-or-root]]
   [:tag_ids       {:optional true} [:sequential ms/PositiveInt]]
   [:deleted       {:optional true} :boolean]])

(mr/def ::paged-run
  "A TransformRun listed by [[paged-runs]], with its `:transform` hydrated."
  [:merge
   ::transforms.schema/transform-run
   [:map {:closed true}
    [:transform {:optional true} [:maybe ::paged-run-transform]]]])

(mu/defn latest-runs :- [:maybe [:vector ::transforms.schema/transform-run]]
  "Return the latest runs for `transform-ids`."
  [transform-ids :- [:set ::lib.schema.id/transform]]
  (when (seq transform-ids)
    (into [] (map (comp t2.realize/realize #(dissoc % :rn)))
          (transforms.db/latest-runs-reducible transform-ids))))

(mu/defn start-run! :- ::transforms.schema/transform-run
  "Start a run. If `user_id` is provided in properties, it will be stored with the run
   and used for attribution in the audit log (avoiding 'External user' for scheduled runs).
   Also captures `transform_name` and `transform_entity_id` for historical reference."
  ([transform-id :- ::lib.schema.id/transform]
   (start-run! transform-id {}))
  ([transform-id :- ::lib.schema.id/transform
    properties   :- ::transforms.schema/transform-run.update]
   (let [transform  (transforms.db/transform-snapshot transform-id)
         metered-as (premium-features/transform-metered-as (:source_type transform))
         run (transforms.db/insert-run! (assoc properties
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

(mu/defn succeed-started-run! :- :int
  "Mark a started run as successfully completed."
  ([run-id :- ms/PositiveInt]
   (succeed-started-run! run-id {}))
  ([run-id     :- ms/PositiveInt
    properties :- ::transforms.schema/transform-run.update]
   (u/prog1 (transforms.db/finish-active-run! run-id
                                              (merge properties
                                                     {:status    :succeeded
                                                      :is_active nil}))
     (cancel/delete-cancelation! run-id))))

(mu/defn fail-started-run! :- :int
  "Mark the started active run as failed and inactive."
  [run-id     :- ms/PositiveInt
   properties :- ::transforms.schema/transform-run.update]
  (u/prog1 (transforms.db/finish-active-run! run-id
                                             (merge properties
                                                    {:status    :failed
                                                     :is_active nil}))
    (cancel/delete-cancelation! run-id)))

(mu/defn cancel-run! :- :int
  "Cancel a started run."
  ([run-id :- ms/PositiveInt]
   (cancel-run! run-id {:message "Canceled by user"}))
  ([run-id     :- ms/PositiveInt
    properties :- ::transforms.schema/transform-run.update]
   (u/prog1 (transforms.db/finish-active-run! run-id
                                              (merge properties
                                                     {:status    :canceled
                                                      :is_active nil}))
     (cancel/delete-cancelation! run-id))))

(mu/defn- publish-timeout-event! :- :nil
  "Publish `:event/transform-run-timeout` for `run`. Wrapped so that audit-log handler
  failures don't bubble into the caller's timeout flow."
  [run :- ::transforms.schema/transform-run]
  (try
    (events/publish-event! :event/transform-run-timeout
                           (cond-> {:object run}
                             (:user_id run) (assoc :user-id (:user_id run))))
    (catch Throwable t
      (log/warnf "Failed to publish transform-run-timeout event for run %s: %s" (pr-str (:id run)) (ex-message t))))
  nil)

(mu/defn timeout-run! :- :int
  "Mark a started run as timed out."
  ([run-id :- ms/PositiveInt]
   (timeout-run! run-id {}))
  ([run-id     :- ms/PositiveInt
    properties :- ::transforms.schema/transform-run.update]
   (u/prog1 (transforms.db/finish-active-run! run-id
                                              (merge properties
                                                     {:message   "Timed out"
                                                      :status    :timeout
                                                      :is_active nil}))
     (cancel/delete-cancelation! run-id)
     (when (pos? <>)
       (analytics/inc! :metabase-transforms/timeouts-total {:type "transform"})
       (when-let [run (transforms.db/run run-id)]
         (publish-timeout-event! run))))))

(mu/defn- reap-transform-runs! :- [:maybe [:sequential ::transforms.schema/transform-run]]
  "Reap active transform runs by `stale-column` into a timeout carrying `message`, publishing a timeout
  event per run. See [[metabase.run-tracking.core/reap-orphaned!]]."
  [stale-column :- [:enum :start_time :last_heartbeat]
   age          :- ms/PositiveInt
   unit         :- :keyword
   message      :- :string]
  (let [end-time (OffsetDateTime/now ZoneOffset/UTC)
        reaped   (rt/reap-orphaned!
                  {:model    :model/TransformRun
                   :active   [:is_active true]
                   :stale    [{:column stale-column :age age :unit unit}]
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

(mu/defn timeout-old-runs! :- [:maybe [:sequential ::transforms.schema/transform-run]]
  "Time out all active runs whose `start_time` is older than the specified age. Returns the rows that were
  timed out."
  [age  :- ms/PositiveInt
   unit :- :keyword]
  (reap-transform-runs! :start_time age unit "Timed out by metabase"))

(mu/defn heartbeat-runs! :- :nil
  "Stamp `last_heartbeat = now` on the given still-active `run-ids`."
  [run-ids :- [:sequential ms/PositiveInt]]
  (rt/heartbeat-ids! :model/TransformRun [:is_active true] :last_heartbeat run-ids)
  nil)

(mu/defn reap-orphaned-runs! :- [:maybe [:sequential ::transforms.schema/transform-run]]
  "Time out active runs whose `last_heartbeat` is older than `stale-minutes` (their owning process is
  presumed dead). Returns the rows that were timed out."
  [stale-minutes :- ms/PositiveInt]
  (reap-transform-runs! :last_heartbeat stale-minutes :minute "Timed out: crashed"))

(mu/defn cancel-old-canceling-runs! :- [:maybe [:vector ::canceled-run]]
  "Atomically force-cancels active runs whose cancelation requests are older than `age` `unit`. Returns the
  pre-update run rows we transitioned, each augmented with `:request_time` from its cancelation row, so callers
  can emit observability only for runs we actually changed.

  Race-free per app-db semantics: SELECT … FOR UPDATE row-locks the chosen runs across the transaction, so
  concurrent writers (`cancel-run!`, `timeout-run!`) block until we commit and the matching UPDATE-by-id hits
  exactly the locked rows. Rows another writer already transitioned (no longer `is_active`) simply drop out of
  the lock set and are not reported."
  [age  :- ms/PositiveInt
   unit :- :keyword]
  (t2/with-transaction [_conn]
    (let [times  (into {} (map (juxt :run_id :time))
                       (transforms.db/cancelations-requested-before age unit))
          locked (when (seq times)
                   (transforms.db/lock-active-runs (keys times)))]
      (when (seq locked)
        (transforms.db/cancel-active-runs! (mapv :id locked))
        (cancel/delete-old-canceling-runs!))
      (mapv #(assoc % :request_time (times (:id %)))
            (when (seq locked)
              (transforms.db/runs (mapv :id locked)))))))

(mu/defn running-run-for-transform-id :- [:maybe ::transforms.schema/transform-run]
  "Return a single active transform run or nil."
  [transform-id :- [:maybe ::lib.schema.id/transform]]
  (transforms.db/active-run-for-transform transform-id))

(mu/defn last-successful-run-times :- [:maybe [:map-of ::lib.schema.id/transform [:maybe ms/TemporalInstant]]]
  "Map each id in `transform-ids` with a succeeded run to its most recent run's `end_time`. Ids with
  no succeeded run are absent."
  [transform-ids :- [:set ::lib.schema.id/transform]]
  (when (seq transform-ids)
    (into {}
          (map (juxt :transform_id :last_success))
          (transforms.db/last-success-times transform-ids))))

(mu/defn last-run-start-times :- [:maybe [:map-of ::lib.schema.id/transform [:maybe ms/TemporalInstant]]]
  "Map each id in `transform-ids` to its most recent run's `start_time`, regardless of run status.
  Ids with no runs are absent."
  [transform-ids :- [:maybe [:or [:set ::lib.schema.id/transform] [:sequential ::lib.schema.id/transform]]]]
  (when (seq transform-ids)
    (into {}
          (map (juxt :transform_id :last_start))
          (transforms.db/last-start-times transform-ids))))

(mu/defn- status-labels :- [:map-of :string :string]
  "Display labels for TransformRun status values."
  []
  {"started"   (tru "In progress")
   "succeeded" (tru "Success")
   "failed"    (tru "Failed")
   "timeout"   (tru "Timeout")
   "canceling" (tru "Canceling")
   "canceled"  (tru "Canceled")})

(mu/defn- run-method-labels :- [:map-of :string :string]
  "Display labels for TransformRun run_method values."
  []
  {"manual" (tru "Manual")
   "cron"   (tru "Schedule")})

(mu/defn- tag-name-labels :- [:map-of :string :string]
  "Display labels for built-in TransformTag names."
  []
  {"hourly"  (tru "hourly")
   "daily"   (tru "daily")
   "weekly"  (tru "weekly")
   "monthly" (tru "monthly")})

(mu/defn paged-runs :- [:map {:closed true}
                        [:data   [:sequential ::paged-run]]
                        [:limit  ms/PositiveInt]
                        [:offset ms/IntGreaterThanOrEqualToZero]
                        [:total  ms/IntGreaterThanOrEqualToZero]]
  "Return a page of the list of the runs.

  Follows the conventions used by the FE."
  [{:keys [offset limit start-time end-time run-methods transform-ids transform-tag-ids statuses user-id
           sort-column sort-direction]}
   :- [:map {:closed true}
       [:offset            {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]
       [:limit             {:optional true} [:maybe ms/PositiveInt]]
       [:start-time        {:optional true} [:maybe :string]]
       [:end-time          {:optional true} [:maybe :string]]
       [:run-methods       {:optional true} [:maybe [:sequential :string]]]
       [:transform-ids     {:optional true} [:maybe [:sequential ::lib.schema.id/transform]]]
       [:transform-tag-ids {:optional true} [:maybe [:sequential ms/IntGreaterThanOrEqualToZero]]]
       [:statuses          {:optional true} [:maybe [:sequential :string]]]
       [:user-id           {:optional true} [:maybe ::lib.schema.id/user]]
       [:sort-column       {:optional true} [:maybe [:or :keyword :string]]]
       [:sort-direction    {:optional true} [:maybe [:or :keyword :string]]]]]
  (let [offset            (or offset 0)
        limit             (or limit 20)
        [started-at-start started-at-end] (when start-time (transforms.models.u/timestamp-range start-time))
        [ended-at-start ended-at-end]     (when end-time (transforms.models.u/timestamp-range end-time))
        filters           {:started-at-start   started-at-start
                           :started-at-end     started-at-end
                           :ended-at-start     ended-at-start
                           :ended-at-end       ended-at-end
                           :run-methods        run-methods
                           :transform-ids      transform-ids
                           :transform-tag-ids  transform-tag-ids
                           :statuses           statuses
                           :user-id            user-id}
        runs              (transforms.db/paged-runs filters sort-column sort-direction (status-labels)
                                                    (run-method-labels) (tag-name-labels) limit offset)
        root-collection   (collection.root/hydrated-root-collection :transforms)]
    {:data   (->> (t2/hydrate runs [:transform :collection :transform_tag_ids])
                  (map #(update % :transform collection.root/hydrate-root-collection root-collection)))
     :limit  limit
     :offset offset
     :total  (transforms.db/paged-run-count filters)}))

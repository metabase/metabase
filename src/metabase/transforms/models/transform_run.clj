(ns metabase.transforms.models.transform-run
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.models.util :as transforms.models.u]
   [metabase.transforms.run-write]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformRun [_model] :transform_run)

(derive :model/TransformRun :metabase/model)

(t2/deftransforms :model/TransformRun
  {:status     mi/transform-keyword
   :run_method mi/transform-keyword})

(t2/define-before-insert :model/TransformRun
  [{:keys [transform_id] :as run}]
  (if-let [transform (some-> transform_id transforms.db/transform-snapshot)]
    (assoc run
           :transform_name      (:name transform)
           :transform_entity_id (:entity_id transform)
           :metered_as          (premium-features/transform-metered-as (:source_type transform)))
    run))

;; a run is only readable if its transform is; orphaned runs (transform deleted) are superuser-only
(methodical/defmethod t2/simple-hydrate [:model/TransformRun :can_read]
  [_model k instance]
  (vary-meta instance assoc k
             (boolean
              (or api/*is-superuser?*
                  (boolean (when-let [transform-id (:transform_id instance)]
                             (some-> (transforms.db/transform transform-id) (t2/hydrate :can_read) mi/can-read?)))))))

(mi/define-simple-hydration-method add-transform-runs
  :transform-runs
  "Add transform-runs for a transform. Must have :id field."
  [transform]
  (transforms.db/runs-for-transform (:id transform)))

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

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/TransformRun [_model]
  {:skip? false})

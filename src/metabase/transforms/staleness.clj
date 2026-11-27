(ns metabase.transforms.staleness
  "How the stale content page finds the Transforms that are stale."
  (:require
   [metabase.funnysql.schema :as funnysql.schema]
   [metabase.staleness.core :as staleness]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.freshness :as freshness]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn stale-transform-candidates :- ::funnysql.schema/query.select
  "The query of the Transforms that are stale for `opts`, `{:collection-ids (:all | #{int|nil}), :cutoff-date local-date}`.

  A Transform is stale when it has never run and was created on or before the cutoff, or when its most recent run
  started on or before the cutoff, failed runs included, unless it is between the fires of a schedule slower than the
  threshold."
  [opts :- ::staleness/candidates-options]
  (let [schedule-fresh-ids (freshness/schedule-fresh-transform-ids (java.time.Instant/now))]
    ^:allow-subquery
    {:select    [:transform.id
                 [[:literal "Transform"] :model]
                 [:transform.name :name]
                 [:latest_run.last_start :last_used_at]
                 :transform.collection_id]
     :from      [[(t2/table-name :model/Transform) :transform]]
     :left-join [[(transforms.db/latest-run-start-times-query) :latest_run]
                 [:= :latest_run.transform_id :transform.id]]
     :where     [:and
                 [:or
                  [:and
                   [:= :latest_run.last_start nil]
                   [:<= :transform.created_at (:cutoff-date opts)]]
                  [:<= :latest_run.last_start (:cutoff-date opts)]]
                 (when (seq schedule-fresh-ids)
                   [:not [:in :transform.id schedule-fresh-ids]])
                 (staleness/collection-filter :transform.collection_id opts)]}))

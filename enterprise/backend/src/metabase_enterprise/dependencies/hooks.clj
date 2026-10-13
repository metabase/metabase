(ns metabase-enterprise.dependencies.hooks
  "Implements the hooks of `metabase.dependencies.core`, marking written content for the backfill job to recompute."
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def ^:private dependency-columns
  "The columns of each model that its own dependencies, or its dashboard's, are calculated from."
  {:model/Card                #{:dataset_query :dimension_mappings :parameters}
   :model/Dashboard           #{:parameters}
   :model/DashboardCard       #{:card_id :dashboard_id :visualization_settings}
   :model/DashboardCardSeries #{:card_id :dashboardcard_id}
   :model/Document            #{:content_type :document}
   :model/Measure             #{:definition :table_id}
   :model/NativeQuerySnippet  #{:content :template_tags}
   :model/Segment             #{:definition :table_id}
   :model/Transform           #{:source}})

(defn- dashboard-id
  "The id of the Dashboard whose dependencies the `model` row `instance` is part of, or nil."
  [model instance]
  (case model
    :model/DashboardCard       (:dashboard_id instance)
    :model/DashboardCardSeries (some-> (:dashboardcard_id instance) dependencies.db/dashcard-dashboard-id)
    nil))

(defn- mark-stale!
  "Mark the entity `entity-type` `entity-id` for recalculation, logging a failure rather than failing the write."
  [entity-type entity-id]
  (when entity-id
    (try
      (deps.dependency-status/mark-stale! entity-type [entity-id])
      (catch Exception e
        (log/warnf "Failed to mark %s %s stale: %s" (name entity-type) entity-id (ex-message e))))))

(defenterprise entity-inserted!
  "Mark the dashboard of an inserted dashboard card or series stale; an inserted entity has no status yet, which the
  backfill job picks up on its own."
  :feature :dependencies
  [model instance]
  (mark-stale! :dashboard (dashboard-id model instance)))

(defenterprise entity-updated!
  "Mark an updated entity, or the dashboard of an updated dashboard card or series, stale when its dependency columns
  changed."
  :feature :dependencies
  [model instance]
  (let [changes (t2/changes instance)]
    (when (some #(contains? changes %) (dependency-columns model))
      (if-let [entity-type (deps.dependency-types/model->dependency-type model)]
        (mark-stale! entity-type (:id instance))
        (doseq [id (distinct [(dashboard-id model (t2/original instance)) (dashboard-id model instance)])]
          (mark-stale! :dashboard id))))))

(defenterprise entity-deleted!
  "Drop the dependencies and status of a deleted entity, or mark the dashboard of a deleted dashboard card or series
  stale."
  :feature :dependencies
  [model instance]
  (if-let [entity-type (deps.dependency-types/model->dependency-type model)]
    (try
      (dependencies.db/delete-dependencies-from! entity-type (:id instance))
      (dependencies.db/delete-dependency-status! entity-type (:id instance))
      (catch Exception e
        (log/warnf "Failed to drop the dependencies of %s %s: %s" (name entity-type) (:id instance) (ex-message e))))
    (mark-stale! :dashboard (dashboard-id model instance))))

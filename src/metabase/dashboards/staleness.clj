(ns metabase.dashboards.staleness
  "How the stale content page loads and shows the Dashboards that are stale."
  (:require
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [metabase.dashboards.db :as dashboards.db]))

(set! *warn-on-reflection* true)

(defn load-items
  "The rows of the Dashboards with `dashboard-ids`, loaded for [[render]] with the ancestors of their collections."
  [dashboard-ids]
  (-> (dashboards.db/stale-dashboard-items dashboard-ids)
      collections/annotate-dashboards
      collections/with-effective-ancestors))

(defn render
  "The API item of the loaded Dashboard row `dashboard`, with its `location` and whether it is in a tenant collection."
  [{parent-coll :collection :as dashboard}]
  (-> dashboard
      (assoc :location (or (some-> parent-coll collection/children-location) "/")
             :is_tenant_dashboard (some-> parent-coll collection/shared-tenant-collection?))
      collections/present-collection))

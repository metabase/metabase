(ns metabase.dashboards.collection-items
  "How the collection items listing shows the Dashboards."
  (:require
   [metabase.api.common :as api]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- dashboard-row
  [parent-collection dashboard]
  (-> (t2/instance :model/Dashboard dashboard)
      (assoc :location (or (when parent-collection
                             (collection/children-location parent-collection))
                           "/"))
      (assoc :is_tenant_dashboard (collection/shared-tenant-collection? parent-collection))
      (update :archived api/bit->boolean)
      (update :archived_directly api/bit->boolean)
      (dissoc :display :authority_level :icon :personal_owner_id
              :dataset_query :table_id :query_type :is_upload)))

(defn hydrate
  "The `rows` of Dashboards of the collection items listing as the API shows them, with their location in
  `parent-collection` and what the user can do with them."
  [parent-collection _opts rows]
  (->> rows
       collections/annotate-dashboards
       (map (partial dashboard-row parent-collection))
       (#(t2/hydrate % :can_write :can_restore :can_delete :is_remote_synced :collection_namespace))))

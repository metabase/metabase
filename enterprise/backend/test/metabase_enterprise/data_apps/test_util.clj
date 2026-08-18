(ns metabase-enterprise.data-apps.test-util
  (:require
   [metabase-enterprise.data-apps.resources :as data-app.resources]
   [toucan2.core :as t2]))

(defn test-entity-id
  [prefix slug]
  (subs (str prefix "-" slug "xxxxxxxxxxxxxxxxxxxxx") 0 21))

(defn ensure-manifest-resources!
  "Return an app's resource entity IDs, creating an unlinked test pair when needed."
  [slug]
  (if-let [app (t2/select-one :model/DataApp :name slug)]
    (data-app.resources/resource-entity-ids app)
    (let [collection-entity-id (test-entity-id "collection" slug)
          group-entity-id      (test-entity-id "group" slug)]
      (when-not (t2/exists? :model/Collection :entity_id collection-entity-id)
        (t2/insert! :model/Collection
                    {:name (str "Data App: " slug)
                     :location "/"
                     :entity_id collection-entity-id}))
      (when-not (t2/exists? :model/PermissionsGroup :entity_id group-entity-id)
        (t2/insert! :model/PermissionsGroup
                    {:name (str "Data App: " slug)
                     :entity_id group-entity-id}))
      {:resource_collection_entity_id collection-entity-id
       :permission_group_entity_id group-entity-id})))

(ns metabase-enterprise.data-apps.resources-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.resources :as data-app.resources]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- create-data-app!
  [name]
  (t2/insert-returning-instance! :model/DataApp
                                 {:name name
                                  :display_name name
                                  :bundle_path (format "data_apps/%s/index.js" name)}))

(defn- create-resource-pair!
  [name]
  {:collection (t2/insert-returning-instance! :model/Collection
                                              {:name (str name " collection")
                                               :location "/"})
   :group      (t2/insert-returning-instance! :model/PermissionsGroup
                                              {:name (str name " group")})})

(defn- manifest-resource-ids
  [{:keys [collection group]}]
  {:resource_collection_entity_id (:entity_id collection)
   :permission_group_entity_id     (:entity_id group)})

(deftest reconcile-resources-rejects-a-populated-collection-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [app        (create-data-app! "birds")
          old-links  (data-app.resources/ensure-resources! app)
          target     (create-resource-pair! "target")
          linked-app (t2/select-one :model/DataApp :id (:id app))]
      (mt/with-temp [:model/Card _ {:collection_id (:id (:collection target))}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"resource_collection_entity_id.*must be empty"
             (data-app.resources/reconcile-resources!
              linked-app (manifest-resource-ids target)))))
      (is (= old-links
             (select-keys (t2/select-one :model/DataApp :id (:id app)) (keys old-links)))))))

(deftest reconcile-resources-rejects-a-populated-permission-group-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [app        (create-data-app! "birds")
          old-links  (data-app.resources/ensure-resources! app)
          target     (create-resource-pair! "target")
          linked-app (t2/select-one :model/DataApp :id (:id app))]
      (mt/with-temp [:model/User user {}
                     :model/PermissionsGroupMembership _ {:user_id (:id user)
                                                          :group_id (:id (:group target))}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"permission_group_entity_id.*must be empty"
             (data-app.resources/reconcile-resources!
              linked-app (manifest-resource-ids target)))))
      (is (= old-links
             (select-keys (t2/select-one :model/DataApp :id (:id app)) (keys old-links)))))))

(deftest reconcile-resources-rejects-a-missing-resource-without-changing-links-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [app        (create-data-app! "birds")
          old-links  (data-app.resources/ensure-resources! app)
          linked-app (t2/select-one :model/DataApp :id (:id app))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"resource_collection_entity_id.*does not identify an existing resource"
           (data-app.resources/reconcile-resources!
            linked-app
            {:resource_collection_entity_id "missingcollection0001"
             :permission_group_entity_id
             (t2/select-one-fn :entity_id :model/PermissionsGroup :id (:permission_group_id old-links))})))
      (is (= old-links
             (select-keys (t2/select-one :model/DataApp :id (:id app)) (keys old-links)))))))

(deftest reconcile-resources-rejects-resources-linked-to-another-app-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [first-app         (create-data-app! "birds")
          first-links       (data-app.resources/ensure-resources! first-app)
          first-linked-app  (t2/select-one :model/DataApp :id (:id first-app))
          second-app        (create-data-app! "fish")
          second-links      (data-app.resources/ensure-resources! second-app)
          second-linked-app (t2/select-one :model/DataApp :id (:id second-app))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"linked to another data app"
           (data-app.resources/reconcile-resources!
            second-linked-app
            (data-app.resources/resource-entity-ids first-linked-app))))
      (is (= second-links
             (select-keys (t2/select-one :model/DataApp :id (:id second-app)) (keys second-links))))
      (is (= first-links
             (select-keys (t2/select-one :model/DataApp :id (:id first-app)) (keys first-links)))))))

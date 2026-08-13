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

(deftest reconcile-resources-keeps-matching-links-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [app       (create-data-app! "birds")
          links     (data-app.resources/ensure-resources! app)
          linked-app (t2/select-one :model/DataApp :id (:id app))
          entity-ids (data-app.resources/resource-entity-ids linked-app)]
      (is (=? (assoc links :changed? false)
              (data-app.resources/reconcile-resources! linked-app entity-ids))))))

(deftest reconcile-resources-rebinds-to-the-manifest-pair-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [app        (create-data-app! "birds")
          old-links  (data-app.resources/ensure-resources! app)
          new-pair   (create-resource-pair! "new")
          linked-app (t2/select-one :model/DataApp :id (:id app))]
      (is (=? {:resource_collection_id (:id (:collection new-pair))
               :permission_group_id     (:id (:group new-pair))
               :changed?                true}
              (data-app.resources/reconcile-resources!
               linked-app (manifest-resource-ids new-pair))))
      (is (= {:resource_collection_id (:id (:collection new-pair))
              :permission_group_id     (:id (:group new-pair))}
             (select-keys (t2/select-one :model/DataApp :id (:id app)) (keys old-links))))
      (is (every? true?
                  [(t2/exists? :model/Collection :id (:resource_collection_id old-links))
                   (t2/exists? :model/PermissionsGroup :id (:permission_group_id old-links))])))))

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

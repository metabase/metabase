(ns metabase-enterprise.database-routing.search-test
  "Indexed entity values are captured once, against the router database, and shared by every reader. A user whose
  queries are routed to a destination database sees different rows than the router holds, so they must not be shown
  those values in search results -- the same rule that already excludes sandboxed and impersonated users."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.indexed-entities.models.model-index :as model-index]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]))

(use-fixtures :each (fn [thunk] (binding [search.ingestion/*force-sync* true] (thunk))))

(deftest routed-user?-test
  (testing "with no router database nobody is routed"
    (mt/with-test-user :rasta
      (is (false? (perms/routed-user?)))))
  (mt/with-temp [:model/Database         _ {:name "sr-dest" :router_database_id (mt/id)}
                 :model/DatabaseRouter   _ {:database_id (mt/id) :user_attribute "db_name"}]
    (testing "a non-admin whose attribute resolves to a destination database is routed"
      (met/with-user-attributes! :rasta {"db_name" "sr-dest"}
        (mt/with-test-user :rasta
          (is (true? (perms/routed-user?))))))
    (testing "the __METABASE_ROUTER__ sentinel resolves to the router itself: not routed"
      (met/with-user-attributes! :rasta {"db_name" "__METABASE_ROUTER__"}
        (mt/with-test-user :rasta
          (is (false? (perms/routed-user?))))))
    (testing "a non-admin missing the attribute would be refused at query time, so counts as routed (fail closed)"
      (met/with-user-attributes! :rasta {}
        (mt/with-test-user :rasta
          (is (true? (perms/routed-user?))))))
    (testing "a superuser with no attribute defaults to the router itself: not routed"
      (mt/with-test-user :crowberto
        (is (false? (perms/routed-user?)))))
    (testing "a superuser whose attribute names a destination database is routed, same as at query time"
      (met/with-user-attributes! :crowberto {"db_name" "sr-dest"}
        (mt/with-test-user :crowberto
          (is (true? (perms/routed-user?))))))
    (testing "a superuser with the sentinel attribute is not routed"
      (met/with-user-attributes! :crowberto {"db_name" "__METABASE_ROUTER__"}
        (mt/with-test-user :crowberto
          (is (false? (perms/routed-user?))))))
    (testing "only routers the user can view data from count: a router they are blocked from never routes them"
      (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data :blocked :create-queries :no}}
        (testing "missing the attribute"
          (met/with-user-attributes! :rasta {}
            (mt/with-test-user :rasta
              (is (false? (perms/routed-user?))))))
        (testing "attribute naming a destination database"
          (met/with-user-attributes! :rasta {"db_name" "sr-dest"}
            (mt/with-test-user :rasta
              (is (false? (perms/routed-user?))))))))
    (testing "throws without a current user, like its sandbox / impersonation siblings"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"No current user found"
                            (perms/routed-user?))))))

(deftest routed-users-do-not-see-indexed-entities-test
  (mt/dataset airports
    ;; the engine fixture goes outside `with-temp`: a temp Database created around it is not cleaned up on H2
    (search.tu/with-appdb-search-and-legacy-search
      (mt/with-temp [:model/Card           model {:type          :model
                                                  :dataset_query (let [mp (mt/metadata-provider)]
                                                                   (lib/query mp (lib.metadata/table mp (mt/id :municipality))))
                                                  :collection_id nil}
                     :model/Database       _     {:name "sr-dest" :router_database_id (mt/id)}
                     :model/DatabaseRouter _     {:database_id (mt/id) :user_attribute "db_name"}]
        (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data      :unrestricted
                                                       :create-queries :query-builder-and-native}}
          (let [model-index (model-index/create (mt/$ids {:model-id   (:id model)
                                                          :pk-ref     $municipality.id
                                                          :value-ref  $municipality.name
                                                          :creator-id (mt/user->id :crowberto)}))
                search!     (fn [user]
                              (->> (mt/user-http-request user :get 200 "search" :q "rome" :models "indexed-entity")
                                   :data
                                   (filter (comp #{(:id model)} :model_id))
                                   (map :name)
                                   set))]
            (mt/with-test-user :crowberto (model-index/add-values! model-index))
            (testing "a non-admin who resolves to the router database sees the indexed values"
              (met/with-user-attributes! :rasta {"db_name" "__METABASE_ROUTER__"}
                (is (= #{"Rome"} (search! :rasta)))))
            (testing "the same user, routed to a destination database, does not"
              (met/with-user-attributes! :rasta {"db_name" "sr-dest"}
                (is (= #{} (search! :rasta)))))))))))

(deftest unrelated-router-does-not-hide-indexed-entities-test
  (testing "a router on a database the user is blocked from does not hide indexed values from other databases"
    (mt/dataset airports
      (search.tu/with-appdb-search-and-legacy-search
        (mt/with-temp [:model/Card           model  {:type          :model
                                                     :dataset_query (let [mp (mt/metadata-provider)]
                                                                      (lib/query mp (lib.metadata/table mp (mt/id :municipality))))
                                                     :collection_id nil}
                       :model/Database       router {:name "sr-unrelated-router"}
                       :model/Database       _      {:name "sr-dest" :router_database_id (:id router)}
                       :model/DatabaseRouter _      {:database_id (:id router) :user_attribute "tenant_db"}]
          (mt/with-all-users-data-perms-graph! {(mt/id)      {:view-data      :unrestricted
                                                              :create-queries :query-builder-and-native}
                                                (:id router) {:view-data      :blocked
                                                              :create-queries :no}}
            (let [model-index (model-index/create (mt/$ids {:model-id   (:id model)
                                                            :pk-ref     $municipality.id
                                                            :value-ref  $municipality.name
                                                            :creator-id (mt/user->id :crowberto)}))]
              (mt/with-test-user :crowberto (model-index/add-values! model-index))
              (met/with-user-attributes! :rasta {}
                (is (= #{"Rome"}
                       (->> (mt/user-http-request :rasta :get 200 "search" :q "rome" :models "indexed-entity")
                            :data
                            (filter (comp #{(:id model)} :model_id))
                            (map :name)
                            set)))))))))))

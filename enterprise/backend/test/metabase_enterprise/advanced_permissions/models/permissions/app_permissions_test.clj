(ns metabase-enterprise.advanced-permissions.models.permissions.app-permissions-test
  "Tests for /api/collection endpoints."
  (:require [clojure.test :refer :all]
            [metabase.models :refer [App Collection PermissionsGroup]]
            [metabase.models.permissions-group :as perms-group]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.test :as mt]
            [toucan.db :as db]))

(deftest graph-test
  (testing "GET /api/app/graph works only with advanced permissions"
    (premium-features-test/with-premium-features #{}
      (is (= "The granular app permission functionality is only enabled if you have a premium token with the advanced-permissions feature."
             (mt/user-http-request :crowberto :get 402 "app/graph")))))

  (premium-features-test/with-premium-features #{:advanced-permissions}
    (mt/with-temp* [Collection [{app-coll-id :id} {:location "/", :namespace :apps}]
                    App [{app-id :id} {:collection_id app-coll-id}]
                    PermissionsGroup [{group-id :id}]]
      (testing "GET /api/app/graph\n"
        (testing "Should be able to fetch the permissions graph for apps"
          (is (partial= {(:id (perms-group/admin)) {app-id "write"}
                         (:id (perms-group/all-users)) {app-id "none"}
                         group-id {app-id "none"}}
                        (:groups (mt/user-http-request :crowberto :get 200 "app/graph")))))

        (testing "have to be a superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "app/graph"))))))

    (mt/with-temp* [Collection [_ {:location "/"}]
                    Collection [{app-coll-id :id} {:location "/", :namespace :apps}]
                    App [{app-id :id} {:collection_id app-coll-id}]
                    PermissionsGroup [{group-id :id}]]
      (testing "All users' right to root collection is respected"
        (let [group-perms (:groups (mt/user-http-request :crowberto :get 200 "app/graph"))]
          (is (partial= {(:id (perms-group/admin)) {app-id "write"}
                         (:id (perms-group/all-users)) {app-id "none"}
                         group-id {app-id "none"}}
                        group-perms))
          (is (= #{app-id :root} (into #{} (mapcat keys) (vals group-perms)))
              "Shouldn't confuse collection IDs and app IDs"))))))

(deftest graph-update-test
  (testing "PUT /api/app/graph works only with advanced permissions"
    (premium-features-test/with-premium-features #{}
      (is (= "The granular app permission functionality is only enabled if you have a premium token with the advanced-permissions feature."
             (mt/user-http-request :crowberto :put 402 "app/graph" {:revision 0
                                                                    :groups {1 {1 "write"}}})))))

  (premium-features-test/with-premium-features #{:advanced-permissions}
    (let [max-coll-id (:id (db/select-one [Collection [:%max.id :id]]))
          max-app-id (:id (db/select-one [App [:%max.id :id]]))]
      (mt/with-temp* [Collection [{coll0-id :id} {:location "/", :namespace :apps}]
                      Collection [{coll1-id :id} {:location "/", :namespace :apps}]
                      App [{app-id :id :as app} {:collection_id (if (= max-app-id max-coll-id) coll1-id coll0-id)}]
                      PermissionsGroup [{group-id :id}]]
        (testing "PUT /api/app/graph\n"
          (testing "Initial assumptions should hold"
            (let [initial-graph (mt/user-http-request :crowberto :get 200 "app/graph")]
              (is (not= app-id (:collection_id app))
                  "The IDs of the app and its collection should be different. Fix the test!")
              (is (partial= {(:id (perms-group/admin)) {app-id "write"}
                             (:id (perms-group/all-users)) {app-id "none"}
                             group-id {app-id "none"}}
                            (:groups initial-graph))
                  "Unexpected initial state")))

          (testing "Should be able to update the permissions graph for a specific app\n"
            (let [initial-graph (mt/user-http-request :crowberto :get 200 "app/graph")
                  updated-graph (assoc-in initial-graph [:groups group-id app-id] "read")]
              (testing "Have to be a superuser"
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :put 403 "app/graph" updated-graph))))

              (testing "Superuser can update permissions for an app"
                (is (= (:groups updated-graph)
                       (:groups (mt/user-http-request :crowberto :put 200 "app/graph" updated-graph)))))))

          (testing "Should be able to update the permissions graph for the root\n"
            (let [initial-graph (mt/user-http-request :crowberto :get 200 "app/graph")
                  updated-graph (assoc-in initial-graph [:groups group-id :root] "read")]
              (testing "Have to be a superuser"
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :put 403 "app/graph" updated-graph))))

              (testing "Superuser can update permissions for the root"
                (is (= (:groups updated-graph)
                       (:groups (mt/user-http-request :crowberto :put 200 "app/graph" updated-graph))))))))))))

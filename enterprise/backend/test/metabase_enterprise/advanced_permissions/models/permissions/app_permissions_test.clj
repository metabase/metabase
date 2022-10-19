(ns metabase-enterprise.advanced-permissions.models.permissions.app-permissions-test
  "Tests for /api/collection endpoints."
  (:require [clojure.test :refer :all]
            [metabase.models :refer [App Collection PermissionsGroup]]
            [metabase.models.permissions-group :as perms-group]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.test :as mt]))

(deftest graph-test
  (testing "GET /api/app/graph works only with advanced permissions"
    (premium-features-test/with-premium-features #{}
      (is (= "The granular app permission functionality is only enabled if you have a premium token with the advanced-permissions feature."
             (mt/user-http-request :crowberto :get 402 "app/graph")))))

  (premium-features-test/with-premium-features #{:advanced-permissions}
    (mt/with-temp* [Collection [{app-coll-id :id} {:location "/"}]
                    App [{app-id :id} {:collection_id app-coll-id}]
                    PermissionsGroup [{group-id :id}]]
      (testing "GET /api/app/graph\n"
        (testing "Should be able to fetch the permissions graph for apps"
          (is (partial= {(:id (perms-group/admin)) {app-id "write"}
                         (:id (perms-group/all-users)) {app-id "write"}
                         group-id {app-id "none"}}
                        (:groups (mt/user-http-request :crowberto :get 200 "app/graph")))))

        (testing "have to be a superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "app/graph"))))))

    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp* [Collection [_ {:location "/"}]
                      Collection [{app-coll-id :id} {:location "/"}]
                      App [{app-id :id} {:collection_id app-coll-id}]
                      PermissionsGroup [{group-id :id}]]
        (testing "All users' right to root collection is respected"
          (let [group-perms (:groups (mt/user-http-request :crowberto :get 200 "app/graph"))]
            (is (partial= {(:id (perms-group/admin)) {app-id "write"}
                           (:id (perms-group/all-users)) {app-id "none"}
                           group-id {app-id "none"}}
                          group-perms))
            (is (= #{app-id} (into #{} (mapcat keys) (vals group-perms)))
                "Shouldn't confuse collection IDs and app IDs")))))))

(deftest graph-update-test
  (testing "PUT /api/app/graph works only with advanced permissions"
    (premium-features-test/with-premium-features #{}
      (is (= "The granular app permission functionality is only enabled if you have a premium token with the advanced-permissions feature."
             (mt/user-http-request :crowberto :put 402 "app/graph" {:revision 0
                                                                    :groups {1 {1 "write"}}})))))

  (premium-features-test/with-premium-features #{:advanced-permissions}
    (mt/with-temp* [Collection [{app-coll-id :id} {:location "/"}]
                    App [{app-id :id} {:collection_id app-coll-id}]
                    PermissionsGroup [{group-id :id}]]
      (testing "PUT /api/app/graph\n"
        (testing "Should be able to update the permissions graph for apps"
          (let [initial-graph (mt/user-http-request :crowberto :get 200 "app/graph")
                updated-graph (assoc-in initial-graph [:groups group-id app-id] "read")]
            (is (partial= {(:id (perms-group/admin)) {app-id "write"}
                           (:id (perms-group/all-users)) {app-id "write"}
                           group-id {app-id "none"}}
                          (:groups initial-graph))
                "Unexpected initial state")

            (testing "have to be a superuser"
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :rasta :put 403 "app/graph" updated-graph))))

            (testing "superuser can update"
              (is (= (:groups updated-graph)
                     (:groups (mt/user-http-request :crowberto :put 200 "app/graph" updated-graph)))))))))))

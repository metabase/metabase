(ns metabase-enterprise.advanced-permissions.api.application-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-permissions.models.permissions.application-permissions :as a-perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest application-permissions-test
  (t2.with-temp/with-temp [:model/PermissionsGroup _]
    (testing "GET /api/ee/advanced-permissions/application/graph"
      (mt/with-premium-features #{}
        (testing "Should require a token with `:advanced-permissions`"
          (mt/assert-has-premium-feature-error "Advanced Permissions" (mt/user-http-request :crowberto :get 402 "ee/advanced-permissions/application/graph"))))

      (mt/with-premium-features #{:advanced-permissions}
        (testing "have to be a superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "ee/advanced-permissions/application/graph"))))

        (testing "return application permissions for groups that has application permisions"
          (let [graph  (mt/user-http-request :crowberto :get 200 "ee/advanced-permissions/application/graph")
                groups (:groups graph)]
            (is (int? (:revision graph)))
            (is (partial= {(:id (perms-group/admin))
                           {:monitoring   "yes"
                            :setting      "yes"
                            :subscription "yes"}
                           (:id (perms-group/all-users))
                           {:monitoring   "no"
                            :setting      "no"
                            :subscription "yes"}}
                          groups))))))))

(deftest application-permissions-test-2
  (t2.with-temp/with-temp [:model/PermissionsGroup {group-id :id}]
    (testing "PUT /api/ee/advanced-permissions/application/graph"
      (let [current-graph (mt/with-premium-features #{:advanced-permissions}
                            (mt/user-http-request :crowberto :get 200 "ee/advanced-permissions/application/graph"))
            new-graph     (assoc-in current-graph [:groups group-id :setting] "yes")]

        (mt/with-premium-features #{}
          (testing "Should require a token with `:advanced-permissions`"
            (mt/assert-has-premium-feature-error "Advanced Permissions"
                                                 (mt/user-http-request :crowberto :put 402 "ee/advanced-permissions/application/graph" new-graph))))

        (mt/with-premium-features #{:advanced-permissions}
          (testing "have to be a superuser"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 "ee/advanced-permissions/application/graph" new-graph))))

          (testing "failed when revision is mismatched"
            (is (= "Looks like someone else edited the permissions and your data is out of date. Please fetch new data and try again."
                   (mt/user-http-request :crowberto :put 409 "ee/advanced-permissions/application/graph"
                                         (assoc new-graph :revision (inc (:revision new-graph)))))))

          (testing "successfully update application permissions"
            (is (partial= {(:id (perms-group/admin))
                           {:monitoring   "yes"
                            :setting      "yes"
                            :subscription "yes"}
                           group-id
                           {:monitoring   "no"
                            :setting      "yes"
                            :subscription "no"}}
                          (:groups (mt/user-http-request :crowberto :put 200 "ee/advanced-permissions/application/graph" new-graph)))))

          (testing "omits graph in response when skip-graph=true"
            (let [result (mt/user-http-request :crowberto :put 200 "ee/advanced-permissions/application/graph?skip-graph=true"
                                               (a-perms/graph))]
              (is (int? (:revision result)))
              (is (nil? (:groups result)))))

          (testing "omits revision ID check when force=true"
            (let [result (mt/user-http-request :crowberto :put 200 "ee/advanced-permissions/application/graph?force=true"
                                               (-> (a-perms/graph)
                                                   (update :revision dec)
                                                   (assoc-in [:groups group-id :monitoring] "yes")))]
              (is (partial= {group-id
                             {:monitoring   "yes"
                              :setting      "yes"
                              :subscription "no"}}
                            (:groups result))))))))))

(ns metabase-enterprise.advanced-permissions.api.application-test
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [PermissionsGroup]]
   [metabase.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest application-permissions-test
  (t2.with-temp/with-temp [PermissionsGroup _]
    (testing "GET /api/ee/advanced-permissions/application/graph"
      (mt/with-premium-features #{}
        (testing "Should require a token with `:advanced-permissions`"
          (is (= "Advanced Permissions is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                 (mt/user-http-request :crowberto :get 402 "ee/advanced-permissions/application/graph")))))

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
  (t2.with-temp/with-temp [PermissionsGroup {group-id :id}]
    (testing "PUT /api/ee/advanced-permissions/application/graph"
      (let [current-graph (mt/with-premium-features #{:advanced-permissions}
                            (mt/user-http-request :crowberto :get 200 "ee/advanced-permissions/application/graph"))
            new-graph     (assoc-in current-graph [:groups group-id :setting] "yes")]

        (mt/with-premium-features #{}
          (testing "Should require a token with `:advanced-permissions`"
            (is (= "Advanced Permissions is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                   (mt/user-http-request :crowberto :put 402 "ee/advanced-permissions/application/graph" new-graph)))))

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
                          (:groups (mt/user-http-request :crowberto :put 200 "ee/advanced-permissions/application/graph" new-graph))))))))))

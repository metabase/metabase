(ns metabase-enterprise.advanced-permissions.api.impersonation-test
  "Tests for creating and updating Connection Impersonation configs via the permisisons API"
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [PermissionsGroup]]
   [metabase.models.data-permissions.graph :as data-perms.graph]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest create-impersonation-policy-test
  (testing "/api/permissions/graph"
    (mt/with-premium-features #{:advanced-permissions}
      (testing "A connection impersonation policy can be created via the permissions graph endpoint"
        (mt/with-user-in-groups
          [group {:name "New Group"}
           _  [group]]
          (let [impersonation {:group_id  (u/the-id group)
                               :db_id     (mt/id)
                               :attribute "Attribute Name"}
                graph         (assoc (data-perms.graph/api-graph) :impersonations [impersonation])]
            (mt/user-http-request :crowberto :put 200 "permissions/graph" graph)
            (is (=? [impersonation]
                    (t2/select :model/ConnectionImpersonation :group_id (u/the-id group)))))

          (testing "A connection impersonation policy can be updated via the permissions graph endpoint"
            (let [impersonation {:group_id  (u/the-id group)
                                 :db_id     (mt/id)
                                 :attribute "New Attribute Name"}
                  graph         (assoc (data-perms.graph/api-graph) :impersonations [impersonation])]
              (mt/user-http-request :crowberto :put 200 "permissions/graph" graph)
              (is (=?
                   [{:group_id  (u/the-id group)
                     :db_id     (mt/id)
                     :attribute "New Attribute Name"}]
                   (t2/select :model/ConnectionImpersonation
                              :group_id (u/the-id group))))
              (is (= 1 (t2/count :model/ConnectionImpersonation :group_id (u/the-id group)))))))))))

(deftest fetch-impersonation-policy-test
  (testing "GET /api/ee/advanced-permissions/impersonation"
    (t2.with-temp/with-temp [PermissionsGroup               {group-id-1 :id} {}
                             PermissionsGroup               {group-id-2 :id} {}
                             :model/ConnectionImpersonation {impersonation-id-1 :id :as impersonation-1} {:group_id group-id-1
                                                                                                          :db_id    (mt/id)
                                                                                                          :attribute "Attribute Name 1"}
                             :model/ConnectionImpersonation {impersonation-id-2 :id :as impersonation-2} {:group_id group-id-2
                                                                                                          :db_id    (mt/id)
                                                                                                          :attribute "Attribute Name 2"}]
      (mt/with-premium-features #{:advanced-permissions}
        (testing "Test that we can fetch a list of all Connection Impersonations"
          (is (= [impersonation-1 impersonation-2]
                 (filter
                  #(#{impersonation-id-1 impersonation-id-2} (:id %))
                  (mt/user-http-request :crowberto :get 200 "ee/advanced-permissions/impersonation")))))

        (testing "Test that we can fetch the Connection Impersonation for a specific DB and group"
          (is (= impersonation-1
                 (mt/user-http-request :crowberto :get 200 "ee/advanced-permissions/impersonation"
                                       :group_id group-id-1 :db_id (mt/id)))))

        (testing "Test that a non-admin cannot fetch Connection Impersonation details"
          (mt/user-http-request :rasta :get 403 "ee/advanced-permissions/impersonation")))

      (testing "Test that the :advanced-permissions flag is required to fetch Connection Impersonation Details"
        (mt/with-premium-features #{}
          (mt/user-http-request :crowberto :get 402 "ee/advanced-permissions/impersonation"))))))

(deftest delete-impersonation-policy
  (testing "DELETE /api/ee/advanced-permissions/impersonation"
    (mt/with-premium-features #{:advanced-permissions}
      (testing "Test that a Connection Impersonation can be deleted by ID"
        (t2.with-temp/with-temp [PermissionsGroup               {group-id :id}         {}
                                 :model/ConnectionImpersonation {impersonation-id :id} {:group_id group-id
                                                                                        :db_id    (mt/id)
                                                                                        :attribute "Attribute Name"}]
          (mt/user-http-request :crowberto :delete 204 (format "ee/advanced-permissions/impersonation/%d" impersonation-id))
          (is (nil? (t2/select-one :model/ConnectionImpersonation :id impersonation-id)))))

      (testing "Test that a non-admin cannot delete a Connection Impersonation"
        (t2.with-temp/with-temp [PermissionsGroup               {group-id :id} {}
                                 :model/ConnectionImpersonation {impersonation-id :id :as impersonation}
                                                                {:group_id group-id
                                                                 :db_id    (mt/id)
                                                                 :attribute "Attribute Name"}]
          (mt/user-http-request :rasta :delete 403 (format "ee/advanced-permissions/impersonation/%d" impersonation-id))
          (is (= impersonation (t2/select-one :model/ConnectionImpersonation :id impersonation-id))))))

    (testing "Test that the :advanced-permissions flag is required to delete a Connection Impersonation"
      (mt/with-premium-features #{}
        (t2.with-temp/with-temp [PermissionsGroup               {group-id :id} {}
                                 :model/ConnectionImpersonation {impersonation-id :id :as impersonation}
                                                                {:group_id group-id
                                                                 :db_id    (mt/id)
                                                                 :attribute "Attribute Name"}]
          (mt/user-http-request :crowberto :get 402 "ee/advanced-permissions/impersonation")
          (is (= impersonation (t2/select-one :model/ConnectionImpersonation :id impersonation-id))))))))

(deftest delete-impersonation-policy-after-permissions-change-test
  (mt/with-premium-features #{:advanced-permissions}
    (testing "A connection impersonation policy is deleted automatically if the data permissions are changed"
      (t2.with-temp/with-temp [PermissionsGroup               {group-id :id} {}
                               :model/ConnectionImpersonation {impersonation-id :id}
                                                              {:group_id group-id
                                                               :db_id    (mt/id)
                                                               :attribute "Attribute Name"}]
        ;; Grant full data access to the DB and group
        (let [graph (assoc-in (data-perms.graph/api-graph)
                              [:groups group-id (mt/id) :view-data]
                              :unrestricted)]
          (mt/user-http-request :crowberto :put 200 "permissions/graph" graph))
        (is (nil? (t2/select-one :model/ConnectionImpersonation :id impersonation-id)))))

    (testing "A connection impersonation policy is not deleted if unrelated permissions are changed"
      (t2.with-temp/with-temp [PermissionsGroup               {group-id :id} {}
                               :model/ConnectionImpersonation {impersonation-id :id}
                                                              {:group_id group-id
                                                               :db_id    (mt/id)
                                                               :attribute "Attribute Name"}]
        ;; Grant full database editing permissions
        (let [graph (assoc-in (data-perms.graph/api-graph)
                              [:groups group-id (mt/id) :details]
                              :yes)]
          (mt/user-http-request :crowberto :put 200 "permissions/graph" graph))
        (is (not (nil? (t2/select-one :model/ConnectionImpersonation :id impersonation-id))))))))

(ns metabase-enterprise.data-studio.api.permissions-groups-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest fetch-groups-test
  (testing "GET /api/permissions/group - Data Analysts group is visible with the feature"
    (mt/with-premium-features #{:advanced-permissions}
      (is (contains? (set (map :id (mt/user-http-request :crowberto :get 200 "permissions/group")))
                     (:id (perms-group/data-analyst))))))
  (testing "GET /api/permissions/group - Data Analysts group is not visible without the feature"
    (mt/with-premium-features #{}
      (is (not (contains? (set (map :id (mt/user-http-request :crowberto :get 200 "permissions/group")))
                          (:id (perms-group/data-analyst))))))))

(defn- add-data-analyst!
  "Put the user with `user-id` in the Data Analysts group."
  [user-id]
  ;; additions are gated on the feature, so grant it for the setup
  (mt/with-premium-features #{:advanced-permissions}
    (perms/add-user-to-group! user-id (:id (perms-group/data-analyst)))))

(def ^:private no-permissions-message "You don't have permissions to do that.")

(deftest grandfathered-member-loses-data-studio-access-without-the-feature-test
  (testing "a Data Analysts member added under the feature is refused Data Studio once the feature is gone"
    (mt/with-temp [:model/User     {analyst-id :id} {}
                   :model/Database {db-id :id}      {}
                   :model/Table    {table-id :id}   {:db_id db-id}]
      (add-data-analyst! analyst-id)
      (mt/with-premium-features #{}
        (is (= no-permissions-message
               (mt/user-http-request analyst-id :post 403 "data-studio/table/edit"
                                     {:table_ids  [table-id]
                                      :data_layer "final"})))
        (is (= no-permissions-message
               (mt/user-http-request analyst-id :post 403 "data-studio/table/selection"
                                     {:table_ids [table-id]})))
        (is (not= :final (t2/select-one-fn :data_layer :model/Table :id table-id)))))))

(deftest superuser-keeps-data-studio-access-without-the-feature-test
  (testing "a superuser reaches Data Studio on a feature-less instance"
    (mt/with-temp [:model/Database {db-id :id}    {}
                   :model/Table    {table-id :id} {:db_id db-id}]
      (mt/with-premium-features #{}
        (is (= {} (mt/user-http-request :crowberto :post 200 "data-studio/table/edit"
                                        {:table_ids  [table-id]
                                         :data_layer "final"})))
        (is (= :final (t2/select-one-fn :data_layer :model/Table :id table-id)))
        (is (map? (mt/user-http-request :crowberto :post 200 "data-studio/table/selection"
                                        {:table_ids [table-id]})))))))

(deftest member-keeps-data-studio-access-with-the-feature-test
  (testing "a Data Analysts member reaches Data Studio while the feature is present"
    (mt/with-temp [:model/User     {analyst-id :id} {}
                   :model/Database {db-id :id}      {}
                   :model/Table    {table-id :id}   {:db_id db-id}]
      (add-data-analyst! analyst-id)
      (mt/with-premium-features #{:advanced-permissions}
        (is (= {} (mt/user-http-request analyst-id :post 200 "data-studio/table/edit"
                                        {:table_ids  [table-id]
                                         :data_layer "final"})))
        (is (= :final (t2/select-one-fn :data_layer :model/Table :id table-id)))
        (is (map? (mt/user-http-request analyst-id :post 200 "data-studio/table/selection"
                                        {:table_ids [table-id]})))))))

(deftest non-member-has-no-data-studio-access-without-the-feature-test
  (testing "a non-member gets no Data Studio access on a feature-less instance"
    (mt/with-temp [:model/User     {user-id :id}  {}
                   :model/Database {db-id :id}    {}
                   :model/Table    {table-id :id} {:db_id db-id}]
      (mt/with-premium-features #{}
        (is (= no-permissions-message
               (mt/user-http-request user-id :post 403 "data-studio/table/edit"
                                     {:table_ids  [table-id]
                                      :data_layer "final"})))
        (is (= no-permissions-message
               (mt/user-http-request user-id :post 403 "data-studio/table/selection"
                                     {:table_ids [table-id]})))))))

(deftest removing-a-member-on-a-feature-less-instance-is-allowed-test
  (testing "a member can be removed without the feature, and stays without Data Studio access afterwards"
    (mt/with-temp [:model/User     {analyst-id :id} {}
                   :model/Database {db-id :id}      {}
                   :model/Table    {table-id :id}   {:db_id db-id}]
      (add-data-analyst! analyst-id)
      (mt/with-premium-features #{}
        (perms/remove-user-from-group! analyst-id (:id (perms-group/data-analyst)))
        (is (not (t2/exists? :model/PermissionsGroupMembership
                             :user_id analyst-id :group_id (:id (perms-group/data-analyst)))))
        (is (= no-permissions-message
               (mt/user-http-request analyst-id :post 403 "data-studio/table/selection"
                                     {:table_ids [table-id]})))))))

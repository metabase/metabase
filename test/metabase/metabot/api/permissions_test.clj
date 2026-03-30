(ns metabase.metabot.api.permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private all-perm-types
  #{"permission/metabot"
    "permission/metabot-model"
    "permission/metabot-sql-generation"
    "permission/metabot-nql"
    "permission/metabot-other-tools"})

(deftest list-permissions-test
  (testing "GET /api/metabot/permissions"
    (testing "requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "metabot/permissions"))))
    (testing "returns default permissions for all groups even with no rows in the table"
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Test Group"}]
        (let [response (mt/user-http-request :crowberto :get 200 "metabot/permissions")
              perms    (->> (:permissions response)
                            (filter #(= (:group_id %) group-id)))]
          (is (= all-perm-types (set (map :perm_type perms))))
          (is (every? #(= "no" (:perm_value %))
                      (remove #(= "permission/metabot-model" (:perm_type %)) perms)))
          (is (= "small"
                 (->> perms
                      (filter #(= "permission/metabot-model" (:perm_type %)))
                      first
                      :perm_value))))))
    (testing "returns stored values when they exist, defaults for the rest"
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Test Group"}
                     :model/MetabotPermissions _ {:group_id   group-id
                                                  :perm_type  :permission/metabot-sql-generation
                                                  :perm_value :yes}
                     :model/MetabotPermissions _ {:group_id   group-id
                                                  :perm_type  :permission/metabot-model
                                                  :perm_value :small}]
        (let [response (mt/user-http-request :crowberto :get 200 "metabot/permissions")
              perms    (->> (:permissions response)
                            (filter #(= (:group_id %) group-id)))
              by-type  (into {} (map (juxt :perm_type :perm_value)) perms)]
          (is (= all-perm-types (set (map :perm_type perms))))
          (is (= "yes" (get by-type "permission/metabot-sql-generation")))
          (is (= "small" (get by-type "permission/metabot-model")))
          (is (= "no" (get by-type "permission/metabot-nql")))
          (is (= "no" (get by-type "permission/metabot-other-tools"))))))))

(deftest update-permissions-test
  (testing "PUT /api/metabot/permissions"
    (testing "requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 "metabot/permissions"
                                   {:permissions [{:group_id 1 :perm_type "permission/metabot-model" :perm_value "large"}]}))))
    (testing "upserts permissions across multiple groups"
      (mt/with-temp [:model/PermissionsGroup {group-a :id} {:name "Group A"}
                     :model/PermissionsGroup {group-b :id} {:name "Group B"}
                     :model/MetabotPermissions _ {:group_id   group-a
                                                  :perm_type  :permission/metabot-model
                                                  :perm_value :small}]
        (let [response (mt/user-http-request :crowberto :put 200 "metabot/permissions"
                                             {:permissions [{:group_id group-a :perm_type "permission/metabot-model" :perm_value "large"}
                                                            {:group_id group-a :perm_type "permission/metabot-sql-generation" :perm_value "yes"}
                                                            {:group_id group-b :perm_type "permission/metabot-nql" :perm_value "yes"}]})
              perms-a  (->> (:permissions response)
                            (filter #(= (:group_id %) group-a)))
              perms-b  (->> (:permissions response)
                            (filter #(= (:group_id %) group-b)))
              by-type  (fn [perms] (into {} (map (juxt :perm_type :perm_value)) perms))]
          ;; Group A: metabot-model updated from small->large, sql-generation inserted
          (is (= "large" (get (by-type perms-a) "permission/metabot-model")))
          (is (= "yes" (get (by-type perms-a) "permission/metabot-sql-generation")))
          ;; Group B: nql inserted
          (is (= "yes" (get (by-type perms-b) "permission/metabot-nql")))
          ;; Verify DB state: only one row per (group_id, perm_type)
          (is (= 1 (t2/count :model/MetabotPermissions :group_id group-a
                             :perm_type :permission/metabot-model))))))
    (testing "returns full permissions for all groups with defaults filled in"
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Test Group"}]
        (let [response (mt/user-http-request :crowberto :put 200 "metabot/permissions"
                                             {:permissions [{:group_id group-id :perm_type "permission/metabot-nql" :perm_value "yes"}]})
              perms    (->> (:permissions response)
                            (filter #(= (:group_id %) group-id)))]
          ;; Should return all perm types for the group, not just the one updated
          (is (= all-perm-types (set (map :perm_type perms)))))))))

(deftest user-permissions-test
  (testing "GET /api/metabot/permissions/user-permissions"
    (testing "requires authentication"
      (is (= "Unauthenticated"
             (mt/client :get 401 "metabot/permissions/user-permissions"))))
    (testing "superuser gets all-yes permissions"
      (let [perms (:permissions (mt/user-http-request :crowberto :get 200 "metabot/permissions/user-permissions"))]
        (is (= "yes" (:metabot perms)))
        (is (= "yes" (:metabot-sql-generation perms)))
        (is (= "yes" (:metabot-nql perms)))
        (is (= "yes" (:metabot-other-tools perms)))
        (is (= "large" (:metabot-model perms)))))
    (testing "non-admin user gets resolved permissions from their groups"
      (let [perms (:permissions (mt/user-http-request :rasta :get 200 "metabot/permissions/user-permissions"))]
        (is (= 5 (count perms)))
        (testing "all perm types are present with string values"
          (is (every? string? (vals perms))))))
    (testing "user in group with custom permissions gets those values"
      (mt/with-temp [:model/PermissionsGroup       {gid :id} {:name "Test Metabot Perms Group"}
                     :model/PermissionsGroupMembership _      {:group_id gid :user_id (mt/user->id :rasta)}
                     :model/MetabotPermissions      _         {:group_id   gid
                                                               :perm_type  :permission/metabot-sql-generation
                                                               :perm_value :yes}]
        (let [perms (:permissions (mt/user-http-request :rasta :get 200 "metabot/permissions/user-permissions"))]
          (is (= "yes" (:metabot-sql-generation perms))))))))

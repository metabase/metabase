(ns metabase-enterprise.metabot.api.permissions-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.metabot.permissions]
   [metabase-enterprise.metabot.settings :as metabot-settings]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def ^:private all-perm-types
  #{"permission/metabot"
    "permission/metabot-sql-generation"
    "permission/metabot-nlq"
    "permission/metabot-other-tools"})

(deftest ^:parallel list-permissions-test
  (mt/with-premium-features #{:ai-controls}
    (testing "GET /api/ee/ai-controls/permissions"
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/ai-controls/permissions"))))
      (testing "returns default permissions for all groups even with no rows in the table"
        (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Test Group"}]
          (let [response (mt/user-http-request :crowberto :get 200 "ee/ai-controls/permissions")
                perms    (->> (:permissions response)
                              (filter #(= (:group_id %) group-id)))]
            (is (= all-perm-types (set (map :perm_type perms))))
            (is (every? #(= "no" (:perm_value %)) perms)))))
      (testing "returns stored values when they exist, defaults for the rest"
        (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Test Group"}
                       :model/MetabotPermissions _ {:group_id   group-id
                                                    :perm_type  :permission/metabot-sql-generation
                                                    :perm_value :yes}]
          (let [response (mt/user-http-request :crowberto :get 200 "ee/ai-controls/permissions")
                perms    (->> (:permissions response)
                              (filter #(= (:group_id %) group-id)))
                by-type  (into {} (map (juxt :perm_type :perm_value)) perms)]
            (is (= all-perm-types (set (map :perm_type perms))))
            (is (= "yes" (get by-type "permission/metabot-sql-generation")))
            (is (= "no" (get by-type "permission/metabot-nlq")))
            (is (= "no" (get by-type "permission/metabot-other-tools"))))))
      (testing "response includes an :advanced key"
        (is (contains? (mt/user-http-request :crowberto :get 200 "ee/ai-controls/permissions")
                       :advanced))))))

(deftest list-permissions-advanced-flag-test
  (mt/with-premium-features #{:ai-controls}
    (testing "GET /api/ee/ai-controls/permissions reflects the metabot-advanced-permissions setting"
      (mt/with-temporary-setting-values [metabot-advanced-permissions false]
        (is (false? (:advanced (mt/user-http-request :crowberto :get 200 "ee/ai-controls/permissions")))))
      (mt/with-temporary-setting-values [metabot-advanced-permissions true]
        (is (true? (:advanced (mt/user-http-request :crowberto :get 200 "ee/ai-controls/permissions"))))))))

(deftest update-permissions-test
  (mt/with-premium-features #{:ai-controls}
    (testing "PUT /api/ee/ai-controls/permissions"
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 "ee/ai-controls/permissions"
                                     {:permissions [{:group_id 1 :perm_type "permission/metabot-sql-generation" :perm_value "yes"}]}))))
      (testing "upserts permissions across multiple groups"
        (mt/with-temp [:model/PermissionsGroup {group-a :id} {:name "Group A"}
                       :model/PermissionsGroup {group-b :id} {:name "Group B"}
                       :model/MetabotPermissions _ {:group_id   group-a
                                                    :perm_type  :permission/metabot-sql-generation
                                                    :perm_value :no}]
          (let [response (mt/user-http-request :crowberto :put 200 "ee/ai-controls/permissions"
                                               {:permissions [{:group_id group-a :perm_type "permission/metabot-sql-generation" :perm_value "yes"}
                                                              {:group_id group-a :perm_type "permission/metabot-nlq" :perm_value "yes"}
                                                              {:group_id group-b :perm_type "permission/metabot-other-tools" :perm_value "yes"}]})
                perms-a  (->> (:permissions response)
                              (filter #(= (:group_id %) group-a)))
                perms-b  (->> (:permissions response)
                              (filter #(= (:group_id %) group-b)))
                by-type  (fn [perms] (into {} (map (juxt :perm_type :perm_value)) perms))]
            (is (= "yes" (get (by-type perms-a) "permission/metabot-sql-generation")))
            (is (= "yes" (get (by-type perms-a) "permission/metabot-nlq")))
            (is (= "yes" (get (by-type perms-b) "permission/metabot-other-tools")))
            (is (= 1 (t2/count :model/MetabotPermissions :group_id group-a
                               :perm_type :permission/metabot-sql-generation))))))
      (testing "returns full permissions for all groups with defaults filled in"
        (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Test Group"}]
          (let [response (mt/user-http-request :crowberto :put 200 "ee/ai-controls/permissions"
                                               {:permissions [{:group_id group-id :perm_type "permission/metabot-nlq" :perm_value "yes"}]})
                perms    (->> (:permissions response)
                              (filter #(= (:group_id %) group-id)))]
            (is (= all-perm-types (set (map :perm_type perms))))))))))

(deftest ^:parallel user-permissions-with-custom-group-test
  (mt/with-premium-features #{:ai-controls}
    (testing "GET /api/metabot/permissions/user-permissions"
      (testing "user in group with custom permissions gets those values"
        (mt/with-temp [:model/PermissionsGroup           {gid :id} {:name "Test Metabot Perms Group"}
                       :model/PermissionsGroupMembership _         {:group_id gid :user_id (mt/user->id :rasta)}
                       :model/MetabotPermissions         _         {:group_id   gid
                                                                    :perm_type  :permission/metabot-sql-generation
                                                                    :perm_value :yes}]
          (let [perms (:permissions (mt/user-http-request :rasta :get 200 "metabot/permissions/user-permissions"))]
            (is (= "yes" (:metabot-sql-generation perms)))))))))

(deftest ^:parallel admin-endpoints-require-ai-controls-feature-test
  (testing "admin endpoints return 402 without :ai-controls feature"
    (mt/with-premium-features #{}
      (mt/assert-has-premium-feature-error "AI Controls"
                                           (mt/user-http-request :crowberto :get 402 "ee/ai-controls/permissions"))
      (mt/assert-has-premium-feature-error "AI Controls"
                                           (mt/user-http-request :crowberto :put 402 "ee/ai-controls/permissions"
                                                                 {:permissions []}))
      (mt/assert-has-premium-feature-error "AI Controls"
                                           (mt/user-http-request :crowberto :post 402 "ee/ai-controls/permissions/advanced"))
      (mt/assert-has-premium-feature-error "AI Controls"
                                           (mt/user-http-request :crowberto :delete 402 "ee/ai-controls/permissions/advanced")))))

(defn- do-with-metabot-permissions-snapshot
  "Snapshot all rows in `metabot_permissions` before `thunk`, and restore them afterwards.

  The POST/DELETE `/advanced` endpoints delete rows outside any `with-temp` scope, which wipes the
  migration-seeded rows for magic groups (all-internal-users, data-analyst, all-external-users) for
  the rest of the test run. Other tests (e.g. `resolve-user-permissions-default-test`) depend on
  those seed rows, so we snapshot and restore them here."
  [thunk]
  (let [snapshot (t2/select :model/MetabotPermissions)]
    (try
      (thunk)
      (finally
        (t2/delete! :model/MetabotPermissions)
        (when (seq snapshot)
          (t2/insert! :model/MetabotPermissions
                      (map #(select-keys % [:group_id :perm_type :perm_value]) snapshot)))))))

(defmacro ^:private with-metabot-permissions-snapshot
  "Wrap `body` in a snapshot/restore of the `metabot_permissions` table."
  [& body]
  `(do-with-metabot-permissions-snapshot (fn [] ~@body)))

(deftest enable-advanced-permissions-test
  (mt/with-premium-features #{:ai-controls}
    (testing "POST /api/ee/ai-controls/permissions/advanced"
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 "ee/ai-controls/permissions/advanced"))))
      (testing "removes All Users group custom permissions and returns full permissions"
        (with-metabot-permissions-snapshot
          (let [all-users-id (u/the-id (perms/all-users-group))]
            ;; Pre-clean any leftover rows for the magic All Users group to avoid unique-constraint violations.
            (t2/delete! :model/MetabotPermissions :group_id all-users-id)
            (mt/with-temporary-setting-values [metabot-advanced-permissions false]
              (mt/with-temp [:model/PermissionsGroup           {group-id :id} {:name "Other Group"}
                             :model/MetabotPermissions         _              {:group_id   all-users-id
                                                                               :perm_type  :permission/metabot-sql-generation
                                                                               :perm_value :yes}
                             :model/MetabotPermissions         _              {:group_id   group-id
                                                                               :perm_type  :permission/metabot-nlq
                                                                               :perm_value :yes}]
                (let [response (mt/user-http-request :crowberto :post 200 "ee/ai-controls/permissions/advanced")]
                  (is (map? response))
                  (is (contains? response :permissions))
                  (is (true? (:advanced response))
                      "Response should reflect advanced=true after enabling")
                  (is (true? (metabot-settings/metabot-advanced-permissions))
                      "metabot-advanced-permissions setting should flip to true")
                  (is (= 0 (t2/count :model/MetabotPermissions :group_id all-users-id))
                      "All Users custom permissions should be removed")
                  (is (= 1 (t2/count :model/MetabotPermissions :group_id group-id))
                      "Other group permissions should be untouched")
                  (let [all-users-perms (->> (:permissions response)
                                             (filter #(= (:group_id %) all-users-id)))]
                    (is (every? #(= "no" (:perm_value %)) all-users-perms)
                        "All Users permissions in response should reflect defaults (no)")))))))))))

(deftest disable-advanced-permissions-test
  (mt/with-premium-features #{:ai-controls}
    (testing "DELETE /api/ee/ai-controls/permissions/advanced"
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :delete 403 "ee/ai-controls/permissions/advanced"))))
      (testing "removes custom permissions from specific groups only, preserving All Users"
        (with-metabot-permissions-snapshot
          (let [all-users-id (u/the-id (perms/all-users-group))]
            ;; Pre-clean any leftover rows for the magic All Users group to avoid unique-constraint violations.
            (t2/delete! :model/MetabotPermissions :group_id all-users-id)
            (mt/with-temporary-setting-values [metabot-advanced-permissions true]
              (mt/with-temp [:model/PermissionsGroup           {group-id :id} {:name "Specific Group"}
                             :model/MetabotPermissions         _              {:group_id   all-users-id
                                                                               :perm_type  :permission/metabot-nlq
                                                                               :perm_value :yes}
                             :model/MetabotPermissions         _              {:group_id   group-id
                                                                               :perm_type  :permission/metabot-sql-generation
                                                                               :perm_value :yes}]
                (let [response (mt/user-http-request :crowberto :delete 200 "ee/ai-controls/permissions/advanced")]
                  (is (map? response))
                  (is (contains? response :permissions))
                  (is (false? (:advanced response))
                      "Response should reflect advanced=false after disabling")
                  (is (false? (metabot-settings/metabot-advanced-permissions))
                      "metabot-advanced-permissions setting should flip to false")
                  (is (= 0 (t2/count :model/MetabotPermissions :group_id group-id))
                      "Specific group custom permissions should be removed")
                  (is (= 1 (t2/count :model/MetabotPermissions :group_id all-users-id))
                      "All Users custom permissions should be untouched"))))))))))

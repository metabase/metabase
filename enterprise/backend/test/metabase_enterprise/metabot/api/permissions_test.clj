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
            (is (= 1 (t2/count :model/MetabotPermissions 'group_id group-a
                               'perm_type :permission/metabot-sql-generation))))))
      (testing "returns full permissions for all groups with defaults filled in"
        (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Test Group"}]
          (let [response (mt/user-http-request :crowberto :put 200 "ee/ai-controls/permissions"
                                               {:permissions [{:group_id group-id :perm_type "permission/metabot-nlq" :perm_value "yes"}]})
                perms    (->> (:permissions response)
                              (filter #(= (:group_id %) group-id)))]
            (is (= all-perm-types (set (map :perm_type perms))))))))))

(deftest user-permissions-with-custom-group-test
  (mt/with-premium-features #{:ai-controls}
    (testing "GET /api/metabot/permissions/user-permissions"
      (testing "in group-level mode a user in a group with custom permissions gets those values"
        (mt/with-temporary-setting-values [metabot-advanced-permissions true]
          (mt/with-temp [:model/PermissionsGroup           {gid :id} {:name "Test Metabot Perms Group"}
                         :model/PermissionsGroupMembership _         {:group_id gid :user_id (mt/user->id :rasta)}
                         :model/MetabotPermissions         _         {:group_id   gid
                                                                      :perm_type  :permission/metabot-sql-generation
                                                                      :perm_value :yes}]
            (let [perms (:permissions (mt/user-http-request :rasta :get 200 "metabot/permissions/user-permissions"))]
              (is (= "yes" (:metabot-sql-generation perms))))))))))

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

(defn- do-with-metabot-permissions-snapshot!
  "Snapshot all rows in `metabot_permissions` before `thunk`, and restore them afterwards.

  `DELETE /advanced` deletes rows outside any `with-temp` scope, which would wipe the migration-seeded rows
  for the data-analyst magic group for the rest of the test run."
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
  `(do-with-metabot-permissions-snapshot! (fn [] ~@body)))

(defn- group-perm-values
  "The `perm_value`s a permissions response reports for `group-id`, as a perm_type → perm_value map."
  [response group-id]
  (into {} (comp (filter #(= (:group_id %) group-id))
                 (map (juxt :perm_type :perm_value)))
        (:permissions response)))

(deftest enable-advanced-permissions-test
  (mt/with-premium-features #{:ai-controls}
    (testing "POST /api/ee/ai-controls/permissions/advanced"
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 "ee/ai-controls/permissions/advanced"))))
      (testing "removes the rows of every group outside group-level mode and keeps the rest"
        (with-metabot-permissions-snapshot
          (t2/delete! :model/MetabotPermissions)
          (let [all-users-id    (u/the-id (perms/all-users-group))
                all-external-id (u/the-id (perms/all-external-users-group))]
            (mt/with-temporary-setting-values [metabot-advanced-permissions false]
              (mt/with-temp [:model/PermissionsGroup   {group-id :id} {:name "Other Group"}
                             :model/MetabotPermissions _              {:group_id   all-users-id
                                                                       :perm_type  :permission/metabot
                                                                       :perm_value :yes}
                             :model/MetabotPermissions _              {:group_id   all-external-id
                                                                       :perm_type  :permission/metabot
                                                                       :perm_value :yes}
                             :model/MetabotPermissions _              {:group_id   group-id
                                                                       :perm_type  :permission/metabot-nlq
                                                                       :perm_value :yes}]
                (let [response (mt/user-http-request :crowberto :post 200 "ee/ai-controls/permissions/advanced")]
                  (is (=? {:advanced true} response))
                  (is (true? (metabot-settings/metabot-advanced-permissions)))
                  (is (= {group-id :permission/metabot-nlq}
                         (t2/select-fn->fn :group_id :perm_type :model/MetabotPermissions))
                      "only the groups group-level mode shows keep their rows")
                  (is (=? {"permission/metabot" "no"} (group-perm-values response all-users-id)))
                  (is (=? {"permission/metabot" "no"} (group-perm-values response all-external-id)))
                  (is (=? {"permission/metabot-nlq" "yes"} (group-perm-values response group-id))))))))))))

(deftest disable-advanced-permissions-test
  (mt/with-premium-features #{:ai-controls}
    (testing "DELETE /api/ee/ai-controls/permissions/advanced"
      (testing "requires superuser"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :delete 403 "ee/ai-controls/permissions/advanced"))))
      (testing "removes the rows of every group outside simple mode and keeps the rest"
        (with-metabot-permissions-snapshot
          (t2/delete! :model/MetabotPermissions)
          (let [all-users-id    (u/the-id (perms/all-users-group))
                all-external-id (u/the-id (perms/all-external-users-group))
                data-analyst-id (u/the-id (perms/data-analyst-group))]
            (mt/with-temporary-setting-values [metabot-advanced-permissions true]
              (mt/with-temp [:model/PermissionsGroup   {group-id :id} {:name "Specific Group"}
                             :model/MetabotPermissions _              {:group_id   all-users-id
                                                                       :perm_type  :permission/metabot-nlq
                                                                       :perm_value :yes}
                             :model/MetabotPermissions _              {:group_id   all-external-id
                                                                       :perm_type  :permission/metabot
                                                                       :perm_value :yes}
                             :model/MetabotPermissions _              {:group_id   data-analyst-id
                                                                       :perm_type  :permission/metabot
                                                                       :perm_value :yes}
                             :model/MetabotPermissions _              {:group_id   group-id
                                                                       :perm_type  :permission/metabot-sql-generation
                                                                       :perm_value :yes}]
                (let [response (mt/user-http-request :crowberto :delete 200 "ee/ai-controls/permissions/advanced")]
                  (is (=? {:advanced false} response))
                  (is (false? (metabot-settings/metabot-advanced-permissions)))
                  (is (= {all-users-id    :permission/metabot-nlq
                          all-external-id :permission/metabot}
                         (t2/select-fn->fn :group_id :perm_type :model/MetabotPermissions))
                      "only the simple-mode groups keep their rows")
                  (is (=? {"permission/metabot-sql-generation" "no"} (group-perm-values response group-id))))))))))))

(deftest mode-switch-is-atomic-test
  (mt/with-premium-features #{:ai-controls}
    (testing "a mode switch that fails part way through leaves both the mode and the rows alone"
      (with-metabot-permissions-snapshot
        (mt/with-temporary-setting-values [metabot-advanced-permissions true]
          (mt/with-temp [:model/PermissionsGroup   {group-id :id} {:name "Specific Group"}
                         :model/MetabotPermissions _              {:group_id   group-id
                                                                   :perm_type  :permission/metabot
                                                                   :perm_value :yes}]
            ;; Write the setting for real before throwing, so the failure has to undo the settings cache too.
            (mt/with-dynamic-fn-redefs [metabot-settings/metabot-advanced-permissions!
                                        (fn [advanced?]
                                          ((mt/original-fn #'metabot-settings/metabot-advanced-permissions!) advanced?)
                                          (throw (ex-info "boom" {})))]
              (mt/user-http-request :crowberto :delete 500 "ee/ai-controls/permissions/advanced"))
            (is (true? (metabot-settings/metabot-advanced-permissions))
                "the cached mode goes back to the one the database still holds")
            (is (t2/exists? :model/MetabotPermissions 'group_id group-id)
                "the rows the switch would have deleted are rolled back with it")))))))

(deftest mode-switch-rejected-under-env-var-test
  (mt/with-premium-features #{:ai-controls}
    (testing "the /advanced endpoints refuse to switch modes while an env var forces the setting"
      (with-metabot-permissions-snapshot
        (mt/with-temp [:model/PermissionsGroup   {group-id :id} {:name "Specific Group"}
                       :model/MetabotPermissions _              {:group_id   group-id
                                                                 :perm_type  :permission/metabot
                                                                 :perm_value :yes}]
          (mt/with-temp-env-var-value! [mb-metabot-advanced-permissions "true"]
            (let [msg "The permission mode is set by the MB_METABOT_ADVANCED_PERMISSIONS environment variable."]
              (is (= msg (mt/user-http-request :crowberto :delete 400 "ee/ai-controls/permissions/advanced")))
              (is (= msg (mt/user-http-request :crowberto :post 400 "ee/ai-controls/permissions/advanced"))))
            (is (t2/exists? :model/MetabotPermissions 'group_id group-id)
                "no rows are deleted by the refused switch")))))))

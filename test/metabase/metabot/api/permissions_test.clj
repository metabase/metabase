(ns metabase.metabot.api.permissions-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]))

(deftest ^:parallel user-permissions-test
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
    (testing "non-admin user gets resolved permissions"
      (let [perms (:permissions (mt/user-http-request :rasta :get 200 "metabot/permissions/user-permissions"))]
        (is (= 5 (count perms)))
        (testing "all perm types are present with string values"
          (is (every? string? (vals perms))))))
    (testing "user in group with custom permissions gets those values"
      (mt/with-premium-features #{:ai-controls}
        (mt/with-temp [:model/PermissionsGroup       {gid :id} {:name "Test Metabot Perms Group"}
                       :model/PermissionsGroupMembership _      {:group_id gid :user_id (mt/user->id :rasta)}
                       :model/MetabotPermissions      _         {:group_id   gid
                                                                 :perm_type  :permission/metabot-sql-generation
                                                                 :perm_value :yes}]
          (let [perms (:permissions (mt/user-http-request :rasta :get 200 "metabot/permissions/user-permissions"))]
            (is (= "yes" (:metabot-sql-generation perms)))))))))

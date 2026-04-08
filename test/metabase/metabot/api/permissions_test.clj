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
      (is (= {:metabot                "yes"
              :metabot-sql-generation "yes"
              :metabot-nlq            "yes"
              :metabot-other-tools    "yes"}
             (:permissions (mt/user-http-request :crowberto :get 200 "metabot/permissions/user-permissions")))))
    (testing "non-admin user gets resolved permissions with all perm types present"
      (let [perms (:permissions (mt/user-http-request :rasta :get 200 "metabot/permissions/user-permissions"))]
        (is (= 4 (count perms)))
        (is (every? string? (vals perms)))))
    (testing "response includes usage key"
      (is (contains? (mt/user-http-request :rasta :get 200 "metabot/permissions/user-permissions") :usage)))))

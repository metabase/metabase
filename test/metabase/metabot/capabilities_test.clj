(ns metabase.metabot.capabilities-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.capabilities :as capabilities]
   [metabase.metabot.tools.sql.common :as sql.common]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]))

(def ^:private claimed-capabilities
  #{"permission:save_questions"
    "permission:write_sql_queries"
    "permission:write_transforms"
    "frontend:navigate_user_v1"})

(deftest enforce-permissions-drops-sql-claim-without-native-permission-test
  (testing "a query-builder-only user keeps every capability except permission:write_sql_queries"
    (mt/with-no-data-perms-for-all-users!
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder)
      (mt/with-current-user (mt/user->id :rasta)
        (is (= #{"permission:save_questions" "frontend:navigate_user_v1"}
               (capabilities/enforce-permissions claimed-capabilities)))))))

(deftest enforce-permissions-keeps-sql-claim-with-native-permission-test
  (testing "a user with native permission keeps permission:write_sql_queries"
    (mt/with-no-data-perms-for-all-users!
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
      (mt/with-current-user (mt/user->id :rasta)
        (is (= #{"permission:save_questions" "permission:write_sql_queries" "frontend:navigate_user_v1"}
               (capabilities/enforce-permissions claimed-capabilities)))))))

(deftest enforce-permissions-drops-every-claim-without-data-permissions-test
  (testing "a user with no data permissions keeps only non-permission capabilities"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-current-user (mt/user->id :rasta)
        (is (= #{"frontend:navigate_user_v1"}
               (capabilities/enforce-permissions claimed-capabilities)))))))

(deftest enforce-permissions-keeps-every-claim-for-superuser-test
  (testing "a superuser keeps every claimed capability"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-current-user (mt/user->id :crowberto)
        (is (= claimed-capabilities
               (capabilities/enforce-permissions claimed-capabilities)))))))

(deftest enforce-permissions-passes-through-unrecognized-capabilities-test
  (testing "capabilities outside the permission namespace are never clamped"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-current-user (mt/user->id :rasta)
        (is (= #{"frontend:something_new" "some:other_capability"}
               (capabilities/enforce-permissions #{"frontend:something_new" "some:other_capability"})))))))

(deftest enforce-permissions-and-native-access-check-disagree-without-a-bound-user-test
  (testing "the tool-offering gate grants everything rather than throwing"
    (is (= claimed-capabilities (capabilities/enforce-permissions claimed-capabilities))))
  (testing "the per-database gate still refuses"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"do not have permission to write SQL queries"
                          (sql.common/check-native-query-access! (mt/id))))))

(deftest enforce-permissions-leaves-empty-capabilities-untouched-test
  (testing "an absent or empty capability set is returned as-is without a permission lookup"
    (is (nil? (capabilities/enforce-permissions nil)))
    (is (= #{} (capabilities/enforce-permissions #{})))))

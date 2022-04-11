(ns metabase-enterprise.advanced-permissions.api.monitoring-test
  "Permisisons tests for API that needs to be enforced by General Permissions of type `:monitoring`."
  (:require [clojure.test :refer :all]
            [metabase.models.permissions :as perms]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.test :as mt]))

(defn- user->name
  [user]
  (if (map? user) "non-admin" (name user)))

(deftest task-test
  (testing "/api/task/*"
    (mt/with-user-in-groups [group {:name "New Group"}
                             user  [group]]
      (letfn [(get-task [user status]
                (testing (format "get task with %s user" (user->name user))
                  (mt/user-http-request user :get status "task")))
              (get-task-info [user status]
                (testing (format "get task info with %s user" (user->name user))
                  (mt/user-http-request user :get status "task/info")))]
        (testing "if `advanced-permissions` is disabled, require admins"
          (premium-features-test/with-premium-features #{}
            (get-task user 403)
            (get-task-info user 403)
            (get-task :crowberto 200)
            (get-task-info :crowberto 200)))

        (testing "if `advanced-permissions` is enabled"
          (premium-features-test/with-premium-features #{:advanced-permissions}
            (testing "still fail if user's group doesn't have `monitoring` permission"
              (get-task user 403)
              (get-task-info user 403))

            (testing "allowed if user's group has `monitoring` permission"
              (perms/grant-general-permissions! group :monitoring)
              (get-task user 200)
              (get-task-info user 200))))))))

(deftest util-tset
  (testing "/api/util/"
    (mt/with-user-in-groups [group {:name "New Group"}
                             user  [group]]
      (letfn [(get-logs [user status]
                (testing (format "get logs with %s user" (user->name user))
                  (mt/user-http-request user :get status "util/logs")))
              (get-stats [user status]
                (testing (format "get stats with %s user" (user->name user))
                  (mt/user-http-request user :get status "util/stats")))
              (get-bug-report-detail [user status]
                (testing (format "get bug report details with %s user" (user->name user))
                  (mt/user-http-request user :get status "util/bug_report_details")))
              (get-db-connection-info [user status]
                (testing (format "get db connection info with %s user" (user->name user))
                  (mt/user-http-request user :get status "util/diagnostic_info/connection_pool_info")))]

        (testing "if `advanced-permissions` is disabled, require admins"
          (premium-features-test/with-premium-features #{}
            (get-logs user 403)
            (get-stats user 403)
            (get-bug-report-detail user 403)
            (get-db-connection-info user 403)
            (get-logs :crowberto 200)
            (get-stats :crowberto 200)
            (get-bug-report-detail :crowberto 200)
            (get-db-connection-info :crowberto 200)))

        (testing "if `advanced-permissions` is enabled"
          (premium-features-test/with-premium-features #{:advanced-permissions}
            (testing "still fail if user's group doesn't have `monitoring` permission"
              (get-logs user 403)
              (get-stats user 403)
              (get-bug-report-detail user 403)
              (get-db-connection-info user 403))

          (testing "allowed if user's group has `monitoring` permission"
            (perms/grant-general-permissions! group :monitoring)
            (get-logs user 200)
            (get-stats user 200)
            (get-bug-report-detail user 200)
            (get-db-connection-info user 200))))))))

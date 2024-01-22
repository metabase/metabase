(ns ^:mb/once metabase-enterprise.advanced-permissions.api.monitoring-test
  "Permisisons tests for API that needs to be enforced by Application Permissions of type `:monitoring`."
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [TaskHistory]]
   [metabase.models.permissions :as perms]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest task-test
  (testing "/api/task/*"
    (mt/with-user-in-groups [group {:name "New Group"}
                             user  [group]]
      (t2.with-temp/with-temp [TaskHistory task]
        (letfn [(get-tasks [user status]
                  (testing (format "get task with %s user" (mt/user-descriptor user))
                    (mt/user-http-request user :get status "task")))
                (get-single-task [user status]
                  (mt/user-http-request user :get status (format "task/%d" (:id task))))
                (get-task-info [user status]
                  (testing (format "get task info with %s user" (mt/user-descriptor user))
                    (mt/user-http-request user :get status "task/info")))]
          (testing "if `advanced-permissions` is disabled, require admins"
            (mt/with-premium-features #{}
              (get-tasks user 403)
              (get-single-task user 403)
              (get-task-info user 403)
              (get-tasks :crowberto 200)
              (get-single-task :crowberto 200)
              (get-task-info :crowberto 200)))

          (testing "if `advanced-permissions` is enabled"
            (mt/with-premium-features #{:advanced-permissions}
              (testing "still fail if user's group doesn't have `monitoring` permission"
                (get-tasks user 403)
                (get-single-task user 403)
                (get-task-info user 403))

              (testing "allowed if user's group has `monitoring` permission"
                (perms/grant-application-permissions! group :monitoring)
                (get-tasks user 200)
                (get-single-task user 200)
                (get-task-info user 200)))))))))

(deftest util-tset
  (testing "/api/util/"
    (mt/with-user-in-groups [group {:name "New Group"}
                             user  [group]]
      (letfn [(get-logs [user status]
                (testing (format "get logs with %s user" (mt/user-descriptor user))
                  (mt/user-http-request user :get status "util/logs")))
              (get-stats [user status]
                (testing (format "get stats with %s user" (mt/user-descriptor user))
                  (mt/user-http-request user :get status "util/stats")))
              (get-bug-report-detail [user status]
                (testing (format "get bug report details with %s user" (mt/user-descriptor user))
                  (mt/user-http-request user :get status "util/bug_report_details")))
              (get-db-connection-info [user status]
                (testing (format "get db connection info with %s user" (mt/user-descriptor user))
                  (mt/user-http-request user :get status "util/diagnostic_info/connection_pool_info")))]

        (testing "if `advanced-permissions` is disabled, require admins"
          (mt/with-premium-features #{}
            (get-logs user 403)
            (get-stats user 403)
            (get-bug-report-detail user 403)
            (get-db-connection-info user 403)
            (get-logs :crowberto 200)
            (get-stats :crowberto 200)
            (get-bug-report-detail :crowberto 200)
            (get-db-connection-info :crowberto 200)))

        (testing "if `advanced-permissions` is enabled"
          (mt/with-premium-features #{:advanced-permissions}
            (testing "still fail if user's group doesn't have `monitoring` permission"
              (get-logs user 403)
              (get-stats user 403)
              (get-bug-report-detail user 403)
              (get-db-connection-info user 403))

           (testing "allowed if user's group has `monitoring` permission"
             (perms/grant-application-permissions! group :monitoring)
             (get-logs user 200)
             (get-stats user 200)
             (get-bug-report-detail user 200)
             (get-db-connection-info user 200))))))))

(deftest persistence-test
  (testing "/api/persist"
    (mt/with-user-in-groups [group {:name "New Group"}
                             user [group]]
      (letfn [(fetch-persisted-info [user status]
                (testing (format "persist with %s user" (mt/user-descriptor user))
                  (mt/user-http-request user :get status "persist")))]

        (testing "if `advanced-permissions` is disabled, require admins,"
          (fetch-persisted-info :crowberto 200)
          (fetch-persisted-info user 403)
          (fetch-persisted-info :rasta 403))

        (testing "if `advanced-permissions` is enabled"
          (mt/with-premium-features #{:advanced-permissions}
            (testing "still fail if user's group doesn't have `setting` permission,"
              (fetch-persisted-info :crowberto 200)
              (fetch-persisted-info user 403)
              (fetch-persisted-info :rasta 403))

            (testing "succeed if user's group has `monitoring` permission,"
              (perms/grant-application-permissions! group :monitoring)
              (fetch-persisted-info :crowberto 200)
              (fetch-persisted-info user 200)
              (fetch-persisted-info :rasta 403))))))))

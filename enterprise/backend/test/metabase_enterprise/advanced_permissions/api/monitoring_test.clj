(ns metabase-enterprise.advanced-permissions.api.subscription-test
  "Permisisons tests for API that needs to be enforced by General Permissions of type `:monitoring`."
  (:require [clojure.test :refer :all]
            [metabase.models.permissions :as perms]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.test :as mt]))

(defn- user->name
  [user]
  (if (map? user) (:common_name user) (name user)))

(deftest task-test
  (testing "/api/task/*"
    (mt/with-user-in-groups [group {:name "New Group"}
                             user  [group]]
      (letfn [(get-task [user status]
                (testing (format "with user %s" (user->name user))
                  (mt/user-http-request user :get status "task")))
              (get-task-info [user status]
                (testing (format "with user %s" (user->name user))
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
  (testing "/api/util/*"
    (mt/with-user-in-groups [group {:name "New Group"}
                             user  [group]]
      (letfn [(get-logs [user status]
                (testing (format "with user %s" (user->name user))
                  (mt/user-http-request user :get status "util/logs")))
              (get-stats [user status]
                (testing (format "with user %s" (user->name user))
                  (mt/user-http-request user :get status "util/stats")))
              (get-bug-report-detail [user status]
                (testing (format "with user %s" (user->name user))
                  (mt/user-http-request user :get status "util/bug_report_details")))]

        (testing "if `advanced-permissions` is disabled, require admins"
          (premium-features-test/with-premium-features #{}
            (get-logs user 403)
            (get-stats user 403)
            (get-bug-report-detail user 403)
            (get-logs :crowberto 200)
            (get-stats :crowberto 200)
            (get-bug-report-detail :crowberto 200)))

        (testing "if `advanced-permissions` is enabled"
          (premium-features-test/with-premium-features #{:advanced-permissions}
            (testing "still fail if user's group doesn't have `monitoring` permission"
              (get-logs user 403)
              (get-stats user 403)
              (get-bug-report-detail user 403))

          (testing "allowed if user's group has `monitoring` permission"
            (perms/grant-general-permissions! group :monitoring)
            (get-logs user 200)
            (get-stats user 200)
            (get-bug-report-detail user 200))))))))

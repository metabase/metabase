(ns metabase-enterprise.security-center.task.sync-advisories-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.task.sync-advisories :as sync-advisories]
   [metabase.task.core :as task]
   [metabase.test :as mt]))

(deftest init-schedules-only-when-enabled-test
  (testing "task is registered when security center is enabled"
    (mt/with-premium-features #{:admin-security-center}
      (with-redefs [metabase.premium-features.token-check/is-trial? (constantly false)]
        (task/init! ::sync-advisories/SyncAdvisories)
        (is (task/job-exists? "metabase.task.security-center.sync-advisories.job")))))
  (testing "task is NOT registered when feature flag is absent"
    (task/delete-task!
     "metabase.task.security-center.sync-advisories.job"
     "metabase.task.security-center.sync-advisories.trigger")
    (mt/with-premium-features #{}
      (task/init! ::sync-advisories/SyncAdvisories)
      (is (not (task/job-exists? "metabase.task.security-center.sync-advisories.job"))))))

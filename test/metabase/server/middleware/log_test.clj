(ns metabase.server.middleware.log-test
  (:require
   [clojure.test :refer :all]
   [metabase.server.middleware.log :as mw.log]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest log-info-input-tests
  (testing "log-info handles nil status input"
    (is (true?
          (try
            (#'mw.log/log-info nil)
            true
            (catch Throwable _
              false)))))) ; Make sure it didn't throw NPE

;; just make sure `stats-test` can report application DB information correctly without barfing.
(deftest stats-test
  (testing `log/stats
    (is (re= #"^App DB connections:.*"
             (#'mw.log/stats (fn [] {:info true}))))))

(deftest should-log-request?-test
  (testing "Health check logging can be disabled via env var"
    (mt/with-temp-env-var-value! [mb-health-check-logging-enabled true]
      (is (#'mw.log/should-log-request? {:uri "/api/health"})))

    (mt/with-temp-env-var-value! [mb-health-check-logging-enabled false]
      (is (not (#'mw.log/should-log-request? {:uri "/api/health"}))))))

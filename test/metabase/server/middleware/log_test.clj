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
      (is (#'mw.log/should-log-request? {:uri "/api/health"}))
      (is (#'mw.log/should-log-request? {:uri "/livez"}))
      (is (#'mw.log/should-log-request? {:uri "/readyz"})))
    (mt/with-temp-env-var-value! [mb-health-check-logging-enabled false]
      (is (not (#'mw.log/should-log-request? {:uri "/api/health"})))
      (is (not (#'mw.log/should-log-request? {:uri "/livez"})))
      (is (not (#'mw.log/should-log-request? {:uri "/readyz"}))))))

(deftest log-api-call-captures-user-id-from-response-metadata-test
  (testing "log-api-call reads :metabase-user-id from response metadata (#74017)"
    (let [logged-user-id (promise)
          handler        (mw.log/log-api-call
                          (fn [_request respond _raise]
                            (respond (with-meta {:status 200 :body "ok"}
                                                {:metabase-user-id 42}))))]
      (with-redefs [mw.log/log-info (fn [info]
                                      (deliver logged-user-id (get-in info [:log-context :metabase-user-id])))]
        (handler {:request-method :post :uri "/api/session"}
                 identity
                 identity)
        (is (= 42 (deref logged-user-id 1000 :timed-out)))))))

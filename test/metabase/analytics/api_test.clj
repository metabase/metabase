(ns metabase.analytics.api-test
  "See also [[metabase-enterprise.advanced-permissions.api.monitoring-test/anonymous-stats-permission-test]]"
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(deftest ^:parallel permissions-test
  (testing "GET /api/analytics/anonymous-stats"
    (testing "Requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "analytics/anonymous-stats"))))
    (testing "Call successful for superusers"
      (is (map? (mt/user-http-request :crowberto :get 200 "analytics/anonymous-stats"))))))

(deftest ^:parallel internal-analytics-test
  (testing "POST /api/analytics/internal"
    (testing "accepts a valid batch of events"
      (is (nil? (mt/user-http-request :crowberto :post 204 "analytics/internal"
                                      {:events [{:op :inc :metric :test/counter :labels {:x "y"} :amount 1}
                                                {:op :observe :metric :test/histogram :amount 42}]}))))
    (testing "rejects invalid payload"
      (mt/user-http-request :rasta :post 400 "analytics/internal"
                            {:events [{:op :bad :metric :test/counter}]}))
    (testing "rejects missing events key"
      (mt/user-http-request :rasta :post 400 "analytics/internal"
                            {:not-events []}))))

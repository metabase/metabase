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

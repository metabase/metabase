(ns metabase.bug-reporting.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(deftest ^:parallel details-permissions-test
  (testing "GET /api/bug-reporting/details"
    (testing "Requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "bug-reporting/details"))))
    (testing "Call successful for superusers"
      (let [details (mt/user-http-request :crowberto :get 200 "bug-reporting/details")]
        (is (map? details))
        (testing "system-info includes JVM hardware info"
          (is (pos-int? (get-in details [:system-info :jvm.available-processors])))
          (is (string? (get-in details [:system-info :jvm.max-memory]))))))))

;;; see also [[metabase-enterprise.advanced-permissions.api.monitoring-test/connection-pool-info-permissions-test]]
(deftest ^:parallel connection-pool-details-permissions-test
  (testing "GET /api/bug-reporting/connection-pool-details"
    (testing "Requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "bug-reporting/connection-pool-details"))))
    (testing "Call successful for superusers"
      (is (map? (mt/user-http-request :crowberto :get 200 "bug-reporting/connection-pool-details"))))))

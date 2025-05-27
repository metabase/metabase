(ns metabase.api.util-test
  "Tests for /api/util"
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(deftest ^:parallel permissions-test-4
  (testing "/diagnostic_info/connection_pool_info"
    (testing "Requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "util/diagnostic_info/connection_pool_info"))))
    (testing "Call successful for superusers"
      (is (map? (mt/user-http-request :crowberto :get 200 "util/diagnostic_info/connection_pool_info"))))))

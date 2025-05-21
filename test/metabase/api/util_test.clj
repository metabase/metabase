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

(deftest ^:parallel openapi-test
  (testing "GET /api/util/openapi"
    (testing "Requires superuser"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "util/openapi"))))

    (testing "Call successful for superusers"
      (let [response (mt/user-http-request :crowberto :get 200 "util/openapi")]
        (is (map? response))
        (is (= "3.1.0" (:openapi response)))
        (is (= "Metabase API" (get-in response [:info :title])))
        (is (map? (:paths response)))
        (is (map? (:components response))))

      (testing "Response contains key components of API spec"
        (let [response (mt/user-http-request :crowberto :get 200 "util/openapi")
              path-keys (set (map pr-str (keys (:paths response))))]
          (is (contains? path-keys ":/api/card/"))
          (is (contains? path-keys ":/api/user/"))
          (is (contains? path-keys ":/api/dashboard/")))))))

(ns metabase-enterprise.product-analytics.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(deftest product-analytics-is-premium-only
  (testing "GET /api/ee/product-analytics/ requires the :product-analytics feature"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :get 402 "ee/product-analytics/"))))

(deftest product-analytics-works-with-token
  (testing "GET /api/ee/product-analytics/ works with the :product-analytics feature"
    (mt/with-premium-features #{:product-analytics}
      (is (= {:status "ok"}
             (mt/user-http-request :crowberto :get 200 "ee/product-analytics/"))))))

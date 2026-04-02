(ns metabase.app-db.pool-metrics-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server))

(deftest checkout-total-incremented-test
  (testing "HTTP requests bump the checkout-total counter with the matched route template as label"
    (mt/with-prometheus-system! [_ system]
      (mt/user-http-request :rasta :get 200 "user/current")
      (is (pos? (mt/metric-value system :metabase-db-connection/checkout-total {:endpoint "GET /user/current"}))
          "checkout-total should be positive after hitting /user/current")
      (mt/user-http-request :rasta :get 200 "collection/root/items")
      (is (pos? (mt/metric-value system :metabase-db-connection/checkout-total {:endpoint "GET /collection/root/items"}))
          "checkout-total should be positive after hitting /collection/root/items"))))

(deftest checkout-duration-incremented-test
  (testing "HTTP requests bump the checkout-duration-seconds-total counter"
    (mt/with-prometheus-system! [_ system]
      (mt/user-http-request :rasta :get 200 "user/current")
      (is (pos? (mt/metric-value system :metabase-db-connection/checkout-duration-seconds-total {:endpoint "GET /user/current"}))
          "checkout-duration-seconds-total should be positive after a request"))))

(deftest route-template-used-for-parameterized-endpoints-test
  (testing "endpoints with path params use the route template, not the actual param value"
    ;; Use t2/insert! + manual cleanup instead of with-temp so there's no open connection
    ;; binding that gets conveyed to the HTTP handler thread (which would suppress pool checkouts).
    (let [card-id (t2/insert-returning-pk! :model/Card (mt/with-temp-defaults :model/Card))]
      (try
        (mt/with-prometheus-system! [_ system]
          (mt/user-http-request :rasta :get 200 (str "card/" card-id))
          (is (pos? (mt/metric-value system :metabase-db-connection/checkout-total {:endpoint "GET /card/:id"}))
              "label should use :id template, not the actual card ID")
          (is (zero? (or (mt/metric-value system :metabase-db-connection/checkout-total
                                          {:endpoint (str "GET /card/" card-id)})
                         0))
              "there should be no label with the literal card ID"))
        (finally
          (t2/delete! :model/Card card-id))))))

(deftest no-metrics-for-404-test
  (testing "404 responses do not produce checkout metrics (route never matched)"
    (mt/with-prometheus-system! [_ system]
      (mt/user-http-request :rasta :get 404 "nonexistent-endpoint-that-does-not-exist")
      (is (zero? (or (mt/metric-value system :metabase-db-connection/checkout-total
                                      {:endpoint "/nonexistent-endpoint-that-does-not-exist"})
                     0))
          "checkout-total should be zero for a 404 endpoint")
      (is (zero? (or (mt/metric-value system :metabase-db-connection/checkout-duration-seconds-total
                                      {:endpoint "/nonexistent-endpoint-that-does-not-exist"})
                     0))
          "checkout-duration should be zero for a 404 endpoint"))))

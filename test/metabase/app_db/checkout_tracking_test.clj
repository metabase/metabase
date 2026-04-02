(ns metabase.app-db.checkout-tracking-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.checkout-tracking :as checkout-tracking]))

(set! *warn-on-reflection* true)

(deftest with-checkout-reason-test
  (testing "Default reason is :unknown"
    (is (= :unknown checkout-tracking/*checkout-reason*)))
  (testing "with-checkout-reason binds the reason"
    (checkout-tracking/with-checkout-reason :search-index
      (is (= :search-index checkout-tracking/*checkout-reason*))))
  (testing "Nested bindings work"
    (checkout-tracking/with-checkout-reason :search-index
      (checkout-tracking/with-checkout-reason :cluster-lock
        (is (= :cluster-lock checkout-tracking/*checkout-reason*)))
      (is (= :search-index checkout-tracking/*checkout-reason*)))))

(deftest get-tracked-connection-returns-working-proxy-test
  (testing "Proxied connection delegates method calls to underlying connection"
    (let [mock-conn (reify java.sql.Connection
                      (close [_] nil)
                      (unwrap [_ _] nil)
                      (isWrapperFor [_ _] false)
                      (isClosed [_] false))
          mock-ds   (reify javax.sql.DataSource
                      (getConnection [_] mock-conn))]
      (checkout-tracking/with-checkout-reason :test-reason
        (let [conn (checkout-tracking/get-tracked-connection mock-ds)]
          (is (false? (.isClosed conn)))
          (.close conn))))))

(deftest proxy-close-idempotent-test
  (testing "Closing a tracked connection twice only calls underlying close once"
    (let [close-count (atom 0)
          mock-conn   (reify java.sql.Connection
                        (close [_] (swap! close-count inc))
                        (unwrap [_ _] nil)
                        (isWrapperFor [_ _] false))
          mock-ds     (reify javax.sql.DataSource
                        (getConnection [_] mock-conn))]
      (checkout-tracking/with-checkout-reason :idempotent-test
        (let [conn (checkout-tracking/get-tracked-connection mock-ds)]
          (.close conn)
          (.close conn)
          (is (= 1 @close-count)))))))

(deftest connection-failure-does-not-leak-test
  (testing "If getConnection throws, no state is leaked"
    (let [mock-ds (reify javax.sql.DataSource
                    (getConnection [_] (throw (ex-info "connection refused" {}))))]
      (checkout-tracking/with-checkout-reason :fail-test
        (is (thrown? Exception (checkout-tracking/get-tracked-connection mock-ds)))))))

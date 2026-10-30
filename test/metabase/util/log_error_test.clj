(ns metabase.util.log-error-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.util.log-error :as log-error]))

(set! *warn-on-reflection* true)

(deftest ^:parallel log-data-test
  (testing "the entries each exception in the chain lists under `:log/keys`, and nothing else"
    (is (= {:card-id 2, :field-id 1, :field-name "PASSWORD"}
           (log-error/log-data
            (ex-info "outer" {:card-id 2, :secret "hunter2", :log/keys #{:card-id}}
                     (ex-info "inner" {:field-id 1, :field-name "PASSWORD", :log/keys #{:field-id :field-name}}))))))
  (testing "an inner exception's entry wins over an outer one's"
    (is (= {:card-id 1}
           (log-error/log-data
            (ex-info "outer" {:card-id 2, :log/keys #{:card-id}}
                     (ex-info "inner" {:card-id 1, :log/keys #{:card-id}}))))))
  (testing "a listed key that is absent is left out"
    (is (= {} (log-error/log-data (ex-info "boom" {:log/keys #{:card-id}})))))
  (testing "exceptions without ex-data, or without `:log/keys`, add nothing"
    (is (= {} (log-error/log-data (Exception. "boom" (ex-info "inner" {:card-id 1}))))))
  (testing "a malformed `:log/keys` gives nothing, so that it can't mask the original error"
    (is (= {} (log-error/log-data (ex-info "boom" {:card-id 1, :log/keys :card-id}))))))

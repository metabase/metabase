(ns metabase-enterprise.search.semantic.models.token-tracking-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.search.semantic.db :as semantic-search.db]
   [metabase-enterprise.search.semantic.models.token-tracking :as token-tracking]
   [metabase.analytics-interface.core :as analytics]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest record-tokens-failed-insert-test
  (testing "a failed insert is counted and swallowed"
    (let [counted (atom [])]
      (mt/with-dynamic-fn-redefs
        [semantic-search.db/insert-token-tracking! (fn [_] (throw (ex-info "appdb unavailable" {})))
         analytics/inc!                            (fn [& args] (swap! counted conj args))]
        (is (nil? (token-tracking/record-tokens "test-model" :query 12)))
        (is (= [[:metabase-search/semantic-token-tracking-failures {:model "test-model"}]]
               @counted))))))

(deftest record-tokens-interrupted-insert-test
  (testing "an interrupted insert propagates and is not counted as a failure"
    (let [counted (atom [])]
      (mt/with-dynamic-fn-redefs
        [semantic-search.db/insert-token-tracking! (fn [_] (throw (InterruptedException. "cancelled")))
         analytics/inc!                            (fn [& args] (swap! counted conj args))]
        (is (thrown? InterruptedException (token-tracking/record-tokens "test-model" :index 12)))
        (is (= [] @counted))))))

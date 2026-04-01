(ns metabase-enterprise.security-center.task.sync-advisories-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.fetch :as fetch]
   [metabase-enterprise.security-center.matching :as matching]
   [metabase-enterprise.security-center.task.sync-advisories :as sync-advisories]
   [metabase.premium-features.token-check :as token-check]
   [metabase.test :as mt]))

(deftest ^:parallel sync-and-evaluate-test
  (testing "skips when disabled"
    (let [called (atom [])]
      (mt/with-dynamic-fn-redefs [token-check/security-center-enabled? (constantly false)
                                  fetch/sync-advisories!               #(swap! called conj :fetch)
                                  matching/evaluate-all-advisories!     #(swap! called conj :evaluate)]
        (#'sync-advisories/sync-and-evaluate!)
        (is (empty? @called)))))
  (testing "runs fetch then evaluate"
    (let [called (atom [])]
      (mt/with-dynamic-fn-redefs [token-check/security-center-enabled? (constantly true)
                                  fetch/sync-advisories!               #(swap! called conj :fetch)
                                  matching/evaluate-all-advisories!     #(swap! called conj :evaluate)]
        (#'sync-advisories/sync-and-evaluate!)
        (is (= [:fetch :evaluate] @called)))))
  (testing "evaluate still runs when fetch throws"
    (let [called (atom [])]
      (mt/with-dynamic-fn-redefs [token-check/security-center-enabled? (constantly true)
                                  fetch/sync-advisories!               #(throw (Exception. "fetch failed"))
                                  matching/evaluate-all-advisories!     #(swap! called conj :evaluate)]
        (#'sync-advisories/sync-and-evaluate!)
        (is (= [:evaluate] @called))))))

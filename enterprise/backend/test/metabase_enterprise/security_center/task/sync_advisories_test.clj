(ns metabase-enterprise.security-center.task.sync-advisories-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.fetch :as fetch]
   [metabase-enterprise.security-center.matching :as matching]
   [metabase-enterprise.security-center.task.sync-advisories :as sync-advisories]
   [metabase.premium-features.token-check :as token-check]))

(deftest sync-and-evaluate-skips-when-disabled-test
  (let [called (atom #{})]
    (with-redefs [token-check/security-center-enabled? (constantly false)
                  fetch/sync-advisories!               #(swap! called conj :fetch)
                  matching/evaluate-all-advisories!     #(swap! called conj :evaluate)]
      (#'sync-advisories/sync-and-evaluate!)
      (is (empty? @called)))))

(deftest sync-and-evaluate-runs-both-steps-test
  (let [called (atom [])]
    (with-redefs [token-check/security-center-enabled? (constantly true)
                  fetch/sync-advisories!               #(swap! called conj :fetch)
                  matching/evaluate-all-advisories!     #(swap! called conj :evaluate)]
      (#'sync-advisories/sync-and-evaluate!)
      (is (= [:fetch :evaluate] @called)))))

(deftest sync-and-evaluate-continues-on-fetch-error-test
  (let [called (atom [])]
    (with-redefs [token-check/security-center-enabled? (constantly true)
                  fetch/sync-advisories!               #(throw (Exception. "fetch failed"))
                  matching/evaluate-all-advisories!     #(swap! called conj :evaluate)]
      (#'sync-advisories/sync-and-evaluate!)
      (is (= [:evaluate] @called)
          "evaluate should still run even if fetch throws"))))

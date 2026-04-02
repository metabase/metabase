(ns metabase-enterprise.security-center.task.sync-advisories-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.fetch :as fetch]
   [metabase-enterprise.security-center.matching :as matching]
   [metabase-enterprise.security-center.task.sync-advisories :as sync-advisories]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)))

(deftest sync-and-evaluate-test
  (testing "skips when disabled"
    (let [called (atom [])]
      (mt/with-dynamic-fn-redefs [premium-features/security-center-enabled? (constantly false)
                                  fetch/sync-advisories!               #(swap! called conj :fetch)
                                  matching/evaluate-all-advisories!     #(swap! called conj :evaluate)]
        (#'sync-advisories/sync-and-evaluate!)
        (is (empty? @called)))))
  (testing "runs fetch then evaluate"
    (let [called (atom [])]
      (mt/with-dynamic-fn-redefs [premium-features/security-center-enabled? (constantly true)
                                  fetch/sync-advisories!               #(swap! called conj :fetch)
                                  matching/evaluate-all-advisories!     #(swap! called conj :evaluate)]
        (#'sync-advisories/sync-and-evaluate!)
        (is (= [:fetch :evaluate] @called)))))
  (testing "evaluate still runs when fetch throws"
    (let [called (atom [])]
      (mt/with-dynamic-fn-redefs [premium-features/security-center-enabled? (constantly true)
                                  fetch/sync-advisories!               #(throw (Exception. "fetch failed"))
                                  matching/evaluate-all-advisories!     #(swap! called conj :evaluate)]
        (#'sync-advisories/sync-and-evaluate!)
        (is (= [:evaluate] @called)))))
  (testing "concurrent calls do not run sync-and-evaluate! in parallel"
    (let [running    (atom 0)
          max-conc   (atom 0)
          entered    (CountDownLatch. 1)
          finish     (CountDownLatch. 1)
          call-count (atom 0)]
      (mt/with-dynamic-fn-redefs [premium-features/security-center-enabled? (constantly true)
                                  fetch/sync-advisories!
                                  (fn []
                                    (swap! call-count inc)
                                    (swap! max-conc max (swap! running inc))
                                    (.countDown entered)
                                    (.await finish 5 TimeUnit/SECONDS)
                                    (swap! running dec))
                                  matching/evaluate-all-advisories! (constantly nil)]
        ;; first call blocks inside fetch
        (let [f1 (future (#'sync-advisories/sync-and-evaluate!))
              _  (.await entered 5 TimeUnit/SECONDS)
              ;; second call while first is still running
              f2 (future (#'sync-advisories/sync-and-evaluate!))]
          (.countDown finish)
          @f1 @f2)
        (is (= 1 @max-conc) "only one sync-and-evaluate! should run at a time")))))

(deftest sync-and-evaluate-e2e-test
  (testing "full flow: sync-and-evaluate! runs matching queries and updates match_status"
    (mt/test-helpers-set-global-values!
      (mt/with-temp [:model/SecurityAdvisory advisory
                     {:advisory_id       "SC-E2E-001"
                      :severity          "critical"
                      :title             "E2E test advisory"
                      :description       "Tests the full sync-and-evaluate flow"
                      :remediation       "Upgrade"
                      :affected_versions [{:min "0.1.0" :fixed "99.99.99"}]
                      :matching_query    {:default {:select [[1 :one]]}}
                      ;; query returns rows unconditionally — tests the full evaluate flow
                      :match_status      "not_affected"
                      :published_at      #t "2026-03-24T00:00:00Z"}]
        (mt/with-dynamic-fn-redefs [premium-features/security-center-enabled? (constantly true)
                                    fetch/sync-advisories!                    (constantly nil)]
          (#'sync-advisories/sync-and-evaluate!)
          (let [updated (t2/select-one :model/SecurityAdvisory (:id advisory))]
            (is (= :active (:match_status updated)))
            (is (some? (:last_evaluated_at updated)))))))))

(ns metabase-enterprise.security-center.task.sync-advisories-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.fetch :as fetch]
   [metabase-enterprise.security-center.matching :as matching]
   [metabase-enterprise.security-center.task.sync-advisories :as sync-advisories]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest sync-and-evaluate-test
  (testing "skips when disabled"
    (let [called (atom [])]
      (mt/with-dynamic-fn-redefs [premium-features/security-center-enabled? (constantly false)
                                  fetch/sync-advisories!                    #(swap! called conj :fetch)
                                  matching/evaluate-all-advisories!         #(swap! called conj :evaluate)]
        (#'sync-advisories/sync-and-evaluate!)
        (is (empty? @called)))))
  (testing "runs fetch then evaluate"
    (let [called (atom [])]
      (mt/with-premium-features #{:admin-security-center}
        (mt/with-dynamic-fn-redefs [premium-features/security-center-enabled? (constantly true)
                                    fetch/sync-advisories!                    #(swap! called conj :fetch)
                                    matching/evaluate-all-advisories!         #(swap! called conj :evaluate)]
          (#'sync-advisories/sync-and-evaluate!)
          (is (= [:fetch :evaluate] @called))))))
  (testing "evaluate still runs when fetch throws"
    (let [called (atom [])]
      (mt/with-premium-features #{:admin-security-center}
        (mt/with-dynamic-fn-redefs [premium-features/security-center-enabled? (constantly true)
                                    fetch/sync-advisories!                    #(throw (Exception. "fetch failed"))
                                    matching/evaluate-all-advisories!         #(swap! called conj :evaluate)]
          (#'sync-advisories/sync-and-evaluate!)
          (is (= [:evaluate] @called)))))))

(deftest sync-and-evaluate-e2e-test
  (testing "full flow: sync-and-evaluate! runs matching queries and updates match_status"
    (with-redefs [config/mb-version-info {:tag "v1.55.0"}]
      (mt/with-premium-features #{:admin-security-center}
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
                          :published_at      #t "2026-03-24T00:00:00Z"
                          :updated_at        #t "2026-03-24T00:00:00Z"}]
            (mt/with-dynamic-fn-redefs [premium-features/security-center-enabled? (constantly true)
                                        fetch/sync-advisories!                    (constantly nil)]
              (#'sync-advisories/sync-and-evaluate!)
              (let [updated (t2/select-one :model/SecurityAdvisory (:id advisory))]
                (is (= :active (:match_status updated)))
                (is (some? (:last_evaluated_at updated)))))))))))

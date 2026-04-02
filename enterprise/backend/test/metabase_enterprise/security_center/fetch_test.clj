(ns metabase-enterprise.security-center.fetch-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.fetch :as fetch]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- make-advisory
  "Build a minimal advisory map. `overrides` are merged in."
  [advisory-id & {:as overrides}]
  (merge {:advisory_id       advisory-id
          :severity          "high"
          :title             (str "Advisory " advisory-id)
          :description       "Test advisory"
          :remediation       "Upgrade"
          :affected_versions [{:min "0.1.0" :fixed "99.99.99"}]
          :matching_query    nil
          :match_status      "unknown"
          :published_at      #t "2026-03-24T00:00:00Z"}
         overrides))

(deftest sync-advisories-inserts-new-test
  (mt/with-model-cleanup [:model/SecurityAdvisory]
    (with-redefs [fetch/fetch-advisories-from-store (constantly [(make-advisory "SC-FETCH-001")])]
      (fetch/sync-advisories!)
      (let [row (t2/select-one :model/SecurityAdvisory :advisory_id "SC-FETCH-001")]
        (is (some? row))
        (is (=? {:advisory_id  "SC-FETCH-001"
                 :match_status :unknown
                 :fetched_at   some?}
                row))))))

(deftest sync-advisories-updates-existing-test
  (mt/with-temp [:model/SecurityAdvisory _existing
                 (make-advisory "SC-FETCH-002" :severity "low" :title "Old title" :match_status "active")]
    (with-redefs [fetch/fetch-advisories-from-store
                  (constantly [(make-advisory "SC-FETCH-002" :title "New title" :severity "critical")])]
      (fetch/sync-advisories!)
      (is (=? {:title        "New title"
               :severity     :critical
               :match_status :active}
              (t2/select-one :model/SecurityAdvisory :advisory_id "SC-FETCH-002"))))))

(deftest sync-advisories-preserves-acknowledgement-test
  (mt/with-temp [:model/SecurityAdvisory _existing
                 (make-advisory "SC-FETCH-003"
                                :match_status    "active"
                                :acknowledged_by (mt/user->id :rasta)
                                :acknowledged_at #t "2026-03-25T00:00:00Z")]
    (with-redefs [fetch/fetch-advisories-from-store
                  (constantly [(make-advisory "SC-FETCH-003" :title "Updated title")])]
      (fetch/sync-advisories!)
      (is (=? {:title           "Updated title"
               :acknowledged_by some?
               :acknowledged_at some?}
              (t2/select-one :model/SecurityAdvisory :advisory_id "SC-FETCH-003"))))))

(deftest sync-advisories-parses-edn-matching-query-test
  (testing "matching_query arrives as an EDN string from the API and is parsed into a map"
    (let [edn-string "{:default {:select [1] :from [:core_user] :where [:= :email \"x\"] :limit 1}}"
          expected   {:default {:select [1] :from [:core_user] :where [:= :email "x"] :limit 1}}]
      (mt/with-model-cleanup [:model/SecurityAdvisory]
        (with-redefs [fetch/fetch-advisories-from-store
                      (constantly [(make-advisory "SC-EDN-001" :matching_query edn-string)])]
          (fetch/sync-advisories!)
          (is (= expected
                 (:matching_query (t2/select-one :model/SecurityAdvisory :advisory_id "SC-EDN-001")))))))))

(deftest sync-advisories-handles-fetch-error-test
  (testing "network error doesn't throw"
    (with-redefs [fetch/fetch-advisories-from-store (fn [] (throw (Exception. "connection refused")))]
      (is (nil? (fetch/sync-advisories!))))))

(deftest sync-advisories-handles-upsert-error-test
  (testing "error on one advisory doesn't block others"
    (mt/with-model-cleanup [:model/SecurityAdvisory]
      (with-redefs [fetch/fetch-advisories-from-store
                    (constantly [(make-advisory "SC-FETCH-BAD" :severity "not-a-valid-severity!!!")
                                 (make-advisory "SC-FETCH-GOOD")])]
        (fetch/sync-advisories!)
        (testing "good advisory was still inserted"
          (is (some? (t2/select-one :model/SecurityAdvisory :advisory_id "SC-FETCH-GOOD"))))))))

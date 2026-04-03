(ns metabase-enterprise.security-center.matching-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.matching :as matching]
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(deftest ^:parallel parse-version-test
  (testing "3-segment versions"
    (are [expected input] (= expected (matching/parse-version input))
      [1 57 0 1]  "v1.57.0"
      [1 57 0 1]  "1.57.0"
      [0 50 2 1]  "v0.50.2"
      [1 57 16 1] "v1.57.16"))
  (testing "4-segment hotfix versions"
    (are [expected input] (= expected (matching/parse-version input))
      [0 55 17 5 1]   "v0.55.17.5"
      [0 58 8 6 1]    "v0.58.8.6"
      [0 50 99 123 1] "v0.50.99.123"))
  (testing "pre-release versions — suffix numbers excluded"
    (are [expected input] (= expected (matching/parse-version input))
      [0 57 0 0]   "v0.57.0-beta"
      [0 58 0 3 0] "v0.58.0.3-beta"
      [0 59 0 1 0] "v0.59.0.1-beta"
      [0 21 0 0]   "v0.21.0-rc1"
      [0 38 0 0]   "v0.38.0-preview"))
  (testing "edition prefix preserved — 0.57 and 1.57 are distinct for range matching"
    (is (not= (matching/parse-version "v0.57.0")
              (matching/parse-version "v1.57.0"))))
  (testing "pre-release sorts before stable"
    (is (neg? (compare (matching/parse-version "v0.58.0-beta")
                       (matching/parse-version "v0.58.0")))))
  (testing "hotfix sorts after base"
    (is (pos? (compare (matching/parse-version "v0.55.17.5")
                       (matching/parse-version "v0.55.17")))))
  (testing "invalid formats return nil"
    (are [input] (nil? (matching/parse-version input))
      "vLOCAL_DEV"
      nil
      "")))

(deftest ^:parallel evaluate-advisory-test
  (let [single-range  {:affected_versions [{:min "1.57.0" :fixed "1.57.16"}]}
        multi-range   {:affected_versions [{:min "1.57.0" :fixed "1.57.16"}
                                           {:min "1.58.0" :fixed "1.58.10"}]}
        narrow-range  {:affected_versions [{:min "0.50.0" :fixed "0.50.2"}]}]
    (testing "query result takes priority over version"
      (are [expected version query-result]
           (= expected (matching/evaluate-advisory single-range version query-result))
        :not_affected [1 57 5 1]  false
        :not_affected [1 57 16 1] false
        :error        [1 57 5 1]  :error
        :error        [1 57 16 1] :error))
    (testing "single range — version determines active vs resolved"
      (are [expected version]
           (= expected (matching/evaluate-advisory single-range version true))
        :active   [1 57 0 1]      ; at min boundary
        :active   [1 57 5 1]      ; mid-range
        :active   [1 57 15 1]     ; one patch before fixed
        :resolved [1 57 16 1]     ; at fixed boundary
        :resolved [1 57 17 1]     ; one patch after fixed
        :resolved [1 57 20 1]     ; well past fixed
        :resolved [1 56 0 1]      ; before range
        :resolved [1 59 0 1]      ; past range
        :resolved [0 57 5 1]))    ; OSS doesn't match EE range
    (testing "nil version (LOCAL_DEV) → active when query matches"
      (is (= :active (matching/evaluate-advisory single-range nil true))))
    (testing "nil version + no match → not_affected"
      (is (= :not_affected (matching/evaluate-advisory single-range nil false))))
    (testing "nil version + error → error"
      (is (= :error (matching/evaluate-advisory single-range nil :error))))
    (testing "multiple ranges"
      (are [expected version]
           (= expected (matching/evaluate-advisory multi-range version true))
        :active   [1 57 5 1]      ; in first range
        :active   [1 58 3 1]      ; in second range
        :active   [1 58 0 1]      ; at second range min boundary
        :resolved [1 57 20 1]     ; between ranges (patched for first, before second)
        :resolved [1 58 10 1]     ; at second range fixed boundary
        :resolved [1 59 0 1]))    ; past all ranges
    (testing "narrow patch range [0.50.0, 0.50.2)"
      (are [expected version]
           (= expected (matching/evaluate-advisory narrow-range version true))
        :active   [0 50 0 1]      ; at min
        :active   [0 50 1 1]      ; mid-range
        :resolved [0 50 2 1]      ; at fixed
        :resolved [1 0 0 1]))     ; major version jump
    (testing "hotfix version resolves advisory"
      (is (= :resolved (matching/evaluate-advisory single-range [1 57 16 1 1] true))))
    (testing "pre-release of fixed version is still affected"
      (is (= :active (matching/evaluate-advisory single-range [1 57 16 0] true))))
    (testing "empty affected_versions — query matches but no ranges → resolved"
      (is (= :resolved (matching/evaluate-advisory {:affected_versions []} [1 57 5 1] true))))))

(deftest execute-matching-query-test
  (testing "nil query means affects all — returns true"
    (is (true? (matching/execute-matching-query! nil))))
  (testing "query that matches"
    (is (true? (matching/execute-matching-query!
                {:default {:select [1] :from [:core_user] :limit 1}}))))
  (testing "query that doesn't match"
    (is (false? (matching/execute-matching-query!
                 {:default {:select [1] :from [:core_user]
                            :where [:= :email "nonexistent-user@example.com"] :limit 1}}))))
  (testing "dialect-specific query is preferred over default"
    (is (true? (matching/execute-matching-query!
                {(mdb/db-type) {:select [1] :from [:core_user] :limit 1}
                 :default      {:select [1] :from [:core_user]
                                :where [:= :email "nonexistent@example.com"] :limit 1}}))))
  (testing "falls back to :default when dialect not present"
    (is (true? (matching/execute-matching-query!
                {:some_other_db {:select [1] :from [:core_user]
                                 :where [:= :email "nonexistent@example.com"] :limit 1}
                 :default       {:select [1] :from [:core_user] :limit 1}}))))
  (testing "no dialect match and no default → :error"
    (is (= :error (matching/execute-matching-query!
                   {:some_other_db {:select [1] :from [:core_user] :limit 1}}))))
  (testing "query against missing table returns :error"
    (is (= :error (matching/execute-matching-query!
                   {:default {:select [1] :from [:nonexistent_table_xyz] :limit 1}}))))
  (when-not (= :h2 (mdb/db-type))
    (testing "write query is rejected by read-only connection"
      (matching/execute-matching-query!
       {:default {:delete-from :core_user}})
      (testing "no rows were actually deleted"
        (is (pos? (t2/count :model/User)))))))

(deftest evaluate-advisory!-test
  (testing "query matches + version in range → active"
    (mt/with-temp [:model/SecurityAdvisory advisory
                   {:advisory_id       "SC-MATCH-001"
                    :severity          "critical"
                    :title             "Test"
                    :description       "Test"
                    :remediation       "Upgrade"
                    :affected_versions [{:min "0.1.0" :fixed "99.99.99"}]
                    :matching_query    {:default {:select [1] :from [:core_user] :limit 1}}
                    :match_status      "not_affected"
                    :published_at      #t "2026-03-24T00:00:00Z"
                    :updated_at        #t "2026-03-24T00:00:00Z"}]
      (matching/evaluate-advisory! advisory)
      (is (=? {:match_status     :active
               :last_evaluated_at some?}
              (t2/select-one :model/SecurityAdvisory :id (:id advisory))))))
  (testing "query doesn't match → not_affected"
    (mt/with-temp [:model/SecurityAdvisory advisory
                   {:advisory_id       "SC-MATCH-002"
                    :severity          "high"
                    :title             "Test"
                    :description       "Test"
                    :remediation       "Upgrade"
                    :affected_versions [{:min "0.1.0" :fixed "99.99.99"}]
                    :matching_query    {:default {:select [1] :from [:core_user]
                                                  :where [:= :email "nonexistent@example.com"] :limit 1}}
                    :match_status      "active"
                    :published_at      #t "2026-03-24T00:00:00Z"
                    :updated_at        #t "2026-03-24T00:00:00Z"}]
      (matching/evaluate-advisory! advisory)
      (is (=? {:match_status :not_affected}
              (t2/select-one :model/SecurityAdvisory :id (:id advisory))))))
  (testing "nil matching_query (affects all) + version in range → active"
    (mt/with-temp [:model/SecurityAdvisory advisory
                   {:advisory_id       "SC-MATCH-003"
                    :severity          "medium"
                    :title             "Test"
                    :description       "Test"
                    :remediation       "Upgrade"
                    :affected_versions [{:min "0.1.0" :fixed "99.99.99"}]
                    :matching_query    nil
                    :match_status      "not_affected"
                    :published_at      #t "2026-03-24T00:00:00Z"
                    :updated_at        #t "2026-03-24T00:00:00Z"}]
      (matching/evaluate-advisory! advisory)
      (is (=? {:match_status :active}
              (t2/select-one :model/SecurityAdvisory :id (:id advisory))))))
  (testing "query error → error status persisted"
    (mt/with-temp [:model/SecurityAdvisory advisory
                   {:advisory_id       "SC-MATCH-004"
                    :severity          "low"
                    :title             "Test"
                    :description       "Test"
                    :remediation       "Upgrade"
                    :affected_versions [{:min "0.1.0" :fixed "99.99.99"}]
                    :matching_query    {:default {:select [1] :from [:nonexistent_table] :limit 1}}
                    :match_status      "not_affected"
                    :published_at      #t "2026-03-24T00:00:00Z"
                    :updated_at        #t "2026-03-24T00:00:00Z"}]
      (matching/evaluate-advisory! advisory)
      (is (=? {:match_status      :error
               :last_evaluated_at some?}
              (t2/select-one :model/SecurityAdvisory :id (:id advisory)))))))

(deftest evaluate-all-advisories!-test
  (mt/with-temp [:model/SecurityAdvisory _active
                 {:advisory_id       "SC-EVAL-001"
                  :severity          "high"
                  :title             "Active advisory"
                  :description       "Test"
                  :remediation       "Upgrade"
                  :affected_versions [{:min "0.1.0" :fixed "99.99.99"}]
                  :matching_query    {:default {:select [1] :from [:core_user] :limit 1}}
                  :match_status      "not_affected"
                  :published_at      #t "2026-03-24T00:00:00Z"
                  :updated_at        #t "2026-03-24T00:00:00Z"}
                 :model/SecurityAdvisory _not-affected
                 {:advisory_id       "SC-EVAL-002"
                  :severity          "medium"
                  :title             "Not affected advisory"
                  :description       "Test"
                  :remediation       "Upgrade"
                  :affected_versions [{:min "0.1.0" :fixed "99.99.99"}]
                  :matching_query    {:default {:select [1] :from [:core_user]
                                                :where [:= :email "nonexistent@example.com"] :limit 1}}
                  :match_status      "not_affected"
                  :published_at      #t "2026-03-24T00:00:00Z"
                  :updated_at        #t "2026-03-24T00:00:00Z"}
                 :model/SecurityAdvisory _erroring
                 {:advisory_id       "SC-EVAL-003"
                  :severity          "low"
                  :title             "Erroring advisory"
                  :description       "Test"
                  :remediation       "Upgrade"
                  :affected_versions [{:min "0.1.0" :fixed "99.99.99"}]
                  :matching_query    {:default {:select [1] :from [:nonexistent_table] :limit 1}}
                  :match_status      "not_affected"
                  :published_at      #t "2026-03-24T00:00:00Z"
                  :updated_at        #t "2026-03-24T00:00:00Z"}]
    (matching/evaluate-all-advisories!)
    (let [fetch (fn [id] (t2/select-one :model/SecurityAdvisory :advisory_id id))]
      (testing "each advisory gets the correct status and timestamp"
        (is (=? {:match_status      :active
                 :last_evaluated_at some?}
                (fetch "SC-EVAL-001")))
        (is (=? {:match_status      :not_affected
                 :last_evaluated_at some?}
                (fetch "SC-EVAL-002")))
        (is (=? {:match_status      :error
                 :last_evaluated_at some?}
                (fetch "SC-EVAL-003"))))
      (testing "acknowledged advisories are skipped"
        (t2/update! :model/SecurityAdvisory {:advisory_id "SC-EVAL-001"}
                    {:acknowledged_at (mi/now) :acknowledged_by (mt/user->id :rasta)})
        (let [before-eval (:last_evaluated_at (fetch "SC-EVAL-001"))]
          (matching/evaluate-all-advisories!)
          (is (= before-eval (:last_evaluated_at (fetch "SC-EVAL-001")))))))))

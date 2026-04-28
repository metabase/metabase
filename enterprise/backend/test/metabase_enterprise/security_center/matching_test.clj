(ns metabase-enterprise.security-center.matching-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.security-center.matching :as matching]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import org.semver4j.Semver))

(use-fixtures :once (fixtures/initialize :test-users))

(set! *warn-on-reflection* true)

(deftest ^:parallel parse-version-test
  (testing "parses standard versions"
    (doseq [input ["v1.57.0" "1.57.0" "v0.50.2" "v1.57.16"]]
      (is (some? (matching/parse-version input)) (str "should parse: " input))))
  (testing "edition prefix preserved — 0.57 and 1.57 are distinct for range matching"
    (is (not= (matching/parse-version "v0.57.0")
              (matching/parse-version "v1.57.0"))))
  (testing "pre-release sorts before stable"
    (is (.isLowerThan ^Semver (matching/parse-version "v0.58.0-beta")
                      ^Semver (matching/parse-version "v0.58.0"))))
  (testing "invalid formats return nil"
    (are [input] (nil? (matching/parse-version input))
      "vLOCAL_DEV"
      nil
      "")))

#_:clj-kondo/ignore
(deftest ^:parallel affected-by-version?-test
  (let [v            matching/parse-version
        in-range?    @#'matching/affected-by-version?
        single-range [{:min "1.57.0" :fixed "1.57.16"}]
        multi-range  [{:min "1.57.0" :fixed "1.57.16"}
                      {:min "1.58.0" :fixed "1.58.10"}]
        narrow-range [{:min "0.50.0" :fixed "0.50.2"}]]
    (testing "single range — inclusive min, exclusive fixed"
      (are [expected version] (= expected (in-range? (v version) single-range))
        true  "1.57.0"                  ; at min boundary
        true  "1.57.5"                  ; mid-range
        true  "1.57.15"                 ; one patch before fixed
        false "1.57.16"                 ; at fixed boundary
        false "1.57.17"                 ; one patch after fixed
        false "1.56.0"                  ; before range
        false "1.59.0"                  ; past range
        false "0.57.5"))                ; OSS doesn't match EE range
    (testing "multiple ranges — any range counts"
      (are [expected version] (= expected (in-range? (v version) multi-range))
        true  "1.57.5"                  ; in first range
        true  "1.58.3"                  ; in second range
        true  "1.58.0"                  ; at second range min boundary
        false "1.57.20"                 ; between ranges
        false "1.58.10"                 ; at second range fixed
        false "1.59.0"))                ; past all ranges
    (testing "narrow patch range [0.50.0, 0.50.2)"
      (are [expected version] (= expected (in-range? (v version) narrow-range))
        true  "0.50.0"
        true  "0.50.1"
        false "0.50.2"
        false "1.0.0"))
    (testing "pre-release of fixed version is still in range"
      (is (true? (in-range? (v "1.57.16-beta") single-range))))
    (testing "empty affected_versions → never in range"
      (is (false? (in-range? (v "1.57.5") []))))
    (testing "nil version (vLOCAL_DEV / vUNKNOWN parse to nil) → never in range"
      (is (nil? (v "vLOCAL_DEV")))
      (is (nil? (v "vUNKNOWN")))
      (is (false? (in-range? nil single-range)))
      (is (false? (in-range? nil multi-range)))
      (is (false? (in-range? nil []))))))

(deftest ^:parallel evaluate-advisory-test
  (testing ":error query-result propagates regardless of in-range?"
    (is (= :error (matching/evaluate-advisory true  :error)))
    (is (= :error (matching/evaluate-advisory false :error))))
  (testing "falsey query-result → :not_affected regardless of in-range?"
    (is (= :not_affected (matching/evaluate-advisory true  false)))
    (is (= :not_affected (matching/evaluate-advisory false false))))
  (testing "query matched + in-range → :active"
    (is (= :active (matching/evaluate-advisory true true))))
  (testing "query matched + out-of-range → :resolved (was affected, now past the fix)"
    (is (= :resolved (matching/evaluate-advisory false true)))))

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
  (with-redefs [config/mb-version-info {:tag "v1.55.0"}]
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
                (t2/select-one :model/SecurityAdvisory :id (:id advisory))))))
  ;; Out-of-range: current instance version is not covered by [0.0.1, 0.0.2).
  ;; The matching_query in these tests would throw if executed — that's how we
  ;; verify the short-circuit actually avoids running the query.
    (let [past #t "2020-01-01T00:00:00Z"]
      (testing "out-of-range + already :resolved → skip entirely (query not run, timestamp preserved)"
        (mt/with-temp [:model/SecurityAdvisory advisory
                       {:advisory_id       "SC-MATCH-SKIP-001"
                        :severity          "high"
                        :title             "Test"
                        :description       "Test"
                        :remediation       "Upgrade"
                        :affected_versions [{:min "0.0.1" :fixed "0.0.2"}]
                        :matching_query    {:default {:select [1] :from [:nonexistent_table] :limit 1}}
                        :match_status      "resolved"
                        :last_evaluated_at past
                        :published_at      #t "2026-03-24T00:00:00Z"
                        :updated_at        #t "2026-03-24T00:00:00Z"}]
          (matching/evaluate-advisory! advisory)
          (let [reloaded (t2/select-one :model/SecurityAdvisory :id (:id advisory))]
            (is (= :resolved (:match_status reloaded)))
            (is (= (t/instant past) (t/instant (:last_evaluated_at reloaded)))))))
      (testing "out-of-range + already :not_affected → skip entirely"
        (mt/with-temp [:model/SecurityAdvisory advisory
                       {:advisory_id       "SC-MATCH-SKIP-002"
                        :severity          "low"
                        :title             "Test"
                        :description       "Test"
                        :remediation       "Upgrade"
                        :affected_versions [{:min "0.0.1" :fixed "0.0.2"}]
                        :matching_query    {:default {:select [1] :from [:nonexistent_table] :limit 1}}
                        :match_status      "not_affected"
                        :last_evaluated_at past
                        :published_at      #t "2026-03-24T00:00:00Z"
                        :updated_at        #t "2026-03-24T00:00:00Z"}]
          (matching/evaluate-advisory! advisory)
          (let [reloaded (t2/select-one :model/SecurityAdvisory :id (:id advisory))]
            (is (= :not_affected (:match_status reloaded)))
            (is (= (t/instant past) (t/instant (:last_evaluated_at reloaded))))))))
    (testing "out-of-range + :active + query match → transitions to :resolved"
      (mt/with-temp [:model/SecurityAdvisory advisory
                     {:advisory_id       "SC-MATCH-RESOLVE-001"
                      :severity          "high"
                      :title             "Test"
                      :description       "Test"
                      :remediation       "Upgrade"
                      :affected_versions [{:min "0.0.1" :fixed "0.0.2"}]
                      :matching_query    {:default {:select [1] :from [:core_user] :limit 1}}
                      :match_status      "active"
                      :published_at      #t "2026-03-24T00:00:00Z"
                      :updated_at        #t "2026-03-24T00:00:00Z"}]
        (matching/evaluate-advisory! advisory)
        (is (=? {:match_status      :resolved
                 :last_evaluated_at some?}
                (t2/select-one :model/SecurityAdvisory :id (:id advisory))))))
  ;; vLOCAL_DEV / vUNKNOWN both parse to nil. An unparseable instance version
  ;; must never produce :active — we cannot claim an instance is affected when
  ;; we can't even compare its version to the affected ranges.
    (doseq [tag ["vLOCAL_DEV" "vUNKNOWN"]]
      (testing (str "unparseable instance version " (pr-str tag) " never yields :active")
        (is (nil? (matching/parse-version tag)))
        (mt/with-temp [:model/SecurityAdvisory advisory
                       {:advisory_id       (str "SC-MATCH-NIL-VER-" tag)
                        :severity          "high"
                        :title             "Test"
                        :description       "Test"
                        :remediation       "Upgrade"
                      ;; Range that would normally match any realistic version.
                        :affected_versions [{:min "0.1.0" :fixed "99.99.99"}]
                        :matching_query    {:default {:select [1] :from [:core_user] :limit 1}}
                        :match_status      "unknown"
                        :published_at      #t "2026-03-24T00:00:00Z"
                        :updated_at        #t "2026-03-24T00:00:00Z"}]
          (matching/evaluate-advisory! advisory (matching/parse-version tag))
          (let [reloaded (t2/select-one :model/SecurityAdvisory :id (:id advisory))]
            (is (not= :active (:match_status reloaded)))))))))

(deftest evaluate-all-advisories!-test
  (with-redefs [config/mb-version-info {:tag "v1.55.0"}]
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
      (let [fetch (fn [id] (t2/select-one :model/SecurityAdvisory :advisory_id id))
            past #t "2020-01-01T00:00:00Z"]
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
        (testing "acknowledged + active advisories are still re-evaluated"
          (t2/update! :model/SecurityAdvisory {:advisory_id "SC-EVAL-001"}
                      {:acknowledged_at (mi/now) :acknowledged_by (mt/user->id :rasta)
                       :last_evaluated_at past})
          (matching/evaluate-all-advisories!)
          (is (not= past (:last_evaluated_at (fetch "SC-EVAL-001")))))
        (testing "acknowledged + not_affected advisories are skipped"
          (t2/update! :model/SecurityAdvisory {:advisory_id "SC-EVAL-002"}
                      {:acknowledged_at (mi/now) :acknowledged_by (mt/user->id :rasta)
                       :last_evaluated_at past})
          (matching/evaluate-all-advisories!)
          (is (= (t/instant past)
                 (t/instant (:last_evaluated_at (fetch "SC-EVAL-002"))))))
        (testing "acknowledged + error advisories are still re-evaluated"
          (t2/update! :model/SecurityAdvisory {:advisory_id "SC-EVAL-003"}
                      {:acknowledged_at (mi/now) :acknowledged_by (mt/user->id :rasta)
                       :last_evaluated_at past})
          (matching/evaluate-all-advisories!)
          (is (not= past (:last_evaluated_at (fetch "SC-EVAL-003")))))))))

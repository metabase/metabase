(ns metabase-enterprise.data-complexity-score.tier-fixtures-test
  "Asserts that each complexity-tier representation fixture produces the expected scores.
  These fixtures model realistic customer shapes at three distinct complexity levels."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase-enterprise.data-complexity-score.representation :as representation]))

(def ^:private fixture-base "enterprise/backend/test_resources/data_complexity_score/")

(defn- score-fixture [tier-dir]
  (let [{:keys [library universe embedder]} (representation/load-dir (str fixture-base tier-dir))]
    (complexity/score-from-entities library universe embedder {})))

(deftest ^:parallel tier-1-clean-startup-test
  (testing "Tier 1 — Clean Startup: small, curated, no collisions or synonyms."
    (let [{:keys [library universe]} (score-fixture "tier_1_clean_startup")]
      (is (= 63  (:total library)))
      (is (= 63  (:total universe)))
      (is (= library universe) "library = universe when everything is curated"))))

(deftest ^:parallel tier-2-growing-midsize-test
  (testing "Tier 2 — Growing Mid-size: some collisions and synonyms, library < universe."
    (let [{:keys [library universe]} (score-fixture "tier_2_growing_midsize")]
      (is (= 295 (:total library)))
      (is (= 774 (:total universe)))
      (is (< (:total library) (:total universe))))))

(deftest ^:parallel tier-3-enterprise-sprawl-test
  (testing "Tier 3 — Enterprise Legacy Sprawl: heavy collisions, many synonyms, sprawl."
    (let [{:keys [library universe]} (score-fixture "tier_3_enterprise_sprawl")]
      (is (= 622  (:total library)))
      (is (= 4225 (:total universe)))
      (is (< (:total library) (:total universe))))))

(deftest ^:parallel tiers-are-strictly-ordered-test
  (testing "Library scores form a strict ordering: tier 1 < tier 2 < tier 3."
    (let [t1 (:total (:library (score-fixture "tier_1_clean_startup")))
          t2 (:total (:library (score-fixture "tier_2_growing_midsize")))
          t3 (:total (:library (score-fixture "tier_3_enterprise_sprawl")))]
      (is (< t1 t2 t3) (format "Expected %d < %d < %d" t1 t2 t3))))
  (testing "Universe scores form a strict ordering: tier 1 < tier 2 < tier 3."
    (let [t1 (:total (:universe (score-fixture "tier_1_clean_startup")))
          t2 (:total (:universe (score-fixture "tier_2_growing_midsize")))
          t3 (:total (:universe (score-fixture "tier_3_enterprise_sprawl")))]
      (is (< t1 t2 t3) (format "Expected %d < %d < %d" t1 t2 t3)))))

(ns metabase-enterprise.data-complexity-score.tier-fixtures-test
  "Asserts that each complexity-tier representation fixture produces the expected scores.
  These fixtures model realistic customer shapes at three distinct complexity levels. Each tier
  test pins the full component breakdown — totals alone let the fixture semantics drift (different
  collision/synonym/field mixes can sum to the same total)."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase-enterprise.data-complexity-score.representation :as representation]))

(def ^:private fixture-base "enterprise/backend/test_resources/data_complexity_score/")

(defn- score-fixture [tier-dir]
  (let [{:keys [library universe embedder]} (representation/load-dir (str fixture-base tier-dir))]
    (complexity/score-from-entities library universe embedder {})))

(deftest ^:parallel tier-1-clean-startup-test
  (testing "Tier 1 — Clean Startup: 3 tables, 2 cards, 13 fields, no collisions/synonyms/repeats."
    (let [{:keys [library universe]} (score-fixture "tier_1_clean_startup")
          expected {:total      63
                    :components {:entity-count      {:count 5  :score 50}
                                 :name-collisions   {:pairs 0  :score 0}
                                 :synonym-pairs     {:pairs 0  :score 0}
                                 :field-count       {:count 13 :score 13}
                                 :repeated-measures {:count 0  :score 0}}}]
      (is (=? expected library))
      (is (=? expected universe))
      (is (= library universe) "library = universe when everything is curated"))))

(deftest ^:parallel tier-2-growing-midsize-test
  (testing "Tier 2 — Growing Mid-size: library has 1 collision (Revenue x2) + 1 synonym pair
            (invoices↔subscriptions) + 1 repeated measure; universe adds unpublished analytics
            tables that widen both collision and synonym axes."
    (is (=? {:library  {:total      295
                        :components {:entity-count      {:count 11 :score 110}
                                     :name-collisions   {:pairs 1  :score 100}
                                     :synonym-pairs     {:pairs 1  :score 50}
                                     :field-count       {:count 33 :score 33}
                                     :repeated-measures {:count 1  :score 2}}}
             :universe {:total      524
                        :components {:entity-count      {:count 17 :score 170}
                                     :name-collisions   {:pairs 2  :score 200}
                                     :synonym-pairs     {:pairs 2  :score 100}
                                     :field-count       {:count 52 :score 52}
                                     :repeated-measures {:count 1  :score 2}}}}
            (score-fixture "tier_2_growing_midsize")))))

(deftest ^:parallel tier-3-enterprise-sprawl-test
  (testing "Tier 3 — Enterprise Legacy Sprawl: heavy collisions (Revenue x4, Users x2, Orders x2),
            many legacy-CRM synonym pairs (clients↔customers, deals↔orders, ...), repeated
            measures across production + warehouse."
    (is (=? {:library  {:total      622
                        :components {:entity-count      {:count 23 :score 230}
                                     :name-collisions   {:pairs 2  :score 200}
                                     :synonym-pairs     {:pairs 2  :score 100}
                                     :field-count       {:count 82 :score 82}
                                     :repeated-measures {:count 5  :score 10}}}
             :universe {:total      2875
                        :components {:entity-count      {:count 48 :score 480}
                                     :name-collisions   {:pairs 6  :score 600}
                                     :synonym-pairs     {:pairs 32 :score 1600}
                                     :field-count       {:count 179 :score 179}
                                     :repeated-measures {:count 8  :score 16}}}}
            (score-fixture "tier_3_enterprise_sprawl")))))

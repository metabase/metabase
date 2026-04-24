(ns metabase-enterprise.data-complexity-score.tier-fixtures-test
  "Asserts that each complexity-tier representation fixture produces the expected scores.
  These fixtures model realistic customer shapes at three distinct complexity levels. Each tier
  test pins the full per-variable breakdown on the scored axes — totals alone let the fixture
  semantics drift (different collision/synonym/field mixes can sum to the same total)."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase-enterprise.data-complexity-score.representation :as representation]))

(def ^:private fixture-base "enterprise/backend/test_resources/data_complexity_score/")

(defn- score-fixture [tier-dir]
  (let [{:keys [library universe embedder]} (representation/load-dir (str fixture-base tier-dir))]
    (complexity/score-from-entities library universe embedder {:level 2})))

(deftest ^:parallel tier-1-clean-startup-test
  (testing "Tier 1 — Clean Startup: 3 tables, 2 cards, 13 fields, no name/synonym/measure collisions
            (but three fields named `id` share across tables, so field-level-collisions = 3)."
    (let [{:keys [library universe]} (score-fixture "tier_1_clean_startup")
          expected {:total 81
                    :dimensions
                    {:scale    {:variables {:entity-count         {:value 5  :score 50}
                                            :field-count          {:value 13 :score 13}
                                            :collection-tree-size {:value 3  :score 3}}
                                :sub-total 66}
                     :nominal  {:variables {:name-collisions        {:value 0 :score 0}
                                            :repeated-measures      {:value 0 :score 0}
                                            :field-level-collisions {:value 3 :score 15}}
                                :sub-total 15}
                     :semantic {:variables {:synonym-pairs {:value 0 :score 0}}
                                :sub-total 0}}}]
      (is (=? expected library))
      (is (=? expected universe))
      (is (= library universe) "library = universe when everything is curated"))))

(deftest ^:parallel tier-2-growing-midsize-test
  (testing "Tier 2 — Growing Mid-size: library has 1 entity-name collision (Revenue × 2) + 1 synonym
            pair (invoices↔subscriptions) + 1 repeated measure; universe adds unpublished analytics
            tables that widen both collision and synonym axes."
    (is (=? {:library  {:total 318
                        :dimensions
                        {:scale    {:variables {:entity-count         {:value 11 :score 110}
                                                :field-count          {:value 33 :score 33}
                                                :collection-tree-size {:value 3  :score 3}}
                                    :sub-total 146}
                         :nominal  {:variables {:name-collisions        {:value 1 :score 100}
                                                :repeated-measures      {:value 1 :score 2}
                                                :field-level-collisions {:value 4 :score 20}}
                                    :sub-total 122}
                         :semantic {:variables {:synonym-pairs {:value 1 :score 50}}
                                    :sub-total 50}}}
             :universe {:total 558
                        :dimensions
                        {:scale    {:variables {:entity-count         {:value 17 :score 170}
                                                :field-count          {:value 52 :score 52}
                                                :collection-tree-size {:value 4  :score 4}}
                                    :sub-total 226}
                         :nominal  {:variables {:name-collisions        {:value 2 :score 200}
                                                :repeated-measures      {:value 1 :score 2}
                                                :field-level-collisions {:value 6 :score 30}}
                                    :sub-total 232}
                         :semantic {:variables {:synonym-pairs {:value 2 :score 100}}
                                    :sub-total 100}}}}
            (score-fixture "tier_2_growing_midsize")))))

(deftest ^:parallel tier-3-enterprise-sprawl-test
  (testing "Tier 3 — Enterprise Legacy Sprawl: heavy collisions (Revenue × 4, Users × 2, Orders × 2),
            many legacy-CRM synonym pairs (clients↔customers, deals↔orders, ...), repeated measures
            across production + warehouse, field-level collisions dominate the nominal axis."
    (is (=? {:library  {:total 665
                        :dimensions
                        {:scale    {:variables {:entity-count         {:value 23 :score 230}
                                                :field-count          {:value 82 :score 82}
                                                :collection-tree-size {:value 3  :score 3}}
                                    :sub-total 315}
                         :nominal  {:variables {:name-collisions        {:value 2 :score 200}
                                                :repeated-measures      {:value 5 :score 10}
                                                :field-level-collisions {:value 8 :score 40}}
                                    :sub-total 250}
                         :semantic {:variables {:synonym-pairs {:value 2 :score 100}}
                                    :sub-total 100}}}
             :universe {:total 3486
                        :dimensions
                        {:scale    {:variables {:entity-count         {:value 48 :score 480}
                                                :field-count          {:value 179 :score 179}
                                                :collection-tree-size {:value 6  :score 6}}
                                    :sub-total 665}
                         :nominal  {:variables {:name-collisions        {:value 6  :score 600}
                                                :repeated-measures      {:value 8  :score 16}
                                                :field-level-collisions {:value 31 :score 155}}
                                    :sub-total 771}
                         :semantic {:variables {:synonym-pairs             {:value 41 :score 2050}
                                                :synonym-largest-component {:value 6}
                                                :synonym-clustering-coef   {:value 0.9905660377358491}}
                                    :sub-total 2050}}}}
            (score-fixture "tier_3_enterprise_sprawl")))))

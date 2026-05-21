(ns metabase.metabot.tools.construct-test
  "Unit tests for entity-usage extraction on the `construct_notebook_query`
   tool wrapper."
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.entity-usage :as entity-usage]
   [metabase.util.malli.registry :as mr]))

(deftest construct-entity-usage-source-only-test
  (testing "with only source_entity: input has one entry with arg_slot=source_entity"
    (let [eu (construct/construct-entity-usage
              {:type "model" :id 12}
              nil
              {:source {:type "dataset" :id 12} :operations []})]
      (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
      (is (= [] (:output eu)))
      ;; The program's :source ref dedupes against source_entity, so only one
      ;; entry for {model 12} survives (the source_entity slot wins).
      (is (= [{:type "model" :id 12 :metadata {:arg_slot "source_entity"}}]
             (:input eu))))))

(deftest construct-entity-usage-with-referenced-entities-test
  (testing "referenced_entities entries land with their slot annotation"
    (let [eu (construct/construct-entity-usage
              {:type "table" :id 1}
              [{:type "metric" :id 5} {:type "question" :id 7}]
              {:source {:type "table" :id 1} :operations []})]
      (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
      (is (= [{:type "table"    :id 1 :metadata {:arg_slot "source_entity"}}
              {:type "metric"   :id 5 :metadata {:arg_slot "referenced_entities"}}
              {:type "question" :id 7 :metadata {:arg_slot "referenced_entities"}}]
             (:input eu))))))

(deftest construct-entity-usage-walks-program-refs-test
  (testing "program operations contribute field/table/card/metric refs with arg_slot=program"
    (let [eu (construct/construct-entity-usage
              {:type "table" :id 1}
              nil
              {:source     {:type "table" :id 1}
               :operations [["filter" ["field" 100]]
                            ["aggregate" ["metric" 200]]
                            ["join" ["card" 300]]
                            ["join" ["table" 400]]]})
          input (:input eu)]
      (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
      ;; source_entity wins for table 1; program contributes field/metric/card
      ;; refs plus table 400 (table 1 is deduped against source_entity).
      (is (= #{{:type "table"  :id 1   :metadata {:arg_slot "source_entity"}}
               {:type "table"  :id 400 :metadata {:arg_slot "program"}}
               {:type "field"  :id 100 :metadata {:arg_slot "program"}}
               {:type "card"   :id 300 :metadata {:arg_slot "program"}}
               {:type "metric" :id 200 :metadata {:arg_slot "program"}}}
             (set input))))))

(deftest construct-entity-usage-skips-measures-test
  (testing ":measure operator refs are dropped (no canonical entity-types entry)"
    (let [eu (construct/construct-entity-usage
              {:type "table" :id 1}
              nil
              {:source     {:type "table" :id 1}
               :operations [["aggregate" ["measure" 999]]]})]
      (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
      (is (= [{:type "table" :id 1 :metadata {:arg_slot "source_entity"}}]
             (:input eu))))))

(deftest construct-entity-usage-dedup-precedence-test
  (testing "first occurrence wins — source_entity outranks referenced_entities, both outrank program"
    (let [eu (construct/construct-entity-usage
              {:type "table" :id 1}
              [{:type "table" :id 2}]
              {:source     {:type "table" :id 1}
               :operations [["filter" ["table" 1]]
                            ["filter" ["table" 2]]
                            ["filter" ["table" 3]]]})]
      (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
      (is (= [{:type "table" :id 1 :metadata {:arg_slot "source_entity"}}
              {:type "table" :id 2 :metadata {:arg_slot "referenced_entities"}}
              {:type "table" :id 3 :metadata {:arg_slot "program"}}]
             (:input eu))))))

(deftest construct-entity-usage-empty-shape-test
  (testing "no source, no referenced_entities, no program — empty :input/:output"
    (let [eu (construct/construct-entity-usage nil nil nil)]
      (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
      (is (= {:input [] :output []} eu)))))

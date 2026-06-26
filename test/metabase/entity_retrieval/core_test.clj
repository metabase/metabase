(ns metabase.entity-retrieval.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.test :as mt]))

(deftest ^:parallel entity-class-test
  (testing "card flavors collapse to one class; other types stay distinct"
    (is (= (entity-retrieval/entity-class "metric" 7)
           (entity-retrieval/entity-class "model" 7)
           (entity-retrieval/entity-class "question" 7)))
    (is (not= (entity-retrieval/entity-class "table" 7)
              (entity-retrieval/entity-class "metric" 7)))))

(deftest ai-context-instructions-matches-by-card-class-test
  (testing "a card's live instructions are found even when the ref's type differs from the curated type"
    (mt/with-temp [:model/OsiAiContext _ {:entity_type     "metric"
                                          :entity_local_id 4242
                                          :ai_context      {:instructions "Group by month."}}]
      (testing "the ref carries the card's current type (model) but the row was curated as a metric"
        (is (= {["model" 4242] "Group by month."}
               (entity-retrieval/ai-context-instructions [{:model "model" :id 4242}]))))
      (testing "a non-card ref of the same id matches exactly, so it finds nothing"
        (is (= {} (entity-retrieval/ai-context-instructions [{:model "table" :id 4242}])))))))

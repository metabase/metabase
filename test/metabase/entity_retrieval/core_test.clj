(ns metabase.entity-retrieval.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.test :as mt]))

(deftest ^:parallel entity-class-test
  (testing "card flavors (and the stored \"card\") collapse to one class; other types stay distinct"
    (is (= (entity-retrieval/entity-class "card" 7)
           (entity-retrieval/entity-class "metric" 7)
           (entity-retrieval/entity-class "model" 7)
           (entity-retrieval/entity-class "question" 7)))
    (is (not= (entity-retrieval/entity-class "table" 7)
              (entity-retrieval/entity-class "metric" 7)))))

(deftest ^:parallel normalize-entity-type-test
  (testing "card flavors normalize to the stored \"card\"; other types pass through"
    (is (= "card" (entity-retrieval/normalize-entity-type "metric")))
    (is (= "card" (entity-retrieval/normalize-entity-type "model")))
    (is (= "card" (entity-retrieval/normalize-entity-type "question")))
    (is (= "table" (entity-retrieval/normalize-entity-type "table")))
    (is (= "measure" (entity-retrieval/normalize-entity-type "measure")))))

(deftest ai-context-instructions-matches-by-card-class-test
  (testing "a card's live instructions are found whichever flavor the ref names (storage is \"card\")"
    ;; the row is stored under the canonical "card" (the write normalizes "metric" -> "card")
    (mt/with-temp [:model/OsiAiContext _ {:entity_type     "metric"
                                          :entity_local_id 4242
                                          :ai_context      {:instructions "Group by month."}}]
      (testing "a model ref resolves the same card's instructions"
        (is (= {["model" 4242] "Group by month."}
               (entity-retrieval/ai-context-instructions [{:model "model" :id 4242}]))))
      (testing "a non-card ref of the same id matches exactly, so it finds nothing"
        (is (= {} (entity-retrieval/ai-context-instructions [{:model "table" :id 4242}])))))))

(deftest ai-context-instructions-truncates-oversized-text-test
  (testing "instructions that bypassed the API cap (direct write/serdes/pre-cap row) are truncated on read"
    (let [long-instr (apply str (repeat (* 2 entity-retrieval/max-instructions-len) \x))]
      (mt/with-temp [:model/OsiAiContext _ {:entity_type     "table"
                                            :entity_local_id 5151
                                            :ai_context      {:instructions long-instr}}]
        (is (= entity-retrieval/max-instructions-len
               (count (get (entity-retrieval/ai-context-instructions [{:model "table" :id 5151}])
                           ["table" 5151]))))))))

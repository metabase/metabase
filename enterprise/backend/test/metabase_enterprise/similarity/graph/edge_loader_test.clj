(ns metabase-enterprise.similarity.graph.edge-loader-test
  "DB-backed tests for the streaming edge loaders.

   The CTE chain in `directed-edges-query` (when `:top-k-target` is non-nil)
   stacks a `ROW_NUMBER()` window-bearing CTE; same H2 caveat as
   `views/ensemble.clj`. Tests gate on `(= :postgres (mdb/db-type))` and are
   no-ops on H2."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.similarity.graph.edge-loader :as edge-loader]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(set! *warn-on-reflection* true)

(defn- seed-ensemble-edge!
  [{:keys [from-type from-id to-type to-id score]
    :or   {from-type :card to-type :card}}]
  (t2/insert! :model/SimilarEdge
              {:from_entity_type from-type
               :from_entity_id   from-id
               :to_entity_type   to-type
               :to_entity_id     to-id
               :view             :ensemble
               :score            (double score)
               :last_computed_at (t/offset-date-time)}))

(defn- collect-directed [opts]
  (into []
        (map #(select-keys % [:from_entity_type :from_entity_id
                              :to_entity_type :to_entity_id :score]))
        (edge-loader/load-directed-edges opts)))

(defn- collect-undirected [opts]
  (into [] (map #(select-keys % [:u :v :w]))
        (edge-loader/load-undirected-edges opts)))

(deftest ^:sequential scope-card-filters-cross-type-rows-test
  (when (= :postgres (mdb/db-type))
    (testing ":scope :card returns only card→card ensemble rows"
      (mt/with-model-cleanup [:model/SimilarEdge]
        (seed-ensemble-edge! {:from-id 1 :to-id 2 :score 0.5})
        (seed-ensemble-edge! {:from-id 3 :to-type :table :to-id 9 :score 0.6})
        (let [rows (collect-directed {:scope :card})]
          (is (every? #(= :card (:from_entity_type %)) rows))
          (is (every? #(= :card (:to_entity_type %)) rows))
          (is (= [1] (mapv :from_entity_id rows)))
          (is (= [2] (mapv :to_entity_id rows))))))))

(deftest ^:sequential min-score-filter-test
  (when (= :postgres (mdb/db-type))
    (testing ":min-score drops rows below the threshold"
      (mt/with-model-cleanup [:model/SimilarEdge]
        (seed-ensemble-edge! {:from-id 1 :to-id 2 :score 0.05})
        (seed-ensemble-edge! {:from-id 1 :to-id 3 :score 0.5})
        (let [rows (collect-directed {:scope :card :min-score 0.1})]
          (is (= 1 (count rows)))
          (is (= 3 (-> rows first :to_entity_id))))))))

(deftest ^:sequential top-k-target-filter-test
  (when (= :postgres (mdb/db-type))
    (testing ":top-k-target caps in-degree per target by score-desc"
      (mt/with-model-cleanup [:model/SimilarEdge]
        ;; 5 edges → card 100, scores 0.1 .. 0.5
        (doseq [i (range 5)]
          (seed-ensemble-edge! {:from-id (inc i) :to-id 100
                                :score (* 0.1 (inc i))}))
        (let [rows (collect-directed {:scope :card :top-k-target 3})]
          (is (= 3 (count rows)))
          (is (= [0.5 0.4 0.3] (sort > (mapv :score rows)))))))))

(deftest ^:sequential undirected-aggregation-sums-parallel-edges-test
  (when (= :postgres (mdb/db-type))
    (testing "(A→B, w1) + (B→A, w2) collapse into one undirected pair (A, B, w1+w2)"
      (mt/with-model-cleanup [:model/SimilarEdge]
        (seed-ensemble-edge! {:from-id 1 :to-id 2 :score 0.3})
        (seed-ensemble-edge! {:from-id 2 :to-id 1 :score 0.7})
        (let [rows (collect-undirected {:scope :card :min-score 0.0
                                        :top-k-target 1000})]
          (is (= 1 (count rows)))
          (is (= 1 (-> rows first :u)))
          (is (= 2 (-> rows first :v)))
          (is (== 1.0 (-> rows first :w))))))))

(deftest ^:sequential undirected-respects-min-score-and-top-k-test
  (when (= :postgres (mdb/db-type))
    (testing "min-score + top-k-target compose; defaults trim aggressively"
      (mt/with-model-cleanup [:model/SimilarEdge]
        (seed-ensemble-edge! {:from-id 10 :to-id 11 :score 0.001})
        (seed-ensemble-edge! {:from-id 10 :to-id 12 :score 0.2})
        ;; min-score 0.02 default drops the 0.001 edge
        (let [rows (collect-undirected {:scope :card})]
          (is (= 1 (count rows)))
          (is (= [10 12] [(-> rows first :u) (-> rows first :v)])))))))

(deftest ^:sequential scope-full-returns-mixed-types-test
  (when (= :postgres (mdb/db-type))
    (testing ":scope :full returns rows of mixed entity-types"
      (mt/with-model-cleanup [:model/SimilarEdge]
        (seed-ensemble-edge! {:from-id 1 :to-id 2 :score 0.5})
        (seed-ensemble-edge! {:from-id 1 :to-type :table :to-id 9 :score 0.6})
        (let [rows (collect-directed {:scope :full})
              types (set (map :to_entity_type rows))]
          (is (= #{:card :table} types)))))))

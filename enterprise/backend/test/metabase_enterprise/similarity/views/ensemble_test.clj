(ns metabase-enterprise.similarity.views.ensemble-test
  "Tests for the materialized RRF fusion view.

   The CTE chain stacks window-bearing CTEs (`:ranked` → `:fused` →
   `:final`); H2 returns 0 rows from that shape. Tie-behavior tests are
   gated on `(= :postgres (mdb/db-type))` and are no-ops on H2. The PoC
   targets a Postgres appdb."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.similarity.runner :as runner]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest ^:sequential cold-ensemble-no-base-rows-test
  (testing "ensemble runs cleanly when there are no base rows for the typed pair"
    (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
      (let [{:keys [status inserted]} (runner/run-view! :ensemble)]
        (is (= :ok status))
        (is (zero? inserted))))))

(defn- seed-edge [from-id view to-id score now]
  {:from_entity_type :card
   :from_entity_id   from-id
   :to_entity_type   :card
   :to_entity_id     to-id
   :view             view
   :score            (double score)
   :contributing_data nil
   :last_computed_at now})

(defn- ensemble-for [from-id]
  (t2/select :model/SimilarEdge
             {:where    [:and
                         [:= :view "ensemble"]
                         [:= :from_entity_type "card"]
                         [:= :from_entity_id from-id]]
              :order-by [[:score :desc]]}))

(deftest ^:sequential tied-rows-share-rank-and-survive-test
  (when (= :postgres (mdb/db-type))
    (testing "tied scores within a (from, view) group all enter the ensemble with equal RRF contribution"
      (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
        ;; Source card 1, three co-dashboard ties at score 1.0 (cards 2, 3, 4) and
        ;; one solo co-dashboard at 0.5 (card 5). One source-table-jaccard hit at
        ;; 0.9 (card 6) gives the assertion something to compare against.
        (let [now (t/offset-date-time)]
          (t2/insert! :model/SimilarEdge
                      [(seed-edge 1 :co-dashboard 2 1.0 now)
                       (seed-edge 1 :co-dashboard 3 1.0 now)
                       (seed-edge 1 :co-dashboard 4 1.0 now)
                       (seed-edge 1 :co-dashboard 5 0.5 now)
                       (seed-edge 1 :source-table-jaccard 6 0.9 now)]))
        (runner/run-view! :ensemble)
        (let [rows      (ensemble-for 1)
              ids       (set (map :to_entity_id rows))
              by-id     (into {} (map (juxt :to_entity_id :score)) rows)
              tied-ids  [2 3 4]
              tied-scs  (map by-id tied-ids)]
          (testing "all five candidates survive (no destructive lockout)"
            (is (= #{2 3 4 5 6} ids)
                (str "expected coverage of all 5 to-ids; got " (pr-str ids))))
          (testing "top fused row is the source-table-jaccard hit (1.0/(60+1) > 0.8/(60+1))"
            (is (= 6 (:to_entity_id (first rows)))))
          (testing "tied co-dashboard rows share fused score (RANK gives all rank=1)"
            (is (apply = tied-scs)
                (str "expected cards 2, 3, 4 to share fused score under RANK; got "
                     (pr-str (zipmap tied-ids tied-scs)))))
          (testing "non-tied co-dashboard row gets RANK gap (rank=4 → lower contribution)"
            (is (< (by-id 5) (first tied-scs))
                (str "expected card 5 (rank 4) to score below the tied trio (rank 1); "
                     "got 5=" (by-id 5) " vs tied=" (first tied-scs))))
          (testing "no fused score is zero or negative"
            (is (every? pos? (map :score rows)))))))

    (testing "candidates with unique scores within their view rank cleanly"
      (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
        (let [now (t/offset-date-time)]
          (t2/insert! :model/SimilarEdge
                      [(seed-edge 10 :co-dashboard 20 0.9 now)
                       (seed-edge 10 :co-dashboard 21 0.7 now)
                       (seed-edge 10 :co-dashboard 22 0.5 now)
                       (seed-edge 10 :source-table-jaccard 23 0.8 now)]))
        (runner/run-view! :ensemble)
        (let [rows (ensemble-for 10)]
          (is (= 4 (count rows))
              "all four distinct-score candidates should survive")
          (is (= #{20 21 22 23} (set (map :to_entity_id rows)))))))))

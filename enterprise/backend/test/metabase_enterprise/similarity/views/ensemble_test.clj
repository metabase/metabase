(ns metabase-enterprise.similarity.views.ensemble-test
  "Tests for the materialized RRF fusion view.

   Tie-collapse stacks two window-bearing CTEs (`:base` → `:deduped` →
   `:ranked`); H2 returns 0 rows from that shape. Tie-behavior tests are
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

(deftest ^:sequential tie-collapse-drops-tied-followers-test
  (when (= :postgres (mdb/db-type))
    (testing "tied scores within a (from, view) group collapse to the lowest-id row only"
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
        (let [rows (ensemble-for 1)
              ids  (mapv :to_entity_id rows)]
          (testing "only one row from the tied co-dashboard group survives"
            (is (= [2 5 6] ids)
                (str "expected the lowest-id tied row (2), the non-tied co-dashboard row (5), "
                     "and the source-table-jaccard hit (6); got " (pr-str ids))))
          (testing "no fused score is zero or negative"
            (is (every? pos? (map :score rows)))))))

    (testing "tie-collapse does not affect candidates that are unique within their view"
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

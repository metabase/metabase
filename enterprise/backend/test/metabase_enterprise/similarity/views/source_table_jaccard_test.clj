(ns metabase-enterprise.similarity.views.source-table-jaccard-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.similarity.runner :as runner]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- insert-card-tables!
  "Insert one `query_table` row per `table-id` for `card-id`."
  [card-id table-ids]
  (t2/insert! :query_table
              (for [table-id table-ids]
                {:card_id  card-id
                 :table_id table-id
                 :table    (str "t" table-id)})))

(defn- edge-between [card-x card-y]
  (t2/select-one :model/SimilarEdge
                 :view :source-table-jaccard
                 :from_entity_type :card :from_entity_id card-x
                 :to_entity_type   :card :to_entity_id   card-y))

(deftest ^:sequential pairwise-jaccard-respects-thresholds-test
  (testing "pairs with intersection ≥ 2 produce edges; single-overlap pairs do not"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge :model/SimilarEdgeStatus]
      (mt/with-temp [:model/Card {ca :id} {}
                     :model/Card {cb :id} {}
                     :model/Card {cc :id} {}]
        (let [t1 (mt/id :orders)
              t2 (mt/id :products)
              t3 (mt/id :people)]
          (insert-card-tables! ca [t1 t2])
          (insert-card-tables! cb [t2 t3])
          (insert-card-tables! cc [t1 t2 t3])
          (try
            (runner/run-view! :source-table-jaccard)
            (testing "(A, C): intersection 2, union 3 ⇒ 2/3 (above threshold)"
              (let [edge (edge-between ca cc)]
                (is (some? edge))
                (is (== (/ 2.0 3) (:score edge)))))
            (testing "symmetric storage"
              (is (some? (edge-between cc ca))))
            (testing "(B, C): intersection 2, union 3 ⇒ 2/3"
              (is (some? (edge-between cb cc))))
            (testing "(A, B): intersection 1 — below intersection-min, no edge"
              (is (nil? (edge-between ca cb)))
              (is (nil? (edge-between cb ca))))
            (finally
              (t2/delete! :query_table :card_id [:in [ca cb cc]]))))))))

(deftest ^:sequential native-card-without-tables-excluded-test
  (testing "a card with zero query_table rows does not appear in any edges"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge :model/SimilarEdgeStatus]
      (mt/with-temp [:model/Card {ca :id} {}
                     :model/Card {cb :id} {}]
        (let [t1 (mt/id :orders)
              t2 (mt/id :products)]
          (insert-card-tables! ca [t1 t2])
          ;; cb has no query_table rows
          (try
            (runner/run-view! :source-table-jaccard)
            (is (nil? (edge-between ca cb)))
            (is (nil? (edge-between cb ca)))
            (finally
              (t2/delete! :query_table :card_id ca))))))))

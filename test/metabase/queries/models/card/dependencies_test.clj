(ns metabase.queries.models.card.dependencies-test
  (:require
   [clojure.test :refer :all]
   [metabase.queries.models.card.dependencies :as card.deps]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest update-dependencies-for-card!-test
  (testing "update-dependencies-for-card!"
    (mt/with-temp [:model/Card {card-1-id :id} {}
                   :model/Card {card-2-id :id} {}
                   :model/Card {card-3-id :id} {}
                   :model/Table {table-1-id :id} {}
                   :model/Table {table-2-id :id} {}]
      (testing "for a card with table references"
        (let [card {:id card-1-id
                    :dataset_query {:database (mt/id)
                                    :type :query
                                    :query {:source-table table-1-id}}}]
          (is (= {:added-deps #{table-1-id}}
                 (card.deps/update-dependencies-for-card! card)))

          (testing "a table dependency is created"
            (is (= 1 (t2/count :model/Card->Table :table_id table-1-id :card_id card-1-id))))

          (testing "no card dependencies are created"
            (is (zero? (t2/count :model/Card->Card :downstream_card_id card-1-id))))))

      (testing "for a card with card references"
        (let [card {:id card-2-id
                    :dataset_query {:database (mt/id)
                                    :type :query
                                    :query {:source-table (str "card__" card-1-id)}}}]
          (is (= {:added-deps #{card-1-id}}
                 (card.deps/update-dependencies-for-card! card)))

          (testing "card dependencies are created"
            (is (= 1 (t2/count :model/Card->Card :upstream_card_id card-1-id :downstream_card_id card-2-id))))

          (testing "no table dependencies are created"
            (is (zero? (t2/count :model/Card->Table :card_id card-2-id))))))

      (testing "creates dependencies for a card with both table and card references"
        (let [card {:id card-3-id
                    :dataset_query {:database (mt/id)
                                    :type :query
                                    :query {:source-table table-2-id
                                            :joins [{:source-table (str "card__" card-1-id)
                                                     :condition [:= [:field 1 nil] [:field 2 nil]]}]}}}]
          (is (= {:added-deps #{card-1-id table-2-id}}
                 (card.deps/update-dependencies-for-card! card)))

          (testing "both table and card dependencies are created"
            (is (= 1 (t2/count :model/Card->Table :table_id table-2-id :card_id card-3-id)))
            (is (= 1 (t2/count :model/Card->Card :downstream_card_id card-3-id))))))

      (testing "updates dependencies when card changes"
        (let [updated-card {:id card-3-id
                            :dataset_query {:database (mt/id)
                                            :type :query
                                            :query {:source-table table-1-id}}}]
          (is (= {:added-deps #{table-1-id}
                  :removed-deps #{card-1-id table-2-id}}
                 (card.deps/update-dependencies-for-card! updated-card)))

          (testing "old dependencies are removed and new ones added"
            (is (=? #{table-1-id} (t2/select-fn-set :table_id :model/Card->Table :card_id card-3-id)))
            (is (zero? (t2/count :model/Card->Card :downstream_card_id card-3-id)))))))))

(deftest update-dependencies-for-card!-edge-cases-test
  (testing "update-dependencies-for-card! handles edge cases correctly"
    (mt/with-temp [:model/Table {table-id :id} {}
                   :model/Card {card-id :id} {}]
      (testing "does nothing when card has no id"
        (let [card {:dataset_query {:database (mt/id)
                                    :type :query
                                    :query {:source-table table-id}}}]
          (is (nil? (card.deps/update-dependencies-for-card! card)))
          (is (nil? (card.deps/cards-depending-on-table table-id)))))

      (testing "does nothing when card has no dataset_query"
        (let [card {:id card-id}]
          (is (nil? (card.deps/update-dependencies-for-card! card)))
          (is (nil? (card.deps/cards-depending-on-table table-id))))) ; omit?

      (testing "does nothing when card has nil dataset_query"
        (let [card {:id card-id
                    :dataset_query nil}]
          (is (nil? (card.deps/update-dependencies-for-card! card)))
          (is (nil? (card.deps/cards-depending-on-table table-id))))) ; omit?

      (testing "handles empty query gracefully"
        (let [card {:id card-id
                    :dataset_query {:database (mt/id)
                                    :type :query
                                    :query {}}}]
          (is (nil? (card.deps/update-dependencies-for-card! card)))
          (is (nil? (card.deps/cards-depending-on-table table-id)))))))) ; omit

(deftest update-dependencies-for-card!-complex-queries-test
  (testing "update-dependencies-for-card! handles complex queries with multiple joins"
    (mt/with-temp [:model/Card {card-1-id :id} {}
                   :model/Card {card-2-id :id} {}
                   :model/Card {card-3-id :id} {}
                   :model/Table {table-1-id :id} {}
                   :model/Table {table-2-id :id} {}
                   :model/Table {table-3-id :id} {}]

      (testing "handles nested source queries"
        (let [card {:id card-3-id
                    :dataset_query {:database (mt/id)
                                    :type :query
                                    :query {:source-query {:source-table table-1-id
                                                           :joins [{:source-table (str "card__" card-1-id)
                                                                    :condition [:= [:field 1 nil] [:field 2 nil]]}]}
                                            :joins [{:source-table table-2-id
                                                     :condition [:= [:field 3 nil] [:field 4 nil]]}
                                                    {:source-table (str "card__" card-2-id)
                                                     :condition [:= [:field 5 nil] [:field 6 nil]]}]}}}]
          (is (= {:added-deps #{table-1-id card-1-id table-2-id card-2-id}}
                 (card.deps/update-dependencies-for-card! card)))

          (testing "all table dependencies are captured"
            (is (= #{card-3-id} (card.deps/cards-depending-on-table table-1-id)))
            (is (= #{card-3-id} (card.deps/cards-depending-on-table table-2-id))))
          (testing "all card dependencies are captured"
            (is (= #{card-3-id} (card.deps/cards-depending-on-card card-1-id)))
            (is (= #{card-3-id} (card.deps/cards-depending-on-card card-2-id))))))

      (testing "handles update and multiple levels of nesting"
        (let [card {:id card-3-id
                    :dataset_query {:database (mt/id)
                                    :type :query
                                    :query {:source-query {:source-query {:source-table table-1-id}
                                                           :joins [{:source-table table-2-id
                                                                    :condition [:= [:field 1 nil] [:field 2 nil]]}]}
                                            :joins [{:source-table table-3-id
                                                     :condition [:= [:field 3 nil] [:field 4 nil]]}]}}}]
          (is (= {:added-deps #{table-3-id}
                  :removed-deps #{card-1-id card-2-id}}
                 (card.deps/update-dependencies-for-card! card)))

          (testing "all nested table dependencies are captured"
            (is (= #{card-3-id}
                   (card.deps/cards-depending-on-table table-1-id)
                   (card.deps/cards-depending-on-table table-2-id)
                   (card.deps/cards-depending-on-table table-3-id))))
          (testing "cards not referenced any more are removed"
            (is (= nil (card.deps/cards-depending-on-card card-1-id)))
            (is (= nil (card.deps/cards-depending-on-card card-2-id)))))))))

(deftest update-dependencies-for-card!-native-queries-test
  (testing "update-dependencies-for-card! handles native queries"
    (mt/with-temp [:model/Card {card-id :id} {}]

      (testing "native queries with no source references create no dependencies"
        (let [card {:id card-id
                    :dataset_query {:database (mt/id)
                                    :type :native
                                    :native {:query "SELECT * FROM venues"}}}]
          (is (nil? (card.deps/update-dependencies-for-card! card))))))))

;; TODO this is not testing atomic behavior
(deftest update-dependencies-for-card!-transaction-test
  (testing "update-dependencies-for-card! runs in a transaction"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Table {table-id :id} {}
                   :model/Table {new-table-id :id} {}]
      (testing "dependencies are created atomically"
        (let [card {:id card-id
                    :dataset_query {:database (mt/id)
                                    :type :query
                                    :query {:source-table table-id}}}]
          (is (= {:added-deps #{table-id}}
                 (card.deps/update-dependencies-for-card! card)))

          (testing "dependencies exist after transaction"
            (is (= #{card-id} (card.deps/cards-depending-on-table table-id))))))

      (testing "dependency updates are atomic"
        (let [updated-card {:id card-id
                            :dataset_query {:database (mt/id)
                                            :type :query
                                            :query {:source-table new-table-id}}}]
          (is (= {:removed-deps #{table-id}
                  :added-deps #{new-table-id}}
                 (card.deps/update-dependencies-for-card! updated-card)))

          (testing "old dependencies are removed and new ones added atomically"
            (is (nil? (card.deps/cards-depending-on-table table-id)))
            (is (= #{card-id} (card.deps/cards-depending-on-table new-table-id)))))))))

(deftest update-dependencies-for-card!-legacy-string-handling-test
  (testing "update-dependencies-for-card! properly handles legacy card__ strings"
    (mt/with-temp [:model/Card {card-1-id :id} {}
                   :model/Card {card-2-id :id} {}]

      (testing "legacy card__<id> strings are converted to card dependencies"
        (let [card {:id card-2-id
                    :dataset_query {:database (mt/id)
                                    :type :query
                                    :query {:source-table (str "card__" card-1-id)}}}]
          (is (= {:added-deps #{card-1-id}}
                 (card.deps/update-dependencies-for-card! card)))

          (testing "card dependency is created from legacy string"
            (is (= #{card-2-id} (card.deps/cards-depending-on-card card-1-id))))))

      (testing "malformed card strings are ignored"
        (let [card {:id card-2-id
                    :dataset_query {:database (mt/id)
                                    :type :query
                                    :query {:source-table "card__invalid"}}}]
          (is (= {:removed-deps #{card-1-id}}
                 (card.deps/update-dependencies-for-card! card)))

          (testing "no dependencies are created for malformed strings"
            (is (nil? (card.deps/cards-depending-on-card card-1-id)))))))))

(deftest cards-depending-on-table-test
  (testing "cards-depending-on-table returns correct card IDs"
    (mt/with-temp [:model/Card {card-1-id :id} {}
                   :model/Card {card-2-id :id} {}
                   :model/Table {table-id :id} {}]
      (testing "returns nil when no cards depend on table"
        (is (nil? (card.deps/cards-depending-on-table table-id))))

      (testing "returns card IDs when cards depend on table"
        (t2/insert! :model/Card->Table {:card_id card-1-id :table_id table-id})
        (t2/insert! :model/Card->Table {:card_id card-2-id :table_id table-id})

        (is (= #{card-1-id card-2-id} (card.deps/cards-depending-on-table table-id)))))))

(deftest cards-depending-on-card-test
  (testing "cards-depending-on-card returns correct card IDs"
    (mt/with-temp [:model/Card {card-1-id :id} {}
                   :model/Card {card-2-id :id} {}
                   :model/Card {card-3-id :id} {}]

      (testing "returns nil when no cards depend on card"
        (is (nil? (card.deps/cards-depending-on-card card-1-id))))

      (testing "returns card IDs when cards depend on card"
        (t2/insert! :model/Card->Card {:downstream_card_id card-2-id :upstream_card_id card-1-id})
        (t2/insert! :model/Card->Card {:downstream_card_id card-3-id :upstream_card_id card-1-id})

        (is (= #{card-2-id card-3-id} (card.deps/cards-depending-on-card card-1-id)))))))

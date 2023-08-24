(ns metabase.lib.test-util.mocks.31769
  "Mocks to reproduce the behavior of e2e test #31769 directly in MLv2 and in QP tests. Some tests using this:

  * [[metabase.lib.card-test/returned-columns-31769-test]]
  * [[metabase.lib.join-test/join-source-card-with-in-previous-stage-with-joins-test]]
  * [[metabase.query-processor-test.explicit-joins-test/test-31769]]"
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(defn card-1-query [metadata-provider id-fn]
  (let [orders (lib.metadata/table metadata-provider (id-fn :orders))]
    (as-> (lib/query metadata-provider orders) q
      (lib/join q (let [products (lib.metadata/table metadata-provider (id-fn :products))]
                    (-> (lib/join-clause products)
                        (lib/with-join-conditions [(lib/suggested-join-condition q products)]))))
      (lib/join q (let [people (lib.metadata/table metadata-provider (id-fn :people))]
                    (-> (lib/join-clause people)
                        (lib/with-join-conditions [(lib/suggested-join-condition q people)]))))
      (lib/breakout q (let [breakout (m/find-first #(and (= (:id %) (id-fn :products :category))
                                                         (not= (:lib/source %) :source/implicitly-joinable))
                                                   (lib/breakoutable-columns q))]
                        (assert breakout)
                        breakout))
      (lib/aggregate q (lib/count)))))

(defn card-2-query [metadata-provider id-fn]
  (let [products (lib.metadata/table metadata-provider (id-fn :products))]
    (as-> (lib/query metadata-provider products) q
      (lib/breakout q (let [breakout (m/find-first #(and (= (:id %) (id-fn :products :category))
                                                         (not= (:lib/source %) :source/implicitly-joinable))
                                                   (lib/breakoutable-columns q))]
                        (assert breakout)
                        breakout)))))

(defn mock-metadata-provider
  ([]
   (mock-metadata-provider meta/metadata-provider meta/id 1 2))

  ([metadata-provider id card-1-id card-2-id]
   (lib/composed-metadata-provider
    (lib.tu/mock-metadata-provider
     {:cards [{:id            card-1-id
               :name          "Card 1"
               :database-id   (id)
               :dataset-query (card-1-query metadata-provider id)}
              {:id            card-2-id
               :name          "Card 2"
               :database-id   (id)
               :dataset-query (card-2-query metadata-provider id)}]})
    metadata-provider)))

(defn query
  ([]
   (query (mock-metadata-provider meta/metadata-provider meta/id 1 2)
          1
          2))

  ([metadata-provider card-1-id card-2-id]
   (let [card-1 (lib.metadata/card metadata-provider card-1-id)
         card-2 (lib.metadata/card metadata-provider card-2-id)]
     (assert card-1)
     (assert card-2)
     (as-> (lib/query metadata-provider card-1) q
       (lib/append-stage q)
       (lib/join q (-> (lib/join-clause card-2)
                       (lib/with-join-conditions [(let [lhs (m/find-first #(= (:name %) "CATEGORY")
                                                                          (lib/join-condition-lhs-columns q card-2 nil nil))
                                                        rhs (m/find-first #(= (:name %) "CATEGORY")
                                                                          (lib/join-condition-rhs-columns q card-2 nil nil))]
                                                    (assert lhs)
                                                    (assert rhs)
                                                    (lib/= lhs rhs))])))
       (lib/limit q 2)))))

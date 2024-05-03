(ns metabase.lib.test-util.mocks-31769
  "Mocks to reproduce the behavior of e2e test #31769 directly in MLv2 and in QP tests. Some tests using this:

  * [[metabase.lib.card-test/returned-columns-31769-test]]
  * [[metabase.lib.join-test/join-source-card-with-in-previous-stage-with-joins-test]]
  * [[metabase.query-processor-test.explicit-joins-test/test-31769]]"
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util.malli :as mu]))

(mu/defn card-1-query :- ::lib.schema/query
  "For reproducing #31769: create a query against `orders` with a join against `products` and another against `people`,
  with a breakout on `products.category` and a `count` aggregation."
  [metadata-provider :- ::lib.schema.metadata/metadata-provider
   id-fn             :- fn?]
  (let [orders (lib.metadata/table metadata-provider (id-fn :orders))]
    (as-> (lib/query metadata-provider orders) q
      (lib/join q (let [products (lib.metadata/table metadata-provider (id-fn :products))]
                    (-> (lib/join-clause products)
                        (lib/with-join-conditions (lib/suggested-join-conditions q products)))))
      (lib/join q (let [people (lib.metadata/table metadata-provider (id-fn :people))]
                    (-> (lib/join-clause people)
                        (lib/with-join-conditions (lib/suggested-join-conditions q people)))))
      (lib/breakout q (let [breakout (m/find-first #(and (= (:id %) (id-fn :products :category))
                                                         (not= (:lib/source %) :source/implicitly-joinable))
                                                   (lib/breakoutable-columns q))]
                        (assert breakout)
                        breakout))
      (lib/aggregate q (lib/count)))))

(mu/defn card-2-query :- ::lib.schema/query
  "For reproducing #31769: create a query against `products` with a breakout on `products.category` and a `count`
  aggregation."
  [metadata-provider :- ::lib.schema.metadata/metadata-provider
   id-fn             :- fn?]
  (let [products (lib.metadata/table metadata-provider (id-fn :products))]
    (as-> (lib/query metadata-provider products) q
      (lib/breakout q (let [breakout (m/find-first #(and (= (:id %) (id-fn :products :category))
                                                         (not= (:lib/source %) :source/implicitly-joinable))
                                                   (lib/breakoutable-columns q))]
                        (assert breakout)
                        breakout)))))

(mu/defn mock-metadata-provider :- ::lib.schema.metadata/metadata-provider
  "For reproducing #31769: Create a composed metadata provider with two Cards based on [[card-1-query]]
  and [[card-2-query]]."
  ([]
   (mock-metadata-provider meta/metadata-provider meta/id))

  ([base-metadata-provider :- ::lib.schema.metadata/metadata-provider
    id-fn                  :- fn?]
   (lib.tu/mock-metadata-provider
    base-metadata-provider
    {:cards [{:id            1
              :name          "Card 1"
              :database-id   (id-fn)
              :dataset-query (card-1-query base-metadata-provider id-fn)}
             {:id            2
              :name          "Card 2"
              :database-id   (id-fn)
              :dataset-query (card-2-query base-metadata-provider id-fn)}]})))

(mu/defn query :- ::lib.schema/query
  "For reproducing #31769: create a query using a `:source-card` with [[card-1-query]] as its source, joining a Card
  with [[card-2-query]]."
  ([]
   (query (mock-metadata-provider meta/metadata-provider meta/id)))

  ([metadata-provider :- ::lib.schema.metadata/metadata-provider]
   (let [card-1 (lib.metadata/card metadata-provider 1)
         card-2 (lib.metadata/card metadata-provider 2)]
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

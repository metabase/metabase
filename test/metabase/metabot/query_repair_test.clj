(ns metabase.metabot.query-repair-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.metabot.query-repair :as query-repair]
   [metabase.util.malli.registry :as mr]))

(defn strip-lib-keys
  "Recursively remove all namespaced `:lib/*` keys from a query: the shape of a query a client sends without lib's
  internal keys, or of one in conversation state persisted before the viewing context kept them (BOT-2410).
  Structurally MBQL 5 (`:stages`, MBQL 5 field clauses, `:effective-type`s) but without `:lib/type`, `:lib/uuid`,
  and `:lib/metadata`."
  [x]
  (cond
    (map? x)        (into {} (keep (fn [[k v]]
                                     (when-not (and (keyword? k) (= "lib" (namespace k)))
                                       [k (strip-lib-keys v)])))
                          x)
    (sequential? x) (mapv strip-lib-keys x)
    :else           x))

(defn stripped-aggregated-query
  "A venues query with `aggregations`, ordered by the first of them, stripped of its `:lib/*` keys. The order-by's
  `[:aggregation {} <uuid>]` ref names a uuid no aggregation carries any more."
  [& aggregations]
  (let [q (reduce lib/aggregate (lib.tu/venues-query) aggregations)]
    (strip-lib-keys (lib/order-by q (lib/aggregation-ref q 0) :desc))))

(defn stripped-query-with-aggregated-join
  "A venues query joined to a categories query that counts and orders by its count, stripped of its `:lib/*` keys.
  The dangling aggregation ref sits in the join's stage, not in the query's own."
  []
  (let [source (-> (lib/query meta/metadata-provider (meta/table-metadata :categories))
                   (lib/aggregate (lib/count)))
        source (lib/order-by source (lib/aggregation-ref source 0) :desc)
        join   (-> (lib/join-clause source [(lib/= (meta/field-metadata :venues :category-id)
                                                   (meta/field-metadata :categories :id))])
                   (lib/with-join-alias "Cat"))]
    (strip-lib-keys (lib/join (lib.tu/venues-query) join))))

(defn- order-by-ref-uuid [stage]
  (-> stage :order-by first (nth 2) (nth 2)))

(defn- sole-aggregation-uuid [stage]
  (-> stage :aggregation first second :lib/uuid))

(deftest ^:parallel normalize-query-repoints-sole-aggregation-ref-test
  (testing "a dangling ref in a stage with one aggregation is pointed at that aggregation"
    (let [repaired (query-repair/normalize-query (stripped-aggregated-query (lib/count)))
          stage    (-> repaired :stages first)]
      (is (= :mbql/query (:lib/type repaired)))
      (is (= (sole-aggregation-uuid stage) (order-by-ref-uuid stage)))
      (is (mr/validate :metabase.lib.schema/query repaired))))
  (testing "a dangling ref in a stage with several aggregations stays as it is"
    (let [stripped (stripped-aggregated-query (lib/count) (lib/sum (meta/field-metadata :venues :price)))
          repaired (query-repair/normalize-query stripped)
          stage    (-> repaired :stages first)]
      (is (= (order-by-ref-uuid (-> stripped :stages first)) (order-by-ref-uuid stage)))
      (is (not (mr/validate :metabase.lib.schema/query repaired)))))
  (testing "a query whose refs resolve is unchanged by the repair"
    (let [q (lib/aggregate (lib.tu/venues-query) (lib/count))
          q (lib/order-by q (lib/aggregation-ref q 0) :desc)]
      (is (= (lib/normalize :metabase.lib.schema/query q) (query-repair/normalize-query q))))))

(deftest ^:parallel normalize-query-repoints-refs-in-join-stages-test
  (testing "a dangling ref in the stage of a join is pointed at that stage's only aggregation"
    (let [repaired   (query-repair/normalize-query (stripped-query-with-aggregated-join))
          join-stage (-> repaired :stages first :joins first :stages first)]
      (is (= (sole-aggregation-uuid join-stage) (order-by-ref-uuid join-stage)))
      (is (mr/validate :metabase.lib.schema/query repaired)))))

(deftest ^:parallel repair-stripped-query-test
  (testing "a structured query without :lib/type comes back as valid MBQL 5"
    (let [repaired (query-repair/repair-stripped-query (stripped-aggregated-query (lib/count)))]
      (is (= :mbql/query (:lib/type repaired)))
      (is (mr/validate :metabase.lib.schema/query repaired))))
  (testing "a query the repair cannot make valid is returned as it was"
    (let [stripped (stripped-aggregated-query (lib/count) (lib/sum (meta/field-metadata :venues :price)))]
      (is (= stripped (query-repair/repair-stripped-query stripped)))))
  (testing "a query that does not normalize is returned as it was"
    (let [broken {:database 1, :stages "not stages"}]
      (is (= broken (query-repair/repair-stripped-query broken)))))
  (testing "anything else is untouched"
    (let [mbql-5 (lib.tu/venues-query)
          legacy {:database 1, :type :query, :query {:source-table 2}}]
      (doseq [[shape value] {"MBQL 5"                 mbql-5
                             "MBQL 5 with string type" (assoc (strip-lib-keys mbql-5) :lib/type "mbql/query")
                             "legacy"                  legacy
                             "nil"                     nil
                             "a string"                "SELECT 1"
                             "an empty map"            {}}]
        (testing shape
          (is (= value (query-repair/repair-stripped-query value))))))))

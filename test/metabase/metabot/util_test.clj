(ns metabase.metabot.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.util :as metabot.u]))

(deftest ^:parallel extract-sql-content-native-test
  (testing "extracts SQL from normalized MBQL 5 and legacy query shapes"
    (are [expected query] (= expected (metabot.u/extract-sql-content query))
      "SELECT 1" {:stages [{:lib/type :mbql.stage/native
                            :native   "SELECT 1"}]}
      "SELECT 2" {:native {:query "SELECT 2"}})))

(deftest ^:parallel extract-sql-content-orphaned-query-test
  (testing "extracts SQL from orphaned string-keyed query shapes"
    (are [expected query] (= expected (metabot.u/extract-sql-content query))
      "SELECT 3" {"database" nil
                  "native"   {"query" "SELECT 3"}}
      "SELECT 4" {"database" nil
                  "stages"   [{"native" "SELECT 4"}]})))

(deftest ^:parallel extract-sql-content-multi-stage-test
  (testing "does not mistake the first stage of a multi-stage query for the whole query"
    (are [query] (nil? (metabot.u/extract-sql-content query))
      {:stages [{:lib/type :mbql.stage/native :native "SELECT 5"}
                {:lib/type :mbql.stage/mbql}]}
      {"stages" [{"native" "SELECT 6"}
                 {"lib/type" "mbql.stage/mbql"}]})))

(deftest ^:parallel extract-sql-content-non-native-test
  (testing "a non-native MBQL query has no SQL content"
    (is (nil? (metabot.u/extract-sql-content
               {:stages [{:lib/type :mbql.stage/mbql :source-table 1}]})))))

;;; ---------------------------------- Orphaned aggregation refs ----------------------------------

(def ^:private agg-uuid "11111111-1111-1111-1111-111111111111")
(def ^:private orphan-uuid "99999999-9999-9999-9999-999999999999")

(defn- stage-with-order-by
  "A one-stage MBQL 5 query whose order-by references an aggregation by `ref-uuid`."
  [aggregations ref-uuid]
  {:lib/type :mbql/query
   :database 1
   :stages   [{:lib/type     :mbql.stage/mbql
               :source-table 1
               :aggregation  aggregations
               :order-by     [[:desc {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}
                               [:aggregation {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} ref-uuid]]]}]})

(defn- order-by-ref-uuid [query]
  (get-in query [:stages 0 :order-by 0 2 2]))

(deftest ^:parallel repair-orphaned-aggregation-refs-single-aggregation-test
  (testing "rebinds an orphaned ref to the stage's only aggregation"
    (let [query (stage-with-order-by [[:count {:lib/uuid agg-uuid}]] orphan-uuid)]
      (is (= agg-uuid
             (order-by-ref-uuid (metabot.u/repair-orphaned-aggregation-refs query)))))))

(deftest ^:parallel repair-orphaned-aggregation-refs-no-op-test
  (testing "a query whose refs all resolve is returned unchanged"
    (let [query (stage-with-order-by [[:count {:lib/uuid agg-uuid}]] agg-uuid)]
      (is (= query (metabot.u/repair-orphaned-aggregation-refs query)))))
  (testing "a query with no stages (e.g. legacy MBQL) passes through untouched"
    (let [legacy {:database 1 :type :query :query {:source-table 1 :aggregation [[:count]]}}]
      (is (= legacy (metabot.u/repair-orphaned-aggregation-refs legacy))))))

(deftest ^:parallel repair-orphaned-aggregation-refs-ambiguous-test
  (testing "leaves the ref alone when several aggregations make the intended target unrecoverable"
    (let [query (stage-with-order-by [[:count {:lib/uuid agg-uuid}]
                                      [:count {:lib/uuid "22222222-2222-2222-2222-222222222222"}]]
                                     orphan-uuid)]
      (is (= query (metabot.u/repair-orphaned-aggregation-refs query))))))

(deftest ^:parallel repair-orphaned-aggregation-refs-unnormalized-test
  (testing "an unnormalized aggregation has no uuid to bind to, so the ref is left alone"
    (let [query (stage-with-order-by [[:count {}]] orphan-uuid)]
      (is (= query (metabot.u/repair-orphaned-aggregation-refs query))))))

(deftest ^:parallel repair-orphaned-aggregation-refs-scoping-test
  (testing "a later stage's orphaned ref is not bound to an earlier stage's aggregation"
    ;; MBQL 5 aggregation refs are same-stage only, so a cross-stage rebind would invent a
    ;; reference the schema forbids.
    (let [query {:lib/type :mbql/query
                 :database 1
                 :stages   [{:lib/type     :mbql.stage/mbql
                             :source-table 1
                             :aggregation  [[:count {:lib/uuid agg-uuid}]]}
                            {:lib/type :mbql.stage/mbql
                             :order-by [[:desc {:lib/uuid "cccccccc-cccc-cccc-cccc-cccccccccccc"}
                                         [:aggregation {:lib/uuid "dddddddd-dddd-dddd-dddd-dddddddddddd"} orphan-uuid]]]}]}]
      (is (= query (metabot.u/repair-orphaned-aggregation-refs query)))))
  (testing "a join's own aggregation is used for refs inside that join, not the outer stage's"
    (let [join-agg-uuid "33333333-3333-3333-3333-333333333333"
          query         {:lib/type :mbql/query
                         :database 1
                         :stages   [{:lib/type     :mbql.stage/mbql
                                     :source-table 1
                                     :aggregation  [[:count {:lib/uuid agg-uuid}]]
                                     :joins        [{:lib/type :mbql/join
                                                     :alias    "j"
                                                     :stages   [{:lib/type     :mbql.stage/mbql
                                                                 :source-table 2
                                                                 :aggregation  [[:count {:lib/uuid join-agg-uuid}]]
                                                                 :order-by     [[:desc {:lib/uuid "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"}
                                                                                 [:aggregation {:lib/uuid "ffffffff-ffff-ffff-ffff-ffffffffffff"} orphan-uuid]]]}]}]}]}
          repaired      (metabot.u/repair-orphaned-aggregation-refs query)]
      (is (= join-agg-uuid
             (get-in repaired [:stages 0 :joins 0 :stages 0 :order-by 0 2 2]))))))

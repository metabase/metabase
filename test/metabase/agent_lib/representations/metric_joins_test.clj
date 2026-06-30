(ns metabase.agent-lib.representations.metric-joins-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.representations.metric-joins :as repr.metric-joins]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]))

(set! *warn-on-reflection* true)

(def ^:private base-mp
  "ORDERS(10) and CATEGORIES(20) with NO foreign key between them."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS"     :schema "PUBLIC" :db-id 1}
               {:id 20 :name "CATEGORIES" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"     :table-id 10 :base-type :type/Integer}
               {:id 101 :name "TOTAL"  :table-id 10 :base-type :type/Float}
               {:id 102 :name "CAT_ID" :table-id 10 :base-type :type/Integer}
               {:id 200 :name "ID"     :table-id 20 :base-type :type/Integer}
               {:id 201 :name "NAME"   :table-id 20 :base-type :type/Text}]}))

(def ^:private metric-query
  "Count of ORDERS with an explicit (no-FK) join to CATEGORIES."
  (-> (lib/query base-mp (lib.metadata/table base-mp 10))
      (lib/join (lib/join-clause (lib.metadata/table base-mp 20)
                                 [(lib/= (lib.metadata/field base-mp 102)
                                         (lib.metadata/field base-mp 200))]))
      (lib/aggregate (lib/count))))

(def ^:private consumer-query
  "References ORDERS with a breakout on CATEGORIES.NAME (bare field, no join)."
  (-> (lib/query base-mp (lib.metadata/table base-mp 10))
      (lib/aggregate (lib/count))
      (assoc-in [:stages 0 :breakout] [[:field {:lib/uuid (str (random-uuid))} 201]])))

(deftest ^:parallel metric-definition-query-exposes-joins-test
  (testing "metric-definition-query builds from the card's :dataset-query, preserving its joins"
    (let [legacy (lib.convert/->legacy-MBQL metric-query)
          mp     (lib.tu/mock-metadata-provider
                  base-mp
                  {:cards [{:id 700 :name "Order Count by Category" :type :metric
                            :database-id 1 :table-id 10 :dataset-query legacy}]})
          mq     (repr.metric-joins/metric-definition-query mp 700)]
      (is (some? mq))
      (is (= 1 (count (lib/joins mq -1))) "the metric definition's join is visible")
      (is (= 20 (get-in (first (lib/joins mq -1)) [:stages 0 :source-table])) "join targets CATEGORIES"))
    (testing "returns nil for a missing card"
      (is (nil? (repr.metric-joins/metric-definition-query base-mp 999))))))

(deftest ^:parallel include-implicit-joins-adds-metric-join-test
  (testing "the metric's explicit join is appended to the consumer stage"
    (let [result (repr.metric-joins/include-implicit-joins consumer-query 0 metric-query)
          joins  (lib/joins result 0)]
      (is (= 1 (count joins)))
      (is (= 20 (get-in (first joins) [:stages 0 :source-table])) "join targets CATEGORIES")
      (is (= (:alias (first (lib/joins metric-query -1)))
             (:alias (first joins)))
          "the metric's own join alias is preserved (so the QP dedupes at execution)"))))

(deftest ^:parallel include-implicit-joins-dedupes-test
  (testing "applying the helper twice does not duplicate the join (idempotent on join set)"
    (let [once  (repr.metric-joins/include-implicit-joins consumer-query 0 metric-query)
          twice (repr.metric-joins/include-implicit-joins once 0 metric-query)]
      (is (= 1 (count (lib/joins once 0))))
      (is (= 1 (count (lib/joins twice 0))) "second application is a no-op"))))

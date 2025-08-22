(ns ^:mb/driver-tests metabase-enterprise.transforms.execute-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.query-test-util :as query-test-util]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :refer [with-transform-cleanup!]]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- make-query
  "Create a query using the shared test utility.
   Maintains the same signature for compatibility with existing tests."
  ([source-table]
   (query-test-util/make-query {:source-table source-table}))
  ([source-table source-column constraint-fn & constraint-params]
   (query-test-util/make-query
    {:source-table  source-table
     :source-column source-column
     :filter-fn     constraint-fn
     :filter-values constraint-params})))

(defn- wait-for-table
  [table-name timeout-ms]
  (let [mp    (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        limit (+ (System/currentTimeMillis) timeout-ms)]
    (loop []
      (Thread/sleep 200)
      (when (> (System/currentTimeMillis) limit)
        (throw (ex-info "table has not been created" {:table-name table-name, :timeout-ms timeout-ms})))
      (or (m/find-first (comp #{table-name} :name) (lib.metadata/tables mp))
          (recur)))))

(deftest execute-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/dataset transforms-dataset/transforms-test
      (let [target-type "table"
            schema      (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
        (with-transform-cleanup! [{table1-name :name :as target1} {:type   target-type
                                                                   :schema schema
                                                                   :name   "g_products"}
                                  {table2-name :name :as target2} {:type   target-type
                                                                   :schema schema
                                                                   :name   "gizmo_products"}]
          (let [table-name (t2/select-one-fn :name :model/Table (mt/id :transforms_products))
                t1-query (make-query table-name "category" lib/starts-with "G")]
            (mt/with-temp [:model/Transform t1 {:name   "transform1"
                                                :source {:type  :query
                                                         :query (lib.convert/->legacy-MBQL t1-query)}
                                                :target target1}]
              (transforms.execute/run-mbql-transform! t1 {:run-method :manual})
              (let [table1   (wait-for-table table1-name 10000)
                    t2-query (make-query table1 "category" lib/= "Gizmo")]
                (mt/with-temp [:model/Transform t2 {:name   "transform2"
                                                    :source {:type  :query
                                                             :query (lib.convert/->legacy-MBQL t2-query)}
                                                    :target target2}]
                  (transforms.execute/run-mbql-transform! t2 {:run-method :cron})
                  (let [table2      (wait-for-table table2-name 10000)
                        check-query (lib/aggregate (make-query table2) (lib/count))
                        query-result (qp/process-query check-query)]
                    ;; The transforms-test dataset has exactly 4 Gizmo products (IDs 6, 8, 12, 14)
                    ;; First transform filters for categories starting with "G" (Gadget and Gizmo)
                    ;; Second transform filters for category = "Gizmo", resulting in 4 products
                    (is (= [[4]]
                           (mt/formatted-rows [int] query-result)))
                    (is (= [{:name "count"}]
                           (map #(select-keys % [:name])
                                (mt/cols query-result))))))))))))))

(deftest execute-test-aggregation-query
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/dataset transforms-dataset/transforms-test
      (let [target-type "table"
            schema      (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
        (with-transform-cleanup! [target-table {:type   target-type
                                                :schema schema
                                                :name   "widgets_daily"}]
          (let [mp (mt/metadata-provider)
                transforms-products (lib.metadata/table mp (mt/id :transforms_products))
                transforms-orders (lib.metadata/table mp (mt/id :transforms_orders))
                products-id (lib.metadata/field mp (mt/id :transforms_products :id))
                orders-product-id (lib.metadata/field mp (mt/id :transforms_orders :product_id))
                products-category (lib.metadata/field mp (mt/id :transforms_products :category))
                orders-total (lib.metadata/field mp (mt/id :transforms_orders :total))
                orders-order-date (lib.metadata/field mp (mt/id :transforms_orders :order_date))
                aggregated-query (-> (lib/query mp transforms-products)
                                     (lib/join (lib/join-clause transforms-orders
                                                                [(lib/= products-id orders-product-id)]))
                                     (lib/filter (lib/= products-category "Widget"))
                                     (lib/filter (lib/not-null orders-total))
                                     (lib/aggregate (lib/sum orders-total))
                                     (lib/breakout (lib/with-temporal-bucket
                                                     orders-order-date :day))
                                     (as-> <> (lib/order-by <> (lib/aggregation-ref <> 0) :desc)))]
            (mt/with-temp [:model/Transform transform {:name   "transform"
                                                       :source {:type  :query
                                                                :query (lib.convert/->legacy-MBQL aggregated-query)}
                                                       :target target-table}]
              (transforms.execute/run-mbql-transform! transform {:run-method :manual})
              (let [table-result      (wait-for-table (:name target-table) 10000)
                    query-result (->> (lib/query mp table-result)
                                      (qp/process-query)
                                      (mt/formatted-rows [str 2.0])
                                      (sort-by second >)
                                      vec)]
                (is (= [["2024-01-24T00:00:00Z" 104.97]
                        ["2024-01-22T00:00:00Z" 49.98]
                        ["2024-01-15T00:00:00Z" 39.98]
                        ["2024-01-21T00:00:00Z" 19.99]
                        ["2024-01-23T00:00:00Z" 14.99]]
                       query-result))))))))))

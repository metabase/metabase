(ns metabase.query-processor.middleware.metrics-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.metrics :as metrics]
   [metabase.test :as mt]))

(def counter (atom (rand-int 2000)))

(defn- basic-metric-query []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
      (lib/aggregate (lib/avg (meta/field-metadata :products :rating)))))

(defn- mock-metric
  ([]
   (mock-metric (basic-metric-query)))
  ([query]
   (mock-metric meta/metadata-provider query))
  ([metadata-provider query]
   (let [metric {:lib/type :metadata/card
                 :id (swap! counter inc)
                 :database-id (meta/id)
                 :name "Mock metric - Avertage Product Rating"
                 :type :metric
                 :dataset-query query}]
     [metric (lib/composed-metadata-provider
               metadata-provider
               (lib.tu/mock-metadata-provider
                 {:cards [metric]}))])))

(deftest ^:parallel expand-aggregation-metric-ref-test
  (let [[source-metric mp] (mock-metric)
        query (-> (lib/query mp source-metric)
                  (lib/aggregate (lib/+ (lib.options/ensure-uuid [:metric {} (:id source-metric)]) 1)))]
    (is (=?
          {:stages [{:source-table (meta/id :products)
                     :aggregation [[:avg {} [:field {} (meta/id :products :rating)]]
                                   [:+ {} [:avg {} [:field {} (meta/id :products :rating)]] 1]]}]}
          (metrics/expand query)))))

(deftest ^:parallel expand-aggregation-metric-ordering-test
  (let [[source-metric mp] (mock-metric)
        query (-> (lib/query mp source-metric)
                  (lib/aggregate (lib/+ (lib.options/ensure-uuid [:metric {} (:id source-metric)]) 1)))]
    (doseq [agg-ref (map lib.options/uuid (lib/aggregations query))
            :let [ordered (lib/order-by query (lib.options/ensure-uuid [:aggregation {} agg-ref]))
                  expanded (metrics/expand ordered)]]
      (is (=? {:stages
               [{:aggregation
                 [[:avg {} [:field {} (meta/id :products :rating)]]
                  [:+ {} [:avg {} [:field {} (meta/id :products :rating)]] 1]]
                 :order-by
                 [[:asc {} [:aggregation {} agg-ref]]]}]}
              expanded)))))

(deftest ^:parallel expand-basic-test
  (let [[source-metric mp] (mock-metric)
        query (-> (lib/query mp source-metric))]
    (is (=?
          {:stages [{:source-table (meta/id :products)
                     :aggregation [[:avg {} [:field {} (meta/id :products :rating)]]]}]}
          (metrics/expand query)))
    (is (lib.equality/=
          (lib/query mp (:dataset-query source-metric))
          (metrics/expand query)))))

(deftest ^:parallel expand-expression-test
  (let [[source-metric mp] (mock-metric (lib/expression (basic-metric-query) "source" (lib/+ 1 1)))
        query (-> (lib/query mp source-metric)
                  (lib/expression "target" (lib/- 2 2)))]
    (is (=?
          {:stages [{:expressions [[:+ {} 1 1]
                                   [:- {} 2 2]]}]}
          (metrics/expand query)))))

(deftest ^:parallel expand-filter-test
  (let [[source-metric mp] (mock-metric (lib/filter (basic-metric-query) (lib/> (meta/field-metadata :products :price) 1)))
        query (-> (lib/query mp source-metric)
                  (lib/filter (lib/= (meta/field-metadata :products :category) "Widget")))]
    (is (=?
          {:stages [{:filters [[:> {} [:field {} (meta/id :products :price)] 1]
                               [:= {} [:field {} (meta/id :products :category)] "Widget"]]}]}
          (metrics/expand query)))))

(deftest ^:parallel expand-multi-metric-test
  (let [[first-metric mp] (mock-metric (lib/filter (basic-metric-query) (lib/> (meta/field-metadata :products :price) 1)))
        [second-metric mp] (mock-metric mp (-> (lib/query mp first-metric)
                                               (lib/filter (lib/< (meta/field-metadata :products :price) 100))))
        query (-> (lib/query mp second-metric)
                  (lib/filter (lib/= (meta/field-metadata :products :category) "Widget")))]
    (is (=?
          {:stages [{:source-table (meta/id :products)
                     :filters [[:> {} [:field {} (meta/id :products :price)] 1]
                               [:< {} [:field {} (meta/id :products :price)] 100]
                               [:= {} [:field {} (meta/id :products :category)] "Widget"]]}]}
          (metrics/expand query)))))

(deftest ^:parallel e2e-results-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                         (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :products :rating)))))]
    (mt/with-temp [:model/Card source-metric {:dataset_query (lib.convert/->legacy-MBQL source-query)
                                              :database_id (mt/id)
                                              :type :metric}]
      (let [query (lib/query mp (lib.metadata/card mp (:id source-metric)))]
        (is (=
             (mt/rows (qp/process-query source-query))
             (mt/rows (qp/process-query query))))))))

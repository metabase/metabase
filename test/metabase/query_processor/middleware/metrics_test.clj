(ns metabase.query-processor.middleware.metrics-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
   [metabase.query-processor.middleware.metrics :as metrics]
   [metabase.test :as mt]
   [metabase.util :as u]))

(def counter (atom (rand-int 2000)))

(defn- basic-metric-query []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
      (lib/aggregate (update (lib/avg (meta/field-metadata :products :rating)) 1 assoc :name (u/slugify "Mock metric")))))

(defn- mock-metric
  ([]
   (mock-metric (basic-metric-query)))
  ([query]
   (mock-metric meta/metadata-provider query))
  ([metadata-provider query]
   (let [metric {:lib/type :metadata/card
                 :id (swap! counter inc)
                 :database-id (meta/id)
                 :name "Mock metric"
                 :type :metric
                 :dataset-query query}]
     [metric (lib/composed-metadata-provider
               metadata-provider
               (lib.tu/mock-metadata-provider
                 {:cards [metric]}))])))

(def adjust
  (comp #'metrics/adjust #'fetch-source-query/resolve-source-cards))

(deftest ^:parallel adjust-basic-source-table-test
  (let [[source-metric mp] (mock-metric)
        query (-> (lib/query mp (meta/table-metadata :products))
                  (lib/aggregate (lib.metadata/metric mp (:id source-metric))))]
    (is (=? {:stages [{:source-table (meta/id :products)
                       :aggregation [[:avg {} [:field {} (meta/id :products :rating)]]]}]}
            (adjust query)))))

(deftest ^:parallel adjust-basic-source-metric-test
  (let [[source-metric mp] (mock-metric)
        query (lib/query mp source-metric)]
    (is (=?
          {:stages [{:source-table (meta/id :products)}
                    {:aggregation [[:avg {} [:field {} (meta/id :products :rating)]]]}]}
          (adjust query)))))

(deftest ^:parallel adjust-aggregation-metric-ref-test
  (let [[source-metric mp] (mock-metric)
        query (-> (lib/query mp (meta/table-metadata :products))
                  (lib/aggregate (lib/+ (lib.options/ensure-uuid [:metric {} (:id source-metric)]) 1)))]
    (is (=?
          {:stages [{:source-table (meta/id :products)
                     :aggregation [[:+ {} [:avg {} [:field {} (meta/id :products :rating)]] 1]]}]}
          (adjust query)))))

(deftest ^:parallel adjust-aggregation-metric-ordering-test
  (let [[source-metric mp] (mock-metric)
        query (-> (lib/query mp (meta/table-metadata :products))
                  (lib/aggregate (lib/+ (lib.options/ensure-uuid [:metric {} (:id source-metric)]) 1)))]
    (doseq [agg-ref (map lib.options/uuid (lib/aggregations query))
            :let [ordered (lib/order-by query (lib.options/ensure-uuid [:aggregation {} agg-ref]))
                  adjusted (adjust ordered)]]
      (is (=? {:stages
               [{:source-table (meta/id :products)
                 :aggregation
                 [[:+ {} [:avg {} [:field {} (meta/id :products :rating)]] 1]]
                 :order-by
                 [[:asc {} [:aggregation {} agg-ref]]]}]}
              adjusted)))))

(deftest ^:parallel adjust-join-test
  (let [[source-metric mp] (mock-metric)
        query (-> (lib/query mp source-metric)
                  (lib/join (-> (lib/join-clause (meta/table-metadata :orders)
                                                 [(lib/=
                                                    (meta/field-metadata :products :id)
                                                    (meta/field-metadata :orders :product-id))])
                                (lib/with-join-fields :all))))]
    (is (=?
          {:stages [{:source-table (meta/id :products)}
                    {:aggregation [[:avg {} [:field {} (meta/id :products :rating)]]]
                     :joins [{:stages
                              [{:source-table (meta/id :orders)}],
                              :conditions
                              [[:= {}
                                [:field {} (meta/id :products :id)]
                                [:field {:join-alias "Orders"} (meta/id :orders :product-id)]]],
                              :alias "Orders"}]}]}
          (adjust query)))))

(deftest ^:parallel adjust-expression-test
  (let [[source-metric mp] (mock-metric (lib/expression (basic-metric-query) "source" (lib/+ 1 1)))
        query (-> (lib/query mp source-metric)
                  (lib/expression "target" (lib/- 2 2)))]
    (is (=?
          {:stages [{:expressions [[:+ {:lib/expression-name "source"} 1 1]]}
                    {:expressions [[:- {:lib/expression-name "target"} 2 2]]
                     :aggregation [[:avg {} [:field {} (meta/id :products :rating)]]]}]}
          (adjust query)))))

(deftest ^:parallel adjust-filter-test
  (let [[source-metric mp] (mock-metric (lib/filter (basic-metric-query) (lib/> (meta/field-metadata :products :price) 1)))
        query (-> (lib/query mp source-metric)
                  (lib/filter (lib/= (meta/field-metadata :products :category) "Widget")))]
    (is (=?
          {:stages [{:source-table (meta/id :products)
                     :filters [[:> {} [:field {} (meta/id :products :price)] 1]]}
                    {:filters [[:= {} [:field {} (meta/id :products :category)] "Widget"]]}]}
          (adjust query)))))

(deftest ^:parallel adjust-mixed-multi-source-test
  (let [[first-metric mp] (mock-metric lib.tu/metadata-provider-with-mock-cards
                                       (-> (lib/query lib.tu/metadata-provider-with-mock-cards (:products lib.tu/mock-cards))
                                           (lib/aggregate (update (lib/avg (meta/field-metadata :products :rating)) 1 assoc :name (u/slugify "Mock metric")))
                                           (lib/filter (lib/> (meta/field-metadata :products :price) 1))))
        [second-metric mp] (mock-metric mp (-> (lib/query mp first-metric)
                                               (lib/filter (lib/< (meta/field-metadata :products :price) 100))))
        query (-> (lib/query mp second-metric)
                  (lib/filter (lib/= (meta/field-metadata :products :category) "Widget")))]
    (is (=?
          {:stages [{:source-table (meta/id :products)}
                    {:filters [[:> {} [:field {} (meta/id :products :price)] 1]]
                     :aggregation complement}
                    {:filters [[:< {} [:field {} (meta/id :products :price)] 100]]
                     :aggregation complement}
                    {:filters [[:= {} [:field {} (meta/id :products :category)] "Widget"]]
                     :aggregation some?}]}
          (adjust query)))))

(deftest ^:parallel e2e-source-metric-results-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                         (lib/filter (lib/< (lib.metadata/field mp (mt/id :products :price)) 3))
                         (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :products :rating)))))]
    (mt/with-temp [:model/Card source-metric {:dataset_query (lib.convert/->legacy-MBQL source-query)
                                              :database_id (mt/id)
                                              :name "new_metric"
                                              :type :metric}]
      (let [query (lib/query mp (lib.metadata/card mp (:id source-metric)))]
        (is (=
             (mt/rows (qp/process-query source-query))
             (mt/rows (qp/process-query query))))))))

(deftest ^:parallel e2e-source-table-results-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                         (lib/filter (lib/< (lib.metadata/field mp (mt/id :products :price)) 30))
                         (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :products :rating)))))]
    (mt/with-temp [:model/Card source-metric {:dataset_query (lib.convert/->legacy-MBQL source-query)
                                              :database_id (mt/id)
                                              :name "new_metric"
                                              :type :metric}]
      (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                      (lib/filter (lib/< (lib.metadata/field mp (mt/id :products :rating)) 3))
                      (lib/aggregate (lib.metadata/metric mp (:id source-metric))))]
        (is (=
              (mt/rows (qp/process-query (-> source-query
                                             (lib/filter (lib/< (lib.metadata/field mp (mt/id :products :rating)) 3)))))
              (mt/rows (qp/process-query query))))))))

(deftest ^:parallel e2e-source-card-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                         (lib/aggregate (lib/count)))]
    (mt/with-temp [:model/Card source-metric {:dataset_query (lib.convert/->legacy-MBQL source-query)
                                              :database_id (mt/id)
                                              :name "new_metric"
                                              :type :metric}]
      (let [query (as-> (lib/query mp (lib.metadata/card mp (:id source-metric))) $q
                    (lib/remove-clause $q (first (lib/aggregations $q)))
                    (lib/limit $q 1))]
        (is (=?
              (mt/rows
                (qp/process-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                      (lib/limit 1))))
              (mt/rows
                (qp/process-query query))))))))

(ns metabase.query-processor.middleware.metrics-test
  (:require
   [clojure.test :refer [deftest is]]
   [medley.core :as m]
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

(deftest ^:parallel expand-join-test
  (let [[source-metric mp] (mock-metric)
        query (-> (lib/query mp source-metric)
                  (lib/join (-> (lib/join-clause (meta/table-metadata :orders)
                                                 [(lib/=
                                                   (meta/field-metadata :products :id)
                                                   (meta/field-metadata :orders :product-id))])
                                (lib/with-join-fields :all))))]
    (is (=?
         {:stages [{:source-table (meta/id :products)
                    :aggregation [[:avg {} [:field {} (meta/id :products :rating)]]]
                    :joins [{:stages
                             [{:source-table (meta/id :orders)}],
                             :conditions
                             [[:= {}
                               [:field {} (meta/id :products :id)]
                               [:field {:join-alias "Orders"} (meta/id :orders :product-id)]]],
                             :alias "Orders"}]}]}
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

(deftest ^:parallel expand-joined-metric-test
  (let [[source-metric mp] (mock-metric)
        query (as-> (lib/query mp (meta/table-metadata :orders)) $q
                (lib/join $q (lib/join-clause (lib.metadata/card mp (:id source-metric))
                                              [(lib/= (meta/field-metadata :orders :product-id)
                                                      (meta/field-metadata :products :id))]))
                (lib/aggregate $q (lib.options/ensure-uuid [:metric {:join-alias "Mock metric - Product"} (:id source-metric)])))]
    (is (=?
          {:stages [{:joins [{:stages [{:source-table (meta/id :products)}]}]
                     :aggregation [[:avg {} [:field {} (meta/id :products :rating)]]]}]}
          (metrics/expand query)))))

(deftest ^:parallel e2e-results-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                         (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :products :rating)))))]
    (mt/with-temp [:model/Card source-metric {:dataset_query (lib.convert/->legacy-MBQL source-query)
                                              :database_id (mt/id)
                                              :creator_id 1
                                              :type :metric}]
      (let [query (lib/query mp (lib.metadata/card mp (:id source-metric)))]
        (is (=
             (mt/rows (qp/process-query source-query))
             (mt/rows (qp/process-query query))))))))

(deftest ^:parallel e2e-join-to-table-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                         (lib/aggregate (lib/count)))
        find-by-id (fn [id columns]
                     (m/find-first (comp #{id} :id) columns))]
    (mt/with-temp [:model/Card source-metric {:dataset_query (lib.convert/->legacy-MBQL source-query)
                                              :database_id (mt/id)
                                              :name "new_metric"
                                              :type :metric}]

      (let [source-metric-id (:id source-metric)
            metric (lib.metadata/card mp source-metric-id)
            join-alias (:name metric)
            q (as-> (lib/query mp (lib.metadata/table mp (mt/id :products))) $q
                (lib/join $q (lib/join-clause
                               metric
                               [(lib/= (lib/with-join-alias
                                         (find-by-id (mt/id :orders :id) (lib/joinable-columns $q -1 metric))
                                         join-alias)
                                       (lib.metadata/field mp (mt/id :products :id)))]))
                ;; TODO how to make new metric reference?
                (lib/aggregate $q (lib.options/ensure-uuid [:metric {:base-type :type/Float :join-alias join-alias} source-metric-id]))
                (lib/breakout $q (lib/with-temporal-bucket
                                   (find-by-id (mt/id :orders :created_at) (lib/breakoutable-columns $q))
                                   :month))
                (lib/breakout $q (find-by-id (mt/id :products :vendor) (lib/breakoutable-columns $q)))
                (lib/filter $q (lib/between (find-by-id (mt/id :orders :quantity) (lib/filterable-columns $q))
                                            1 5))
                (lib/append-stage $q)
                (lib/filter $q (lib/= (find-by-id (mt/id :products :vendor) (lib/filterable-columns $q))
                                      "Americo Sipes and Sons"
                                      "Aufderhar-Boehm"
                                      "Balistreri-Muller"))
                (lib/filter $q (lib/between
                                 (m/find-first (comp #{"new_metric"} :name) (lib/filterable-columns $q))
                                 10 100)))]
        (is (= [["2016-05-01T00:00:00Z" "Americo Sipes and Sons" 19]
                ["2016-05-01T00:00:00Z" "Aufderhar-Boehm" 19]
                ["2016-05-01T00:00:00Z" "Balistreri-Muller" 19]
                ["2016-06-01T00:00:00Z" "Americo Sipes and Sons" 16]
                ["2016-06-01T00:00:00Z" "Aufderhar-Boehm" 16]
                ["2016-06-01T00:00:00Z" "Balistreri-Muller" 16]
                ["2016-07-01T00:00:00Z" "Americo Sipes and Sons" 50]
                ["2016-07-01T00:00:00Z" "Aufderhar-Boehm" 50]
                ["2016-07-01T00:00:00Z" "Balistreri-Muller" 50]
                ["2016-08-01T00:00:00Z" "Americo Sipes and Sons" 21]
                ["2016-08-01T00:00:00Z" "Aufderhar-Boehm" 21]
                ["2016-08-01T00:00:00Z" "Balistreri-Muller" 21]
                ["2016-09-01T00:00:00Z" "Americo Sipes and Sons" 74]
                ["2016-09-01T00:00:00Z" "Aufderhar-Boehm" 74]
                ["2016-09-01T00:00:00Z" "Balistreri-Muller" 74]
                ["2016-10-01T00:00:00Z" "Americo Sipes and Sons" 83]
                ["2016-10-01T00:00:00Z" "Aufderhar-Boehm" 83]
                ["2016-10-01T00:00:00Z" "Balistreri-Muller" 83]]
               (mt/rows
                 (qp/process-query q))))))))

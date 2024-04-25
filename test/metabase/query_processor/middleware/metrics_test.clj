(ns metabase.query-processor.middleware.metrics-test
  (:require
   [clojure.test :refer [deftest is]]
   [medley.core :as m]
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
  (comp metrics/adjust fetch-source-query/resolve-source-cards))

(deftest ^:parallel adjust-aggregation-metric-ref-test
  (let [[source-metric mp] (mock-metric)
        query (-> (lib/query mp source-metric)
                  (lib/aggregate (lib/+ (lib.options/ensure-uuid [:metric {} (:id source-metric)]) 1)))]
    (is (=?
          {:stages [{:source-table (meta/id :products)}
                    {:aggregation [[:avg {} [:field {} (meta/id :products :rating)]]
                                   [:+ {} [:avg {} [:field {} (meta/id :products :rating)]] 1]]}]}
          (adjust query)))))

(deftest ^:parallel adjust-aggregation-metric-ordering-test
  (let [[source-metric mp] (mock-metric)
        query (-> (lib/query mp source-metric)
                  (lib/aggregate (lib/+ (lib.options/ensure-uuid [:metric {} (:id source-metric)]) 1)))]
    (doseq [agg-ref (map lib.options/uuid (lib/aggregations query))
            :let [ordered (lib/order-by query (lib.options/ensure-uuid [:aggregation {} agg-ref]))
                  adjusted (adjust ordered)]]
      (is (=? {:stages
               [{:source-table (meta/id :products)}
                {:aggregation
                 [[:avg {} [:field {} (meta/id :products :rating)]]
                  [:+ {} [:avg {} [:field {} (meta/id :products :rating)]] 1]]
                 :order-by
                 [[:asc {} [:aggregation {} agg-ref]]]}]}
              adjusted)))))

(deftest ^:parallel adjust-basic-test
  (let [[source-metric mp] (mock-metric)
        query (-> (lib/query mp source-metric))]
    (is (=?
          {:stages [{:source-table (meta/id :products) :aggregation complement}
                    {:aggregation [[:avg {} [:field {} (meta/id :products :rating)]]]}]}
          (adjust query)))))

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

(deftest ^:parallel adjust-multi-metric-test
  (let [[first-metric mp] (mock-metric (lib/filter (basic-metric-query) (lib/> (meta/field-metadata :products :price) 1)))
        [second-metric mp] (mock-metric mp (-> (lib/query mp first-metric)
                                               (lib/filter (lib/< (meta/field-metadata :products :price) 100))))
        query (-> (lib/query mp second-metric)
                  (lib/filter (lib/= (meta/field-metadata :products :category) "Widget")))]
    (is (=?
          {:stages [{:source-table (meta/id :products)
                     :filters [[:> {} [:field {} (meta/id :products :price)] 1]]
                     :aggregation complement}
                    {:filters [[:< {} [:field {} (meta/id :products :price)] 100]]
                     :aggregation complement}
                    {:filters [[:= {} [:field {} (meta/id :products :category)] "Widget"]]
                     :aggregation some?}]}
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

(deftest ^:parallel adjust-joined-metric-test
  (let [[source-metric mp] (mock-metric)
        query (as-> (lib/query mp (meta/table-metadata :orders)) $q
                (lib/join $q (lib/join-clause (lib.metadata/card mp (:id source-metric))
                                              [(lib/= (meta/field-metadata :orders :product-id)
                                                      (meta/field-metadata :products :id))]))
                (lib/aggregate $q (lib.options/ensure-uuid [:metric {:join-alias "Mock metric - Product"} (:id source-metric)])))]
    (is (=?
          ;; joins get an extra, empty stage from 'fetch-source-query'
          {:stages [{:joins [{:stages [{:source-table (meta/id :products)} {}]}]
                     :aggregation [[:avg {:name "mock_metric___product"}
                                    [:field {} (meta/id :products :rating)]]]}]}
          (adjust query)))))

(deftest ^:parallel adjust-multi-metric-join-aliases-in-aggregations
  (let [mp meta/metadata-provider
        source-query (-> (lib/query mp (meta/table-metadata :orders))
                         (lib/filter (lib/< (meta/field-metadata :orders :tax) 3000)))
        mp (-> mp
               (lib.tu/metadata-provider-with-card-from-query 1 (lib/aggregate source-query (lib/count)) {:type :metric})
               (lib.tu/metadata-provider-with-card-from-query 2 (lib/aggregate source-query (lib/avg (meta/field-metadata :orders :tax))) {:type :metric})
               (lib.tu/metadata-provider-with-card-from-query 3 (lib/aggregate source-query (lib/sum (meta/field-metadata :orders :tax))) {:type :metric}))]
    (mt/with-metadata-provider mp
      (let [products-table (meta/table-metadata :products)
            m1 (lib.metadata/card mp 1)
            m2 (lib.metadata/card mp 2)
            m3 (lib.metadata/card mp 3)
            q (as-> (lib/query mp products-table) $q
                (lib/join $q (lib/join-clause m1))
                (lib/join $q (lib/join-clause m2))
                (lib/join $q (lib/join-clause m3))
                (lib/aggregate $q (first (lib/available-metrics $q)))
                (lib/aggregate $q (second (lib/available-metrics $q)))
                (lib/aggregate $q (last (lib/available-metrics $q))))]
        (is (=? {:stages [{:aggregation [[:count {}]
                                         [:avg {} [:field {:join-alias (:name m2)} (meta/id :orders :tax)]]
                                         [:sum {} [:field {:join-alias (:name m3)} (meta/id :orders :tax)]]]}]}
               (adjust q)))))))

(deftest ^:parallel e2e-results-test
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


(deftest ^:parallel e2e-join-to-table-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                         (lib/filter (lib/< (lib.metadata/field mp (mt/id :orders :tax)) 3000))
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
                (lib/aggregate $q (first (lib/available-metrics $q)))
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

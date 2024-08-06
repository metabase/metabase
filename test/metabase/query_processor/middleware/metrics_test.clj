(ns metabase.query-processor.middleware.metrics-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mb.hawk.assert-exprs.approximately-equal :as =?]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.fetch-source-query :as fetch-source-query]
   [metabase.query-processor.middleware.metrics :as metrics]
   [metabase.test :as mt]
   [metabase.util :as u]))

(def ^:private counter (atom 2000))

(defn- add-aggregation-options
  [query options]
  (update-in query [:stages 0 :aggregation 0 1] merge options))

(defn- basic-metric-query []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
      (lib/aggregate (lib/avg (meta/field-metadata :products :rating)))))

(defn- fresh-card-id
  [metadata-provider]
  (loop []
    (let [id (swap! counter inc)]
      (if (seq (lib.metadata.protocols/metadatas metadata-provider :metadata/card #{id}))
        (recur)
        id))))

(defn- mock-metric
  ([]
   (mock-metric (basic-metric-query)))
  ([query]
   (mock-metric meta/metadata-provider query))
  ([metadata-provider query]
   (mock-metric metadata-provider query nil))
  ([metadata-provider query card-details]
   (let [metric (merge {:lib/type :metadata/card
                        :id (fresh-card-id metadata-provider)
                        :database-id (meta/id)
                        :name "Mock Metric"
                        :type :metric
                        :dataset-query query}
                       card-details)]
     [metric (lib/composed-metadata-provider
              metadata-provider
              (lib.tu/mock-metadata-provider
               {:cards [metric]}))])))

(def adjust
  (comp #'metrics/adjust #'fetch-source-query/resolve-source-cards))

(deftest ^:parallel no-metric-should-result-in-exact-same-query
  (let [query (lib/query meta/metadata-provider (meta/table-metadata :products))]
    (is (= query
           (adjust query)))))

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
                    {:aggregation [[:avg {} [:field {} (comp #{"rating"} u/lower-case-en)]]]}]}
          (adjust query)))))

(deftest ^:parallel adjust-aggregation-metric-ref-test
  (let [[source-metric mp] (mock-metric)
        query (-> (lib/query mp (meta/table-metadata :products))
                  (lib/aggregate (lib/+ (lib.options/ensure-uuid [:metric {} (:id source-metric)]) 1)))]
    (is (=?
          {:stages [{:source-table (meta/id :products)
                     :aggregation [[:+ {} [:avg {} [:field {} (meta/id :products :rating)]] 1]]}]}
          (adjust query)))))

(deftest ^:parallel metric-with-implicit-join-test
  (testing "Metrics with filters on implicitly joined columns should work #43943"
    (let [[source-metric mp] (mock-metric (as-> (lib/query meta/metadata-provider (meta/table-metadata :orders)) $q
                                            (lib/filter $q (lib/= (m/find-first (comp #{(meta/id :products :category)} :id) (lib/filterable-columns $q)) "Gadget"))
                                            (lib/aggregate $q (lib/count))))
          query (-> (lib/query mp (meta/table-metadata :orders))
                    (lib/aggregate (lib.options/ensure-uuid [:metric {} (:id source-metric)])))]
      (is (=?
            {:stages [{:source-table (meta/id :orders)
                       :joins [{:stages [{:source-table (meta/id :products)}]}]
                       :filters [[:= {} [:field {} (meta/id :products :category)] [:value {} "Gadget"]]]
                       :aggregation [[:count {}]]}]}
            (adjust query)))
      (testing "With an explicit product join in consumer query"
        (is (=?
              {:stages [{:source-table (meta/id :orders)
                         :joins [{:stages [{:source-table (meta/id :products)}]}
                                 {:stages [{:source-table (meta/id :products)}]}]
                         :filters [[:= {} [:field {} (meta/id :products :title)] "foobar"]
                                   [:= {} [:field {} (meta/id :products :category)] [:value {} "Gadget"]]]
                         :aggregation [[:count {}]]}]}
              (adjust (as-> (lib/query mp (meta/table-metadata :orders)) $q
                        (lib/join $q (meta/table-metadata :products))
                        (lib/filter $q (lib/= (m/find-first (comp #{(meta/id :products :title)} :id) (lib/filterable-columns $q))
                                              "foobar"))
                        (lib/aggregate $q (lib.options/ensure-uuid [:metric {} (:id source-metric)])))))))
      (testing "With an implicit product join in consumer query"
        (is (=?
              {:stages [{:source-table (meta/id :orders)
                         :joins [{:stages [{:source-table (meta/id :products)}]}]
                         :filters [[:= {} [:field {} (meta/id :products :title)] "foobar"]
                                   [:= {} [:field {} (meta/id :products :category)] [:value {} "Gadget"]]]
                         :aggregation [[:count {}]]}]}
              (adjust (as-> (lib/query mp (meta/table-metadata :orders)) $q
                        (lib/filter $q (lib/= (m/find-first (comp #{(meta/id :products :title)} :id) (lib/filterable-columns $q))
                                              "foobar"))
                        (lib/aggregate $q (lib.options/ensure-uuid [:metric {} (:id source-metric)]))))))))))

(deftest ^:parallel multiple-source-metrics-with-implicit-join-test
  (let [[first-metric mp] (mock-metric (as-> (lib/query meta/metadata-provider (meta/table-metadata :orders)) $q
                                         (lib/filter $q (lib/= (m/find-first (comp #{(meta/id :products :category)} :id)
                                                                             (lib/filterable-columns $q))
                                                               "Gadget"))
                                         (lib/aggregate $q (lib/count))))
        [second-metric mp] (mock-metric mp (as-> (lib/query mp (meta/table-metadata :orders)) $q
                                             (lib/filter $q (lib/= (m/find-first (comp #{(meta/id :products :title)} :id)
                                                                                 (lib/filterable-columns $q))
                                                                   "Title"))
                                             (lib/aggregate $q (lib/count))))
        query (-> (lib/query mp (meta/table-metadata :orders))
                  (lib/aggregate (lib.options/ensure-uuid [:metric {} (:id first-metric)]))
                  (lib/aggregate (lib.options/ensure-uuid [:metric {} (:id second-metric)])))]
    (is (=? {:stages [{:source-table (meta/id :orders)
                       :joins [{:stages [{:source-table (meta/id :products)}]}]
                       :filters [[:= {} [:field {} (meta/id :products :category)] [:value {} "Gadget"]]
                                 [:= {} [:field {} (meta/id :products :title)] [:value {} "Title"]]]
                       :aggregation [[:count {}]
                                     [:count {}]]}]}
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
                    {:aggregation [[:avg {} [:field {} (comp #{"rating"} u/lower-case-en)]]]
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
                     :aggregation [[:avg {} [:field {} (comp #{"rating"} u/lower-case-en)]]]}]}
          (adjust query)))))

(deftest ^:parallel adjust-expression-name-collision-test
  (let [[source-metric mp] (mock-metric (-> (basic-metric-query)
                                            (lib/expression "foobar" (lib/+ 1 1))
                                            (as-> $q
                                              (lib/expression $q "qux" (lib/+ (lib/expression-ref $q "foobar") 1))
                                              (lib/filter $q (lib/= (lib/expression-ref $q "qux") (lib/expression-ref $q "foobar"))))))
        query (-> (lib/query mp (meta/table-metadata :products))
                  (lib/expression "foobar" (lib/- 2 2))
                  (as-> $q
                    (lib/expression $q "qux" (lib/- (lib/expression-ref $q "foobar") 2))
                    (lib/filter $q (lib/= (lib/expression-ref $q "foobar") (lib/expression-ref $q "qux"))))
                  (lib/aggregate (lib.metadata/metric mp (:id source-metric))))]
    (is (=?
          {:stages [{:expressions [[:- {:lib/expression-name "foobar"} 2 2]
                                   [:- {:lib/expression-name "qux"} [:expression {} "foobar"] 2]
                                   [:+ {:lib/expression-name "foobar_2"} 1 1]
                                   [:+ {:lib/expression-name "qux_2"} [:expression {} "foobar_2"] 1]]
                     :filters [[:= {} [:expression {} "foobar"] [:expression {} "qux"]]
                               [:= {} [:expression {} "qux_2"] [:expression {} "foobar_2"]]]
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
    (is (=? {:stages [{:source-table (meta/id :products)}
                      {:filters [[:> {} [:field {} (meta/id :products :price)] 1]]
                       :aggregation complement}
                      {:filters [[:< {} [:field {} (meta/id :products :price)] 100]]
                       :aggregation complement}
                      {:filters [[:= {} [:field {} (meta/id :products :category)] "Widget"]]
                       :aggregation some?}]}
            (adjust query)))))

(deftest ^:parallel question-based-on-metric-based-on-metric-based-on-metric-test
  (let [[first-metric mp] (mock-metric)
        [second-metric mp] (mock-metric mp (lib/query mp first-metric))
        [third-metric mp] (mock-metric mp (lib/query mp second-metric))
        query (lib/query mp third-metric)]
    (is (=? {:stages [{:aggregation complement}
                      {:aggregation complement}
                      {:aggregation complement}
                      {:aggregation [[:avg {} [:field {} (comp #{"rating"} u/lower-case-en)]]]}]}
            (adjust query)))))

(deftest ^:parallel joined-question-based-on-metric-based-on-metric-based-on-metric-test
  (let [[first-metric mp] (mock-metric)
        [second-metric mp] (mock-metric mp (lib/query mp first-metric))
        [question mp] (mock-metric mp (lib/query mp second-metric) {:type :question})
        query (-> (lib/query mp (meta/table-metadata :products))
                  (lib/join (lib/join-clause question [(lib/= 1 1)])))]
    (is (=? {:stages [{:joins [{:stages [{:aggregation complement}
                                         {:aggregation complement}
                                         {:aggregation [[:avg {} [:field {} (comp #{"rating"} u/lower-case-en)]]]}
                                         ;; Empty stage added by resolved-source-cards to nest join
                                         #(= #{:lib/type :qp/stage-had-source-card :source-query/model?} (set (keys %)))]}]}]}
            (adjust query)))))

(defn- model-based-metric-question
  [mp model-query agg-col-fn]
  (let [model {:lib/type :metadata/card
               :id (fresh-card-id mp)
               :database-id (meta/id)
               :name "Mock Model"
               :type :model
               :dataset-query model-query}
        model-mp (lib/composed-metadata-provider
                  mp
                  (lib.tu/mock-metadata-provider
                   {:cards [model]}))
        metric-query (as-> (lib/query model-mp model) $q
                       (lib/aggregate $q (lib/avg (m/find-first agg-col-fn (-> (lib/visible-columns $q)
                                                                               #_(doto tap>))))))
        metric {:lib/type :metadata/card
                :id (fresh-card-id model-mp)
                :database-id (meta/id)
                :name "Mock Metric"
                :type :metric
                :dataset-query metric-query}
        metric-mp (lib/composed-metadata-provider
                   model-mp
                   (lib.tu/mock-metadata-provider
                    {:cards [metric]}))]
    (-> (lib/query metric-mp model)
        (lib/aggregate (lib.metadata/metric metric-mp (:id metric))))))

(deftest ^:parallel metric-question-on-custom-column-model-test
  (let [mp meta/metadata-provider
        query (as-> (lib/query mp (meta/table-metadata :orders)) $q
                (lib/expression $q "foobar" (lib/+ (meta/field-metadata :orders :discount) 1))
                (lib/with-fields $q (filter (comp #{"foobar"} :name) (lib/returned-columns $q))))
        question (model-based-metric-question mp query (comp #{"foobar"} :name))]
    (is (=? {:stages
               [{:source-table (meta/id :orders)
                 :expressions [[:+ {:lib/expression-name "foobar"} [:field {} (meta/id :orders :discount)] 1]]
                 :fields [[:expression {} "foobar"]]}
                {:lib/type :mbql.stage/mbql,
                 :aggregation [[:avg {:name "Mock Metric"} [:field {} "foobar"]]]}]}
              (adjust question)))))

(deftest ^:parallel metric-question-on-aggregate-column-model-test
  (let [mp meta/metadata-provider
        query (as-> (lib/query mp (meta/table-metadata :orders)) $q
                (lib/aggregate $q (lib/sum (meta/field-metadata :orders :discount))))
        question (model-based-metric-question mp query (comp #{"sum"} :name))]
    (is (=? {:stages
             [{:source-table (meta/id :orders)
               :aggregation [[:sum {} [:field {} (meta/id :orders :discount)]]]}
              {:lib/type :mbql.stage/mbql,
               :aggregation [[:avg {:name "Mock Metric"} [:field {} "sum"]]]}]}
            (adjust question)))))

(deftest ^:parallel metric-question-on-model-based-on-model-test
  (let [mp meta/metadata-provider
        model-query (-> (lib/query mp (meta/table-metadata :orders))
                        (lib/filter (lib/> (meta/field-metadata :orders :discount) 3)))
        model {:lib/type :metadata/card
               :id (fresh-card-id mp)
               :database-id (meta/id)
               :name "Base Mock Model"
               :type :model
               :dataset-query model-query}
        model-mp (lib/composed-metadata-provider
                  mp
                  (lib.tu/mock-metadata-provider
                   {:cards [model]}))
        question (model-based-metric-question model-mp
                                              (lib/query model-mp (lib.metadata/card model-mp (:id model)))
                                              (comp #{"QUANTITY"} :name))]
    (testing (str (dissoc question :lib/metadata))
      (is (=? {:stages
               [{:source-table (meta/id :orders)
                 :filters [[:> {} [:field {} (meta/id :orders :discount)] 3]]}
                {}
                {:aggregation [[:avg {:name "Mock Metric"} [:field {} "QUANTITY"]]]}]}
              (adjust question))))))

(deftest ^:parallel metric-question-on-multi-stage-model-test
  (let [mp meta/metadata-provider
        sum-pred (comp #{"sum"} :name)
        query (as-> (lib/query mp (meta/table-metadata :orders)) $q
                (lib/aggregate $q (lib/sum (meta/field-metadata :orders :discount)))
                (lib/append-stage $q)
                (lib/filter $q (lib/> (m/find-first sum-pred (lib/visible-columns $q)) 2)))
        question (model-based-metric-question mp query sum-pred)]
    (is (=? {:stages
             [{:source-table (meta/id :orders)
               :aggregation [[:sum {} [:field {} (meta/id :orders :discount)]]]}
              {:filters [[:> {} [:field {} "sum"] 2]]}
              {:aggregation [[:avg {:name "Mock Metric"} [:field {} "sum"]]]}]}
            (adjust question)))))

(deftest ^:parallel metric-question-on-native-model-test
  (let [mp meta/metadata-provider
        sum-pred (comp #{"sum"} :name)
        query lib.tu/native-query
        question (model-based-metric-question mp query sum-pred)]
    (is (=? {:stages
             [{:lib/type :mbql.stage/native,
               :native "SELECT whatever"}
              {:aggregation [[:avg {:name "Mock Metric"} [:field {} "sum"]]]}]}
            (adjust question)))))

(deftest ^:parallel maintain-aggregation-refs-test
  (testing "the aggregation that replaces a :metric ref should keep the :metric's :lib/uuid, so :aggregation refs pointing to it are still valid"
    (let [[source-metric mp] (mock-metric)
          query (-> (lib/query mp (meta/table-metadata :products))
                    (lib/aggregate (lib.metadata/metric mp (:id source-metric)))
                    (as-> $q (lib/order-by $q (lib/aggregation-ref $q 0))))]
      (is (=? {:stages [{:aggregation [[:avg {:lib/uuid (=?/same :uuid)} some?]]
                         :order-by [[:asc {} [:aggregation {} (=?/same :uuid)]]]}]}
              (adjust query))))
    (let [[source-metric mp] (mock-metric)
          query (-> (lib/query mp source-metric)
                    (as-> $q (lib/order-by $q (lib/aggregation-ref $q 0))))]
      (is (=? {:stages [{}
                        {:aggregation [[:avg {:lib/uuid (=?/same :uuid)} some?]]
                         :order-by [[:asc {} [:aggregation {} (=?/same :uuid)]]]}]}
              (adjust query))))))

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

(deftest ^:parallel execute-multi-stage-metric
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        stage-one (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                      (lib/breakout (lib/with-temporal-bucket
                                      (lib.metadata/field mp (mt/id :orders :created_at))
                                      :month))
                      (lib/aggregate (lib/count))
                      (lib/append-stage))
        stage-one-cols (lib/visible-columns stage-one)
        source-query (-> stage-one
                         (lib/breakout (m/find-first (comp #{"Created At: Month"} :display-name) stage-one-cols))
                         (lib/aggregate (lib/avg (m/find-first (comp #{"Count"} :display-name) stage-one-cols))))]
    (mt/with-temp [:model/Card source-metric {:dataset_query (lib.convert/->legacy-MBQL source-query)
                                              :database_id (mt/id)
                                              :name "new_metric"
                                              :type :metric}]
      (let [query (lib/query mp (lib.metadata/card mp (:id source-metric)))]
        (is (=? (mt/rows (qp/process-query source-query))
                (mt/rows (qp/process-query query))))))))

(deftest ^:parallel execute-single-stage-metric
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                         (lib/aggregate (lib/count)))]
    (mt/with-temp [:model/Card source-metric {:dataset_query (lib.convert/->legacy-MBQL source-query)
                                              :database_id (mt/id)
                                              :name "new_metric"
                                              :type :metric}
                   :model/Card next-metric {:dataset_query (-> (lib/query mp (lib.metadata/card mp (:id source-metric)))
                                                               (lib/filter (lib/= (lib.metadata/field mp (mt/id :products :category)) "Gadget")))
                                            :database_id (mt/id)
                                            :name "new_metric"
                                            :type :metric}]
      (let [query (lib/query mp (lib.metadata/card mp (:id next-metric)))]
        (is (=? (mt/rows (qp/process-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                               (lib/filter (lib/= (lib.metadata/field mp (mt/id :products :category)) "Gadget"))
                                               (lib/aggregate (lib/count)))))
                (mt/rows (qp/process-query query))))))))

(deftest ^:parallel available-metrics-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                         (lib/aggregate (lib/count)))]
    (mt/with-temp [:model/Card source-metric {:dataset_query (lib.convert/->legacy-MBQL source-query)
                                              :database_id (mt/id)
                                              :table_id (mt/id :products)
                                              :name "new_metric"
                                              :type :metric}
                   ;; Two stage queries should not be available
                   :model/Card _             {:dataset_query (-> source-query
                                                                 lib/append-stage
                                                                 (lib/aggregate (lib/count))
                                                                 lib.convert/->legacy-MBQL)
                                              :database_id (mt/id)
                                              :table_id (mt/id :products)
                                              :name "new_metric"
                                              :type :metric}]
      (let [query (lib/query mp (lib.metadata/table mp (mt/id :products)))]
        (is (=? [(lib.metadata/metric mp (:id source-metric))]
                (lib/available-metrics query)))))))

(deftest ^:parallel custom-aggregation-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        source-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                         (lib/expression "total2" (lib// (lib.metadata/field mp (mt/id :orders :total)) 2))
                         (as-> $q (lib/aggregate $q (lib/sum (m/find-first (comp #{"total2"} :name) (lib/visible-columns $q))))))]
    (mt/with-temp [:model/Card source-metric {:dataset_query (lib.convert/->legacy-MBQL source-query)
                                              :database_id (mt/id)
                                              :name "new_metric"
                                              :type :metric}]
      (let [query (lib/query mp (lib.metadata/card mp (:id source-metric)))]
        (is (=? (mt/rows (qp/process-query source-query))
                (mt/rows (qp/process-query query))))))))

(deftest ^:parallel default-metric-names-test
  (let [[source-metric mp] (mock-metric)]
    (is (=?
          {:stages [{:aggregation [[:avg {:display-name complement :name "Mock Metric"} some?]]}]}
          (adjust (-> (lib/query mp (meta/table-metadata :products))
                      (lib/aggregate (lib.metadata/metric mp (:id source-metric)))))))))

(deftest ^:parallel include-source-names-test
  (let [[source-metric mp] (mock-metric (-> (basic-metric-query)
                                            (add-aggregation-options {:display-name "My cool metric" :name "Named Metric"})))]
    (is (=?
          {:stages [{:aggregation [[:avg {:display-name "My cool metric" :name "Named Metric"} some?]]}]}
          (adjust (-> (lib/query mp (meta/table-metadata :products))
                      (lib/aggregate (lib.metadata/metric mp (:id source-metric)))))))))

(deftest ^:parallel override-source-names-test
  (let [[source-metric mp] (mock-metric (-> (basic-metric-query)
                                            (add-aggregation-options {:display-name "My cool metric" :name "Named Metric"})))]
    (is (=?
          {:stages [{:aggregation [[:avg {:display-name "My cooler metric" :name "Better Named Metric"} some?]]}]}
          (adjust (-> (lib/query mp (meta/table-metadata :products))
                      (lib/aggregate (lib.metadata/metric mp (:id source-metric)))
                      (add-aggregation-options {:display-name "My cooler metric" :name "Better Named Metric"})))))))

(deftest ^:parallel metric-with-nested-segments-test
  (let [mp (lib.tu/mock-metadata-provider
             meta/metadata-provider
             {:segments [{:id         1
                          :name       "Segment 1"
                          :table-id   (meta/id :venues)
                          :definition {:filter [:= [:field (meta/id :venues :name) nil] "abc"]}}]})
        [source-metric mp] (mock-metric mp (-> (basic-metric-query)
                                               (lib/filter (lib.metadata/segment mp 1))))]
    ;; Segments are handled further in the pipeline when the source is a metric
    (is (=?
          {:stages [{:filters [[:segment {} 1]]}
                    {}]}
          (adjust (lib/query mp source-metric))))
    ;; Segments will be expanded in this case as the metric query that is spliced in needs to be processed
    (is (=?
          {:stages [{:filters [[:= {} [:field {} (meta/id :venues :name)] some?]]}]}
          (adjust
            (-> (lib/query mp (meta/table-metadata :products))
                (lib/aggregate (lib.metadata/metric mp (:id source-metric)))))))))

(deftest ^:parallel expand-macros-in-nested-queries-test
  (testing "expand-macros should expand things in the correct nested level (#12507)"
    (let [[source-metric mp] (mock-metric (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                                              (lib/filter (lib/= (meta/field-metadata :venues :name) "abc"))
                                              (lib/aggregate (lib/sum (meta/field-metadata :venues :price)))
                                              (add-aggregation-options {:display-name "My Cool Aggregation"})))
          before {:source-table (meta/id :venues)
                  :aggregation  [[:metric (:id source-metric)]]}
          after {:source-table (meta/id :venues)
                 :aggregation  [[:aggregation-options [:sum [:field (meta/id :venues :price) {}]]
                                 {:display-name "My Cool Aggregation"}]]
                 :filter       [:= [:field (meta/id :venues :name) {}] [:value "abc" {}]]}
          expand-macros (fn [mbql-query]
                          (lib.convert/->legacy-MBQL (adjust (lib/query mp (lib.convert/->pMBQL mbql-query)))))]
      (comment
        (testing "nested 1 level"
          (is (=? (lib.tu.macros/mbql-query nil
                    {:source-query after})
                  (expand-macros (lib.tu.macros/mbql-query nil
                                   {:source-query before})))))
        (testing "nested 2 levels"
          (is (=? (lib.tu.macros/mbql-query nil
                    {:source-query {:source-query after}})
                  (expand-macros
                    (lib.tu.macros/mbql-query nil
                      {:source-query {:source-query before}})))))
        (testing "nested 3 levels"
          (is (=? (lib.tu.macros/mbql-query nil
                    {:source-query {:source-query {:source-query after}}})
                  (expand-macros
                    (lib.tu.macros/mbql-query nil
                      {:source-query {:source-query {:source-query before}}}))))))
      (testing "inside :source-query inside :joins"
        (is (=? (lib.tu.macros/mbql-query checkins
                  {:joins [{:condition    [:= [:field (meta/id :checkins :id) nil] 2]
                            :source-query after}]})
                (expand-macros
                  (lib.tu.macros/mbql-query checkins
                    {:joins [{:condition    [:= [:field (meta/id :checkins :id) nil] 2]
                              :source-query before}]})))))

      (testing "inside :joins inside :source-query"
        (is (=? (lib.tu.macros/mbql-query nil
                  {:source-query {:source-table (meta/id :checkins)
                                  :joins        [{:condition    [:= [:field 1 nil] 2]
                                                  :source-query after}]}})
                (expand-macros (lib.tu.macros/mbql-query nil
                                 {:source-query {:source-table (meta/id :checkins)
                                                 :joins        [{:condition    [:= [:field 1 nil] 2]
                                                                 :source-query before}]}}))))))))

(deftest ^:parallel model-based-metric-use-test
  (let [model {:lib/type :metadata/card
               :id (fresh-card-id meta/metadata-provider)
               :database-id (meta/id)
               :name "Mock Model"
               :type :model
               :dataset-query (-> meta/metadata-provider
                                  (lib/query (meta/table-metadata :products))
                                  (lib/filter (lib/> (meta/field-metadata :products :rating) 2)))}
        model-mp (lib/composed-metadata-provider
                  meta/metadata-provider
                  (lib.tu/mock-metadata-provider
                   {:cards [model]}))
        rating-col (m/find-first (comp #{"RATING"} :name) (lib/returned-columns (lib/query model-mp model)))
        metric1 {:lib/type :metadata/card
                 :id (fresh-card-id model-mp)
                 :database-id (meta/id)
                 :name "Mock Metric 1"
                 :type :metric
                 :dataset-query (-> model-mp
                                    (lib/query model)
                                    (lib/filter (lib/< rating-col 5))
                                    (lib/aggregate (lib/avg rating-col)))}
        metric2 {:lib/type :metadata/card
                 :id (fresh-card-id model-mp)
                 :database-id (meta/id)
                 :name "Mock Metric 2"
                 :type :metric
                 :dataset-query (-> model-mp
                                    (lib/query model)
                                    (lib/filter (lib/> rating-col 3))
                                    (lib/aggregate (lib/count)))}
        mp (lib/composed-metadata-provider
            model-mp
            (lib.tu/mock-metadata-provider
             {:cards [metric1 metric2]}))
        query (-> (lib/query mp model)
                  (lib/aggregate (lib.metadata/metric mp (:id metric1)))
                  (lib/aggregate (lib.metadata/metric mp (:id metric2))))]
    (testing "model based metrics can be used in question based on that model"
      (is (=? {:stages [{:source-table (meta/id :products)
                         :filters [[:> {} [:field {} (meta/id :products :rating)] 2]]}
                        {:aggregation [[:avg {:name "Mock Metric 1"} [:field {} "RATING"]]
                                       [:count {:name "Mock Metric 2"}]]
                         :filters [[:< {} [:field {} "RATING"] [:value {} 5]]
                                   [:> {} [:field {} "RATING"] [:value {} 3]]]}]}
              (adjust query))))))

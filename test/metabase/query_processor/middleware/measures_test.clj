(ns metabase.query-processor.middleware.measures-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mb.hawk.assert-exprs.approximately-equal :as =?]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.measures :as measures]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Test Helpers                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- mock-measure
  "Create a mock measure with the given ID and definition query.
   Returns [measure metadata-provider]."
  ([id definition-query]
   (mock-measure meta/metadata-provider id definition-query))
  ([metadata-provider id definition-query]
   (mock-measure metadata-provider id definition-query nil))
  ([metadata-provider id definition-query measure-details]
   (let [measure (merge {:lib/type    :metadata/measure
                         :id          id
                         :name        (str "Mock Measure " id)
                         :table-id    (meta/id :products)
                         :description "A test measure"
                         :archived    false
                         :definition  definition-query}
                        measure-details)]
     [measure (lib.tu/mock-metadata-provider
               metadata-provider
               {:measures [measure]})])))

(defn- basic-sum-measure-query
  "Create a basic measure definition query with a sum aggregation on products.price."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
      (lib/aggregate (lib/sum (meta/field-metadata :products :price)))))

(defn- basic-count-measure-query
  "Create a measure definition query with a count aggregation."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
      (lib/aggregate (lib/count))))

(defn- adjust
  "Run the measures middleware on a query."
  [query]
  (#'measures/adjust query))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Basic Tests                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest ^:parallel no-measure-should-result-in-exact-same-query-test
  (testing "Query without measures passes through unchanged"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                    (lib/aggregate (lib/sum (meta/field-metadata :products :price))))]
      (is (= query (adjust query))))))

(deftest ^:parallel basic-measure-expansion-test
  (testing "Single measure reference is replaced with its aggregation"
    (let [[_measure mp] (mock-measure 1 (basic-sum-measure-query))
          query (-> (lib/query mp (meta/table-metadata :products))
                    (lib/aggregate (lib.metadata/measure mp 1)))]
      (is (=? {:stages [{:source-table (meta/id :products)
                         :aggregation  [[:sum {} [:field {} (meta/id :products :price)]]]}]}
              (adjust query))))))

(deftest ^:parallel measure-with-display-name-override-test
  (testing "display-name from measure clause options is preserved"
    (let [[_measure mp] (mock-measure 1 (basic-sum-measure-query))
          measure-meta (lib.metadata/measure mp 1)
          query (-> (lib/query mp (meta/table-metadata :products))
                    (lib/aggregate (lib/with-expression-name (lib/ref measure-meta) "My Custom Name")))]
      (is (=? {:stages [{:aggregation [[:sum {:display-name "My Custom Name"} some?]]}]}
              (adjust query))))))

(deftest ^:parallel multiple-measures-in-query-test
  (testing "Multiple measures in a query all expand"
    (let [[_measure1 mp] (mock-measure 1 (basic-sum-measure-query))
          [_measure2 mp] (mock-measure mp 2 (basic-count-measure-query))
          query (-> (lib/query mp (meta/table-metadata :products))
                    (lib/aggregate (lib.metadata/measure mp 1))
                    (lib/aggregate (lib.metadata/measure mp 2)))]
      (is (=? {:stages [{:source-table (meta/id :products)
                         :aggregation  [[:sum {} [:field {} (meta/id :products :price)]]
                                        [:count {}]]}]}
              (adjust query))))))

(deftest ^:parallel non-existent-measure-error-test
  (testing "Proper error when measure doesn't exist"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                    (lib/aggregate [:measure {:lib/uuid (str (random-uuid))} 9999]))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #":metadata/measure 9999" (adjust query))))))

(deftest ^:parallel measure-with-no-aggregation-error-test
  (testing "Error when measure definition has no aggregation"
    (let [empty-definition (lib/query meta/metadata-provider (meta/table-metadata :products))
          [_measure mp] (mock-measure 1 empty-definition)
          query (-> (lib/query mp (meta/table-metadata :products))
                    (lib/aggregate (lib.metadata/measure mp 1)))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Measure 1 has no aggregation" (adjust query))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Nested Measure Tests                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest ^:parallel nested-measure-expansion-test
  (testing "Measure A references Measure B, both expand correctly"
    (let [;; Measure 2 is a simple count
          [_measure2 mp] (mock-measure 2 (basic-count-measure-query))
          ;; Measure 1 references Measure 2 in an arithmetic expression: measure2 + 1
          measure1-definition (-> (lib/query mp (meta/table-metadata :products))
                                  (lib/aggregate (lib/+ (lib.metadata/measure mp 2) 1)))
          [_measure1 mp] (mock-measure mp 1 measure1-definition)
          query (-> (lib/query mp (meta/table-metadata :products))
                    (lib/aggregate (lib.metadata/measure mp 1)))]
      (is (=? {:stages [{:source-table (meta/id :products)
                         :aggregation  [[:+ {} [:count {}] 1]]}]}
              (adjust query))))))

(deftest ^:parallel three-level-nested-measures-test
  (testing "A → B → C chain expands correctly"
    (let [;; Measure 3 is a simple sum
          [_measure3 mp] (mock-measure 3 (basic-sum-measure-query))
          ;; Measure 2 references Measure 3: measure3 * 2
          measure2-definition (-> (lib/query mp (meta/table-metadata :products))
                                  (lib/aggregate (lib/* (lib.metadata/measure mp 3) 2)))
          [_measure2 mp] (mock-measure mp 2 measure2-definition)
          ;; Measure 1 references Measure 2: measure2 + 10
          measure1-definition (-> (lib/query mp (meta/table-metadata :products))
                                  (lib/aggregate (lib/+ (lib.metadata/measure mp 2) 10)))
          [_measure1 mp] (mock-measure mp 1 measure1-definition)
          query (-> (lib/query mp (meta/table-metadata :products))
                    (lib/aggregate (lib.metadata/measure mp 1)))]
      ;; Should expand to: (sum(price) * 2) + 10
      (is (=? {:stages [{:source-table (meta/id :products)
                         :aggregation  [[:+ {}
                                         [:* {} [:sum {} [:field {} (meta/id :products :price)]] 2]
                                         10]]}]}
              (adjust query))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Cycle Detection Tests                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- measure-ref
  "Create a measure reference clause for use in definitions."
  [id]
  [:measure {:lib/uuid (str (random-uuid))} id])

(deftest ^:parallel measure-direct-cycle-detection-test
  (testing "Direct cycle (A → A) is detected and reported"
    (let [;; Measure 1 references itself - we need to construct this carefully
          ;; First create a placeholder measure, then update it with a self-reference
          mp (lib.tu/mock-metadata-provider
              meta/metadata-provider
              {:measures [{:lib/type    :metadata/measure
                           :id          1
                           :name        "Self-referencing Measure"
                           :table-id    (meta/id :products)
                           :definition  (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                                            (lib/aggregate (lib/+ (measure-ref 1) 1)))}]})
          query (-> (lib/query mp (meta/table-metadata :products))
                    (lib/aggregate (lib.metadata/measure mp 1)))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Measure cycle detected" (adjust query))))))

(deftest ^:parallel measure-mutual-recursion-cycle-test
  (testing "Indirect cycle (A → B → A) is detected and reported"
    (let [;; Create both measures with mutual references
          ;; Measure 1 references Measure 2
          ;; Measure 2 references Measure 1
          mp (lib.tu/mock-metadata-provider
              meta/metadata-provider
              {:measures [{:lib/type    :metadata/measure
                           :id          1
                           :name        "Measure 1"
                           :table-id    (meta/id :products)
                           :definition  (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                                            (lib/aggregate (lib/+ (measure-ref 2) 1)))}
                          {:lib/type    :metadata/measure
                           :id          2
                           :name        "Measure 2"
                           :table-id    (meta/id :products)
                           :definition  (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                                            (lib/aggregate (lib/* (measure-ref 1) 2)))}]})
          query (-> (lib/query mp (meta/table-metadata :products))
                    (lib/aggregate (lib.metadata/measure mp 1)))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Measure cycle detected" (adjust query))))))

(deftest ^:parallel measure-longer-cycle-detection-test
  (testing "Longer cycle (A → B → C → A) is detected"
    (let [;; Create three measures forming a cycle
          mp (lib.tu/mock-metadata-provider
              meta/metadata-provider
              {:measures [{:lib/type    :metadata/measure
                           :id          1
                           :name        "Measure 1"
                           :table-id    (meta/id :products)
                           :definition  (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                                            (lib/aggregate (lib/+ (measure-ref 2) 1)))}
                          {:lib/type    :metadata/measure
                           :id          2
                           :name        "Measure 2"
                           :table-id    (meta/id :products)
                           :definition  (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                                            (lib/aggregate (lib/* (measure-ref 3) 2)))}
                          {:lib/type    :metadata/measure
                           :id          3
                           :name        "Measure 3"
                           :table-id    (meta/id :products)
                           :definition  (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                                            (lib/aggregate (lib/- (measure-ref 1) 5)))}]})
          query (-> (lib/query mp (meta/table-metadata :products))
                    (lib/aggregate (lib.metadata/measure mp 1)))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Measure cycle detected" (adjust query))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              E2E Tests                                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest ^:parallel e2e-measure-results-test
  (testing "Execute query with measure through full QP, verify results match equivalent direct aggregation"
    (let [mp (mt/metadata-provider)
          ;; Create a measure that sums the price field
          measure-definition (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                 (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :products :price)))))
          mp (lib.tu/mock-metadata-provider
              mp
              {:measures [{:id         1
                           :name       "Total Price"
                           :table-id   (mt/id :products)
                           :definition measure-definition}]})
          ;; Query using the measure
          measure-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                            (lib/aggregate (lib.metadata/measure mp 1)))
          ;; Equivalent direct query
          direct-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                           (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :products :price)))))]
      (is (= (mt/rows (qp/process-query direct-query))
             (mt/rows (qp/process-query measure-query)))))))

(deftest ^:parallel e2e-nested-measure-results-test
  (testing "Execute query with nested measures, verify results"
    (let [mp (mt/metadata-provider)
          ;; Measure 2: count of products
          measure2-definition (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                  (lib/aggregate (lib/count)))
          mp (lib.tu/mock-metadata-provider
              mp
              {:measures [{:id         2
                           :name       "Product Count"
                           :table-id   (mt/id :products)
                           :definition measure2-definition}]})
          ;; Measure 1: references measure 2 with arithmetic (count * 10)
          measure1-definition (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                  (lib/aggregate (lib/* (lib.metadata/measure mp 2) 10)))
          mp (lib.tu/mock-metadata-provider
              mp
              {:measures [{:id         1
                           :name       "Product Count x10"
                           :table-id   (mt/id :products)
                           :definition measure1-definition}]})
          ;; Query using measure 1
          measure-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                            (lib/aggregate (lib.metadata/measure mp 1)))
          ;; Equivalent direct query: count * 10
          direct-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                           (lib/aggregate (lib/* (lib/count) 10)))]
      (is (= (mt/rows (qp/process-query direct-query))
             (mt/rows (qp/process-query measure-query)))))))

(deftest ^:parallel e2e-measure-with-breakout-test
  (testing "Measure works correctly with breakout"
    (let [mp (mt/metadata-provider)
          measure-definition (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                 (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :products :price)))))
          mp (lib.tu/mock-metadata-provider
              mp
              {:measures [{:id         1
                           :name       "Total Price"
                           :table-id   (mt/id :products)
                           :definition measure-definition}]})
          measure-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                            (lib/aggregate (lib.metadata/measure mp 1))
                            (lib/breakout (lib.metadata/field mp (mt/id :products :category))))
          direct-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                           (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :products :price))))
                           (lib/breakout (lib.metadata/field mp (mt/id :products :category))))]
      (is (= (mt/rows (qp/process-query direct-query))
             (mt/rows (qp/process-query measure-query)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    Measures with Segment References                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest ^:parallel e2e-measure-with-segment-test
  (testing "Measure with segment reference works through full QP pipeline"
    (let [mp (mt/metadata-provider)
          ;; Create a segment for venues with price < 4
          mp (lib.tu/mock-metadata-provider
              mp
              {:segments [{:id         1
                           :name       "Affordable Venues"
                           :table-id   (mt/id :venues)
                           :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                           (lib/filter (lib/< (lib.metadata/field mp (mt/id :venues :price)) 4)))}]})
          ;; Create a measure that counts venues matching the segment
          measure-definition (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                 (lib/aggregate (lib/count-where (lib.metadata/segment mp 1))))
          mp (lib.tu/mock-metadata-provider
              mp
              {:measures [{:id         1
                           :name       "Affordable Venue Count"
                           :table-id   (mt/id :venues)
                           :definition measure-definition}]})
          ;; Query using the measure
          measure-query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                            (lib/aggregate (lib.metadata/measure mp 1)))
          ;; Equivalent direct query
          direct-query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                           (lib/aggregate (lib/count-where (lib/< (lib.metadata/field mp (mt/id :venues :price)) 4))))]
      (is (= (mt/rows (qp/process-query direct-query))
             (mt/rows (qp/process-query measure-query)))))))

(deftest ^:parallel e2e-measure-multi-stage-query-test
  (testing "Measure works correctly when referenced in a subsequent stage (field ref should use operator name, not display name)"
    (let [mp (mt/metadata-provider)
          ;; Create a measure "Total Price" that sums products.price
          ;; The measure's name is "Total Price" but the operator name should be "sum"
          measure-definition (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                 (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :products :price)))))
          mp (lib.tu/mock-metadata-provider
              mp
              {:measures [{:id         1
                           :name       "Total Price"
                           :table-id   (mt/id :products)
                           :definition measure-definition}]})
          ;; Create a multi-stage query:
          ;; Stage 0: Group by category, aggregate with measure
          ;; Stage 1: Filter on the aggregation result
          measure-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                            (lib/breakout (lib.metadata/field mp (mt/id :products :category)))
                            (lib/aggregate (lib.metadata/measure mp 1))
                            (lib/append-stage))
          ;; Find the sum column (from the aggregation) in the second stage
          ;; The column should have :name "sum" not "Total Price"
          measure-cols (lib/filterable-columns measure-query)
          measure-col (first (filter #(= (:name %) "sum") measure-cols))
          measure-query (lib/filter measure-query (lib/> measure-col 100))
          ;; Equivalent direct query
          direct-query (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                           (lib/breakout (lib.metadata/field mp (mt/id :products :category)))
                           (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :products :price))))
                           (lib/append-stage))
          direct-cols (lib/filterable-columns direct-query)
          direct-col (first (filter #(= (:name %) "sum") direct-cols))
          direct-query (lib/filter direct-query (lib/> direct-col 100))]
      (is (= (mt/rows (qp/process-query direct-query))
             (mt/rows (qp/process-query measure-query)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    Measures with Metric References (disallowed)                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private test-metric-card
  "A metric card for testing metric references in measures."
  {:lib/type      :metadata/card
   :id            100
   :type          :metric
   :name          "Test Metric"
   :database-id   (meta/id)
   :table-id      (meta/id :products)
   :dataset-query (basic-count-measure-query)})

(defn- mp-with-metric
  "Create a metadata provider that includes the test metric."
  []
  (lib.tu/mock-metadata-provider
   meta/metadata-provider
   {:cards [test-metric-card]}))

(deftest ^:parallel measure-with-metric-reference-error-test
  (testing "Measure containing a metric reference fails with descriptive error at query time"
    (let [metric-mp (mp-with-metric)
          mp (lib.tu/mock-metadata-provider
              metric-mp
              {:measures [{:lib/type   :metadata/measure
                           :id         1
                           :name       "Bad Measure"
                           :table-id   (meta/id :products)
                           :definition (-> (lib/query metric-mp (meta/table-metadata :products))
                                           (lib/aggregate (lib.metadata/metric metric-mp 100)))}]})
          query (-> (lib/query mp (meta/table-metadata :products))
                    (lib/aggregate (lib.metadata/measure mp 1)))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"[Mm]easures cannot reference metrics"
           (adjust query))))))

(deftest ^:parallel measure-with-nested-metric-in-expression-error-test
  (testing "Measure with metric nested in arithmetic expression fails"
    (let [metric-mp (mp-with-metric)
          mp (lib.tu/mock-metadata-provider
              metric-mp
              {:measures [{:lib/type   :metadata/measure
                           :id         1
                           :name       "Bad Measure"
                           :table-id   (meta/id :products)
                           ;; Metric nested in: (metric + count) * 2
                           :definition (-> (lib/query metric-mp (meta/table-metadata :products))
                                           (lib/aggregate
                                            (lib/* (lib/+ (lib.metadata/metric metric-mp 100)
                                                          (lib/count))
                                                   2)))}]})
          query (-> (lib/query mp (meta/table-metadata :products))
                    (lib/aggregate (lib.metadata/measure mp 1)))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"[Mm]easures cannot reference metrics"
           (adjust query))))))

(deftest ^:parallel maintain-aggregation-refs-test
  (testing "the aggregation that replaces a :measure ref should keep the :measure's :lib/uuid, so :aggregation refs pointing to it are still valid"
    (let [mp          (mt/metadata-provider)
          definition  (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                          (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :venues :price)))))
          mp          (lib.tu/mock-metadata-provider
                       mp
                       {:measures [{:id         1
                                    :name       "Total Revenue"
                                    :table-id   (mt/id :venues)
                                    :definition definition}]})
          measure     (lib.metadata/measure mp 1)
          query       (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                          (lib/aggregate measure)
                          (as-> <> (lib/order-by <> (lib/aggregation-ref <> 0))))]
      (is (=? {:stages [{:aggregation [[:sum {:lib/uuid (=?/same :uuid)} [:field {} (mt/id :venues :price)]]]
                         :order-by    [[:asc {} [:aggregation {} (=?/same :uuid)]]]}]}
              (qp.preprocess/preprocess query))))))

(deftest max-expansion-depth-test
  (testing "Expansion fails when it exceeds max-expansion-depth"
    (let [mp (lib.tu/mock-metadata-provider
              meta/metadata-provider
              {:measures [{:lib/type   :metadata/measure
                           :id         4
                           :name       "Measure 4"
                           :table-id   (meta/id :products)
                           :definition (basic-sum-measure-query)}
                          {:lib/type   :metadata/measure
                           :id         3
                           :name       "Measure 3"
                           :table-id   (meta/id :products)
                           :definition (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                                           (lib/aggregate (lib/+ (measure-ref 4) 1)))}
                          {:lib/type   :metadata/measure
                           :id         2
                           :name       "Measure 2"
                           :table-id   (meta/id :products)
                           :definition (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                                           (lib/aggregate (lib/+ (measure-ref 3) 1)))}
                          {:lib/type   :metadata/measure
                           :id         1
                           :name       "Measure 1"
                           :table-id   (meta/id :products)
                           :definition (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                                           (lib/aggregate (lib/+ (measure-ref 2) 1)))}]})
          query (-> (lib/query mp (meta/table-metadata :products))
                    (lib/aggregate (lib.metadata/measure mp 1)))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"exceeded maximum depth"
           (with-redefs [measures/max-expansion-depth 3]
             (adjust query)))))))

(deftest ^:parallel nested-measure-with-metric-reference-error-test
  (testing "Nested measure containing metric reference fails (A → B where B uses metric)"
    (let [metric-mp (mp-with-metric)
          ;; First create inner measure that references the metric
          inner-mp (lib.tu/mock-metadata-provider
                    metric-mp
                    {:measures [{:lib/type   :metadata/measure
                                 :id         2
                                 :name       "Inner Measure with Metric"
                                 :table-id   (meta/id :products)
                                 :definition (-> (lib/query metric-mp (meta/table-metadata :products))
                                                 (lib/aggregate (lib.metadata/metric metric-mp 100)))}]})
          ;; Then create outer measure that references the inner measure
          mp (lib.tu/mock-metadata-provider
              inner-mp
              {:measures [{:lib/type   :metadata/measure
                           :id         1
                           :name       "Outer Measure"
                           :table-id   (meta/id :products)
                           :definition (-> (lib/query inner-mp (meta/table-metadata :products))
                                           (lib/aggregate (lib/+ (lib.metadata/measure inner-mp 2) 1)))}]})
          query (-> (lib/query mp (meta/table-metadata :products))
                    (lib/aggregate (lib.metadata/measure mp 1)))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"[Mm]easures cannot reference metrics"
           (adjust query))))))

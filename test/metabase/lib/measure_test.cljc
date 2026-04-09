(ns metabase.lib.measure-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.measure :as lib.measure]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn- measure-definition-with-aggregation
  "Create an MBQL5 measure definition with the given aggregation clause and metadata provider."
  [mp aggregation-clause]
  (-> (lib/query mp (meta/table-metadata :venues))
      (lib/aggregate aggregation-clause)))

(defn- measure-definition-referencing
  "Create a measure definition that references another measure by ID."
  [mp referenced-measure-id]
  (measure-definition-with-aggregation mp [:measure {:lib/uuid (str (random-uuid))} referenced-measure-id]))

(deftest ^:parallel check-measure-overwrite-no-refs-test
  (testing "Measure with no measure references - should pass"
    (let [mp         (lib.tu/mock-metadata-provider meta/metadata-provider {})
          definition (measure-definition-with-aggregation mp (lib/count))]
      (is (nil? (lib/check-measure-overwrite 1 definition))))))

(deftest ^:parallel check-measure-overwrite-valid-ref-test
  (testing "Measure referencing another measure (no cycle) - should pass"
    (let [;; Measure 2 has no measure references - use base provider for its definition
          measure-2-def (measure-definition-with-aggregation
                         meta/metadata-provider
                         (lib/count))
          mp            (lib.tu/mock-metadata-provider
                         meta/metadata-provider
                         {:measures [{:id         2
                                      :name       "Measure 2"
                                      :table-id   (meta/id :venues)
                                      :definition measure-2-def}]})
          ;; Measure 1 references Measure 2 - use mp so it can find measure 2
          measure-1-def (measure-definition-referencing mp 2)]
      (is (nil? (lib/check-measure-overwrite 1 measure-1-def))))))

(deftest ^:parallel check-measure-overwrite-self-reference-not-in-mp-test
  (testing "Measure referencing itself - should throw cycle (even if measure is not in mp)"
    (let [mp            meta/metadata-provider
          measure-1-def (measure-definition-referencing mp 1)]
      (is (thrown-with-msg?
           #?(:clj Exception :cljs js/Error)
           #"[Cc]ycle"
           (lib/check-measure-overwrite 1 measure-1-def))))))

(deftest ^:parallel check-measure-overwrite-self-reference-in-mp-test
  (testing "Measure referencing itself (measure exists in mp) - should throw cycle"
    (let [simple-def (measure-definition-with-aggregation
                      meta/metadata-provider
                      (lib/count))
          mp         (lib.tu/mock-metadata-provider
                      meta/metadata-provider
                      {:measures [{:id         1
                                   :name       "Measure 1"
                                   :table-id   (meta/id :venues)
                                   :definition simple-def}]})
          measure-1-def (measure-definition-referencing mp 1)]
      (is (thrown-with-msg?
           #?(:clj Exception :cljs js/Error)
           #"[Cc]ycle"
           (lib/check-measure-overwrite 1 measure-1-def))))))

(deftest ^:parallel check-measure-overwrite-indirect-cycle-test
  (testing "Measure A -> Measure B -> Measure A - should throw"
    (let [;; Measure 1 exists with a simple definition (will be overwritten)
          simple-def    (measure-definition-with-aggregation
                         meta/metadata-provider
                         (lib/count))
          ;; Measure 2 references Measure 1
          measure-2-def (measure-definition-referencing meta/metadata-provider 1)
          mp            (lib.tu/mock-metadata-provider
                         meta/metadata-provider
                         {:measures [{:id         1
                                      :name       "Measure 1"
                                      :table-id   (meta/id :venues)
                                      :definition simple-def}
                                     {:id         2
                                      :name       "Measure 2"
                                      :table-id   (meta/id :venues)
                                      :definition measure-2-def}]})
          ;; New definition for Measure 1 references Measure 2 -> creates cycle: 1 -> 2 -> 1
          measure-1-def (measure-definition-referencing mp 2)]
      (is (thrown-with-msg?
           #?(:clj Exception :cljs js/Error)
           #"[Cc]ycle"
           (lib/check-measure-overwrite 1 measure-1-def))))))

(deftest ^:parallel check-measure-overwrite-longer-cycle-test
  (testing "Measure A -> B -> C -> A - should throw"
    (let [;; Measure 1 exists with a simple definition (will be overwritten)
          simple-def    (measure-definition-with-aggregation
                         meta/metadata-provider
                         (lib/count))
          ;; Measure 3 references Measure 1
          measure-3-def (measure-definition-referencing meta/metadata-provider 1)
          ;; Measure 2 references Measure 3
          measure-2-def (measure-definition-referencing meta/metadata-provider 3)
          mp            (lib.tu/mock-metadata-provider
                         meta/metadata-provider
                         {:measures [{:id         1
                                      :name       "Measure 1"
                                      :table-id   (meta/id :venues)
                                      :definition simple-def}
                                     {:id         2
                                      :name       "Measure 2"
                                      :table-id   (meta/id :venues)
                                      :definition measure-2-def}
                                     {:id         3
                                      :name       "Measure 3"
                                      :table-id   (meta/id :venues)
                                      :definition measure-3-def}]})
          ;; New definition for Measure 1 references Measure 2 -> creates cycle: 1 -> 2 -> 3 -> 1
          measure-1-def (measure-definition-referencing mp 2)]
      (is (thrown-with-msg?
           #?(:clj Exception :cljs js/Error)
           #"[Cc]ycle"
           (lib/check-measure-overwrite 1 measure-1-def))))))

(deftest ^:parallel check-measure-overwrite-unknown-measure-test
  (testing "Measure referencing unknown measure - should throw"
    (let [mp            (lib.tu/mock-metadata-provider meta/metadata-provider {})
          measure-1-def (measure-definition-referencing mp 999)]
      (is (thrown-with-msg?
           #?(:clj Exception :cljs js/Error)
           #"does not exist"
           (lib/check-measure-overwrite 1 measure-1-def))))))

(deftest ^:parallel measure-field-ref-uses-operator-name-test
  (testing "When a measure is used in a query and referenced in a subsequent stage, the :field ref should use the operator name (e.g., 'sum') not the measure's display name"
    (let [definition (measure-definition-with-aggregation
                      meta/metadata-provider
                      (lib/sum (meta/field-metadata :venues :price)))
          mp         (lib.tu/mock-metadata-provider
                      meta/metadata-provider
                      {:measures [{:id         1
                                   :name       "Total Revenue"
                                   :table-id   (meta/id :venues)
                                   :definition definition}]})
          ;; Create a query with the measure as an aggregation
          query      (-> (lib/query mp (meta/table-metadata :venues))
                         (lib/aggregate [:measure {:lib/uuid (str (random-uuid))} 1])
                         ;; Add a second stage to force the measure to be referenced as a field
                         (lib/append-stage))
          ;; Get the visible columns in the second stage - these come from the first stage's aggregations
          visible-cols (lib/visible-columns query)
          measure-col  (first visible-cols)
          ;; Get the field ref that would be generated for this column
          field-ref    (lib/ref measure-col)]
      (testing "The field ref should use 'sum' as the field name, not 'Total Revenue'"
        ;; field-ref is [:field {:...} "sum"] - the third element is the field name
        (is (= "sum" (nth field-ref 2)))))))

(deftest ^:parallel type-of-test
  (testing "type-of returns the type of the measure's aggregation"
    (let [definition (measure-definition-with-aggregation
                      meta/metadata-provider
                      (lib/count))
          mp         (lib.tu/mock-metadata-provider
                      meta/metadata-provider
                      {:measures [{:id         1
                                   :name       "Count Measure"
                                   :table-id   (meta/id :venues)
                                   :definition definition}]})
          query      (lib/query mp (meta/table-metadata :venues))
          measure-metadata (lib/available-measures query)
          measure-clause [:measure {:lib/uuid (str (random-uuid))} 1]]
      (testing "for measure metadata"
        (is (= :type/Integer
               (lib/type-of query (first measure-metadata)))))
      (testing "for measure clause"
        (is (= :type/Integer
               (lib/type-of query measure-clause)))))))

(deftest ^:parallel type-of-sum-test
  (testing "type-of for sum aggregation returns numeric type"
    (let [definition (measure-definition-with-aggregation
                      meta/metadata-provider
                      (lib/sum (meta/field-metadata :venues :price)))
          mp         (lib.tu/mock-metadata-provider
                      meta/metadata-provider
                      {:measures [{:id         1
                                   :name       "Sum Measure"
                                   :table-id   (meta/id :venues)
                                   :definition definition}]})
          query      (lib/query mp (meta/table-metadata :venues))
          measure-metadata (first (lib/available-measures query))]
      (is (= :type/Integer
             (lib/type-of query measure-metadata))))))

(deftest ^:parallel type-of-min-max-test
  (testing "type-of for min/max aggregation returns the type of the aggregated field"
    (let [definition (measure-definition-with-aggregation
                      meta/metadata-provider
                      (lib/min (meta/field-metadata :venues :name)))
          mp         (lib.tu/mock-metadata-provider
                      meta/metadata-provider
                      {:measures [{:id         1
                                   :name       "Min Name"
                                   :table-id   (meta/id :venues)
                                   :definition definition}]})
          query      (lib/query mp (meta/table-metadata :venues))
          measure-metadata (first (lib/available-measures query))]
      (is (= :type/Text
             (lib/type-of query measure-metadata))))))

(deftest ^:parallel unknown-type-of-test
  (testing "type-of for unknown measure returns :type/*"
    (let [mp    (lib.tu/mock-metadata-provider meta/metadata-provider {})
          query (lib/query mp (meta/table-metadata :venues))]
      (is (= :type/*
             (lib/type-of query [:measure {} 999]))))))

(def ^:private measure-id 100)

(def ^:private measure-definition
  (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
      (lib/aggregate (lib/sum (meta/field-metadata :venues :price)))))

(def ^:private measures-db
  {:measures [{:id          measure-id
               :name        "Sum of Prices"
               :table-id    (meta/id :venues)
               :definition  measure-definition
               :description "Sum of all venue prices"}]})

(def ^:private measure-metadata-provider
  (lib.tu/mock-metadata-provider meta/metadata-provider measures-db))

(def ^:private measure-clause
  [:measure {:lib/uuid (str (random-uuid))} measure-id])

(def ^:private query-with-measure
  (-> (lib/query measure-metadata-provider (meta/table-metadata :venues))
      (lib/aggregate measure-clause)))

(deftest ^:parallel available-measures-test
  (let [expected-measure-metadata {:lib/type    :metadata/measure
                                   :id          measure-id
                                   :name        "Sum of Prices"
                                   :table-id    (meta/id :venues)
                                   :definition  measure-definition
                                   :description "Sum of all venue prices"}]
    (testing "Should return Measures with the same Table ID as query's `:source-table`"
      (is (=? [expected-measure-metadata]
              (lib.measure/available-measures (lib/query measure-metadata-provider (meta/table-metadata :venues))))))
    (testing "Shouldn't return archived Measures"
      (is (nil? (lib.measure/available-measures
                 (lib/query (lib.tu/mock-metadata-provider
                             meta/metadata-provider
                             (assoc-in measures-db [:measures 0 :archived] true))
                            (meta/table-metadata :venues))))))
    (testing "Should return the positions in the list of aggregations"
      (let [measures (lib.measure/available-measures query-with-measure)]
        (is (=? [(assoc expected-measure-metadata :aggregation-positions [0])]
                measures))
        (testing "Display info should contain aggregation-positions"
          (is (=? [{:name                  "sum_of_prices"
                    :display-name          "Sum of Prices"
                    :long-display-name     "Sum of Prices"
                    :description           "Sum of all venue prices"
                    :aggregation-positions [0]}]
                  (map #(lib/display-info query-with-measure %)
                       measures))))))))

(deftest ^:parallel available-measures-different-table-test
  (testing "query with different Table -- don't return Measures"
    (is (nil? (lib.measure/available-measures (lib/query measure-metadata-provider (meta/table-metadata :orders)))))))

(deftest ^:parallel available-measures-subsequent-stages-test
  (testing "for subsequent stages -- don't return Measures"
    (let [query (lib/append-stage (lib/query measure-metadata-provider (meta/table-metadata :venues)))]
      (is (nil? (lib.measure/available-measures query)))
      (is (nil? (lib.measure/available-measures query 1)))
      (is (nil? (lib.measure/available-measures query -1))))))

(deftest ^:parallel available-measures-aggregation-positions-with-join-alias-test
  (testing "aggregation-positions should use join-alias to distinguish measure applications"
    (let [;; Add the same measure twice with different join-aliases
          query (-> (lib/query measure-metadata-provider (meta/table-metadata :venues))
                    (lib/aggregate [:measure {:lib/uuid (str (random-uuid))} measure-id])
                    (lib/aggregate [:measure {:lib/uuid (str (random-uuid))
                                              :join-alias "J1"} measure-id]))
          measures (lib.measure/available-measures query)]
      ;; The measure without join-alias should have aggregation-positions [0]
      ;; The measure with join-alias "J1" is at position 1 but won't be returned
      ;; since available-measures only returns measures for the source table (no join-alias)
      (is (=? [{:id measure-id
                :aggregation-positions [0]}]
              measures)))))

(deftest ^:parallel available-measures-multiple-aggregation-positions-test
  (testing "aggregation-positions should contain all positions when same measure is used multiple times"
    (let [;; Add the same measure twice without join-alias
          query (-> (lib/query measure-metadata-provider (meta/table-metadata :venues))
                    (lib/aggregate [:measure {:lib/uuid (str (random-uuid))} measure-id])
                    (lib/aggregate (lib/count))
                    (lib/aggregate [:measure {:lib/uuid (str (random-uuid))} measure-id]))
          measures (lib.measure/available-measures query)]
      ;; The measure appears at positions 0 and 2
      (is (=? [{:id measure-id
                :aggregation-positions [0 2]}]
              measures)))))

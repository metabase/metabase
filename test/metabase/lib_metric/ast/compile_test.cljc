(ns metabase.lib-metric.ast.compile-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-metric.ast.compile :as ast.compile]))

;;; -------------------------------------------------- Test Data --------------------------------------------------

(def ^:private uuid-1 "550e8400-e29b-41d4-a716-446655440001")
(def ^:private uuid-2 "550e8400-e29b-41d4-a716-446655440002")

(def ^:private dim-ref-1 {:node/type :ast/dimension-ref :dimension-id uuid-1})
(def ^:private dim-ref-2 {:node/type :ast/dimension-ref :dimension-id uuid-2 :options {:temporal-unit :month}})

(def ^:private sample-ast
  {:node/type  :ast/root
   :source     {:node/type   :source/metric
                :id          42
                :name        "Test Metric"
                :aggregation {:node/type :aggregation/count}
                :base-table  {:node/type :ast/table :id 100}
                :metadata    {:dataset-query {:database 1}}}
   :dimensions [{:node/type    :ast/dimension
                 :id           uuid-1
                 :name         "category"
                 :display-name "Category"}
                {:node/type    :ast/dimension
                 :id           uuid-2
                 :name         "created_at"
                 :display-name "Created At"}]
   :mappings   [{:node/type    :ast/dimension-mapping
                 :dimension-id uuid-1
                 :table-id     100
                 :column       {:node/type :ast/column :id 1}}
                {:node/type    :ast/dimension-mapping
                 :dimension-id uuid-2
                 :table-id     100
                 :column       {:node/type :ast/column :id 2}}]
   :filter     nil
   :group-by   []
   :metadata-provider :test-provider})

;;; -------------------------------------------------- Basic Compilation --------------------------------------------------

(deftest ^:parallel compile-to-mbql-basic-test
  (let [result (ast.compile/compile-to-mbql sample-ast)]

    (testing "produces valid MBQL structure"
      (is (= :mbql/query (:lib/type result)))
      (is (= 1 (:database result)))
      (is (= 1 (count (:stages result)))))

    (testing "has correct stage structure"
      (let [stage (first (:stages result))]
        (is (= :mbql.stage/mbql (:lib/type stage)))
        (is (= 100 (:source-table stage)))
        (is (= 1 (count (:aggregation stage))))))

    (testing "compiles count aggregation"
      (let [agg (first (get-in result [:stages 0 :aggregation]))]
        (is (= :count (first agg)))
        (is (string? (get-in agg [1 :lib/uuid])))))

    (testing "has no filters when AST has none"
      (is (nil? (get-in result [:stages 0 :filters]))))

    (testing "has no breakout when AST has none"
      (is (nil? (get-in result [:stages 0 :breakout]))))))

;;; -------------------------------------------------- Aggregation Compilation --------------------------------------------------

(deftest ^:parallel compile-sum-aggregation-test
  (let [ast-with-sum (assoc-in sample-ast [:source :aggregation]
                               {:node/type :aggregation/sum
                                :column    {:node/type :ast/column :id 10}})
        result       (ast.compile/compile-to-mbql ast-with-sum)
        agg          (first (get-in result [:stages 0 :aggregation]))]
    (is (= :sum (first agg)))
    (is (= :field (first (nth agg 2))))
    (is (= 10 (nth (nth agg 2) 2)))))

(deftest ^:parallel compile-avg-aggregation-test
  (let [ast-with-avg (assoc-in sample-ast [:source :aggregation]
                               {:node/type :aggregation/avg
                                :column    {:node/type :ast/column :id 10}})
        result       (ast.compile/compile-to-mbql ast-with-avg)
        agg          (first (get-in result [:stages 0 :aggregation]))]
    (is (= :avg (first agg)))))

(deftest ^:parallel compile-min-aggregation-test
  (let [ast-with-min (assoc-in sample-ast [:source :aggregation]
                               {:node/type :aggregation/min
                                :column    {:node/type :ast/column :id 10}})
        result       (ast.compile/compile-to-mbql ast-with-min)
        agg          (first (get-in result [:stages 0 :aggregation]))]
    (is (= :min (first agg)))
    (is (= :field (first (nth agg 2))))
    (is (= 10 (nth (nth agg 2) 2)))))

(deftest ^:parallel compile-max-aggregation-test
  (let [ast-with-max (assoc-in sample-ast [:source :aggregation]
                               {:node/type :aggregation/max
                                :column    {:node/type :ast/column :id 10}})
        result       (ast.compile/compile-to-mbql ast-with-max)
        agg          (first (get-in result [:stages 0 :aggregation]))]
    (is (= :max (first agg)))
    (is (= :field (first (nth agg 2))))
    (is (= 10 (nth (nth agg 2) 2)))))

(deftest ^:parallel compile-distinct-aggregation-test
  (let [ast-with-distinct (assoc-in sample-ast [:source :aggregation]
                                    {:node/type :aggregation/distinct
                                     :column    {:node/type :ast/column :id 10}})
        result            (ast.compile/compile-to-mbql ast-with-distinct)
        agg               (first (get-in result [:stages 0 :aggregation]))]
    (is (= :distinct (first agg)))
    (is (= :field (first (nth agg 2))))
    (is (= 10 (nth (nth agg 2) 2)))))

(deftest ^:parallel compile-mbql-aggregation-test
  (let [raw-clause  [:custom-agg {} [:field {} 10]]
        ast-with-mbql (assoc-in sample-ast [:source :aggregation]
                                {:node/type :aggregation/mbql
                                 :clause    raw-clause})
        result        (ast.compile/compile-to-mbql ast-with-mbql)
        agg           (first (get-in result [:stages 0 :aggregation]))]
    (is (= raw-clause agg))))

;;; -------------------------------------------------- Filter Compilation --------------------------------------------------

(deftest ^:parallel compile-comparison-filter-test
  (let [ast-with-filter (assoc sample-ast :filter
                               {:node/type :filter/comparison
                                :operator  :=
                                :dimension dim-ref-1
                                :value     "Electronics"})
        result          (ast.compile/compile-to-mbql ast-with-filter)
        filter          (first (get-in result [:stages 0 :filters]))]
    (is (= := (first filter)))
    (is (string? (get-in filter [1 :lib/uuid])))
    (is (= :field (first (nth filter 2))))
    (is (= 1 (nth (nth filter 2) 2))) ; field id from mapping
    (is (= "Electronics" (nth filter 3)))))

(deftest ^:parallel compile-between-filter-test
  (let [ast-with-filter (assoc sample-ast :filter
                               {:node/type :filter/between
                                :dimension dim-ref-1
                                :min       10
                                :max       100})
        result          (ast.compile/compile-to-mbql ast-with-filter)
        filter          (first (get-in result [:stages 0 :filters]))]
    (is (= :between (first filter)))
    (is (= 10 (nth filter 3)))
    (is (= 100 (nth filter 4)))))

(deftest ^:parallel compile-string-filter-test
  (let [ast-with-filter (assoc sample-ast :filter
                               {:node/type :filter/string
                                :operator  :contains
                                :dimension dim-ref-1
                                :value     "foo"
                                :options   {:case-sensitive false}})
        result          (ast.compile/compile-to-mbql ast-with-filter)
        filter          (first (get-in result [:stages 0 :filters]))]
    (is (= :contains (first filter)))
    (is (= false (get-in filter [1 :case-sensitive])))
    (is (= "foo" (nth filter 3)))))

(deftest ^:parallel compile-null-filter-test
  (let [ast-with-filter (assoc sample-ast :filter
                               {:node/type :filter/null
                                :operator  :is-null
                                :dimension dim-ref-1})
        result          (ast.compile/compile-to-mbql ast-with-filter)
        filter          (first (get-in result [:stages 0 :filters]))]
    (is (= :is-null (first filter)))
    (is (= :field (first (nth filter 2))))))

(deftest ^:parallel compile-in-filter-test
  (let [ast-with-filter (assoc sample-ast :filter
                               {:node/type :filter/in
                                :operator  :in
                                :dimension dim-ref-1
                                :values    ["a" "b" "c"]})
        result          (ast.compile/compile-to-mbql ast-with-filter)
        filter          (first (get-in result [:stages 0 :filters]))]
    (is (= :in (first filter)))
    ;; field ref at index 2, then values
    (is (= "a" (nth filter 3)))
    (is (= "b" (nth filter 4)))
    (is (= "c" (nth filter 5)))))

(deftest ^:parallel compile-not-in-filter-test
  (let [ast-with-filter (assoc sample-ast :filter
                               {:node/type :filter/in
                                :operator  :not-in
                                :dimension dim-ref-1
                                :values    ["x" "y"]})
        result          (ast.compile/compile-to-mbql ast-with-filter)
        filter          (first (get-in result [:stages 0 :filters]))]
    (is (= :not-in (first filter)))
    (is (= :field (first (nth filter 2))))
    (is (= "x" (nth filter 3)))
    (is (= "y" (nth filter 4)))))

(deftest ^:parallel compile-temporal-filter-test
  (let [ast-with-filter (assoc sample-ast :filter
                               {:node/type :filter/temporal
                                :operator  :time-interval
                                :dimension dim-ref-1
                                :value     -30
                                :unit      :day})
        result          (ast.compile/compile-to-mbql ast-with-filter)
        filter          (first (get-in result [:stages 0 :filters]))]
    (is (= :time-interval (first filter)))
    (is (= -30 (nth filter 3)))
    (is (= :day (nth filter 4)))))

(deftest ^:parallel compile-and-filter-test
  (let [filter-a        {:node/type :filter/comparison :operator := :dimension dim-ref-1 :value "a"}
        filter-b        {:node/type :filter/comparison :operator :> :dimension dim-ref-2 :value 10}
        ast-with-filter (assoc sample-ast :filter
                               {:node/type :filter/and
                                :children  [filter-a filter-b]})
        result          (ast.compile/compile-to-mbql ast-with-filter)
        filter          (first (get-in result [:stages 0 :filters]))]
    (is (= :and (first filter)))
    (is (= 2 (count (drop 2 filter)))) ; two children after tag and opts
    (is (= := (first (nth filter 2))))
    (is (= :> (first (nth filter 3))))))

(deftest ^:parallel compile-or-filter-test
  (let [filter-a        {:node/type :filter/comparison :operator := :dimension dim-ref-1 :value "a"}
        filter-b        {:node/type :filter/comparison :operator := :dimension dim-ref-1 :value "b"}
        ast-with-filter (assoc sample-ast :filter
                               {:node/type :filter/or
                                :children  [filter-a filter-b]})
        result          (ast.compile/compile-to-mbql ast-with-filter)
        filter          (first (get-in result [:stages 0 :filters]))]
    (is (= :or (first filter)))))

(deftest ^:parallel compile-not-filter-test
  (let [filter-a        {:node/type :filter/comparison :operator := :dimension dim-ref-1 :value "exclude"}
        ast-with-filter (assoc sample-ast :filter
                               {:node/type :filter/not
                                :child     filter-a})
        result          (ast.compile/compile-to-mbql ast-with-filter)
        filter          (first (get-in result [:stages 0 :filters]))]
    (is (= :not (first filter)))
    (is (= := (first (nth filter 2))))))

;;; -------------------------------------------------- Group By / Breakout Compilation --------------------------------------------------

(deftest ^:parallel compile-group-by-test
  (let [ast-with-groupby (assoc sample-ast :group-by [dim-ref-1])
        result           (ast.compile/compile-to-mbql ast-with-groupby)
        breakout         (get-in result [:stages 0 :breakout])]
    (is (= 1 (count breakout)))
    (let [field-ref (first breakout)]
      (is (= :field (first field-ref)))
      (is (= 1 (nth field-ref 2))))))

(deftest ^:parallel compile-group-by-with-temporal-unit-test
  (let [ast-with-groupby (assoc sample-ast :group-by [dim-ref-2])
        result           (ast.compile/compile-to-mbql ast-with-groupby)
        breakout         (get-in result [:stages 0 :breakout])
        field-ref        (first breakout)]
    (is (= :field (first field-ref)))
    (is (= :month (get-in field-ref [1 :temporal-unit])))
    (is (= 2 (nth field-ref 2)))))

(deftest ^:parallel compile-multiple-group-by-test
  (let [ast-with-groupby (assoc sample-ast :group-by [dim-ref-1 dim-ref-2])
        result           (ast.compile/compile-to-mbql ast-with-groupby)
        breakout         (get-in result [:stages 0 :breakout])]
    (is (= 2 (count breakout)))))

(deftest ^:parallel compile-group-by-with-binning-test
  (testing "compiles group-by with binning strategy :default"
    (let [dim-ref-with-binning {:node/type    :ast/dimension-ref
                                :dimension-id uuid-1
                                :options      {:binning {:strategy :default}}}
          ast-with-binning     (assoc sample-ast :group-by [dim-ref-with-binning])
          result               (ast.compile/compile-to-mbql ast-with-binning)
          breakout             (get-in result [:stages 0 :breakout])
          field-ref            (first breakout)]
      (is (= :field (first field-ref)))
      (is (= {:strategy :default} (get-in field-ref [1 :binning])))))

  (testing "compiles group-by with binning strategy :num-bins"
    (let [dim-ref-with-binning {:node/type    :ast/dimension-ref
                                :dimension-id uuid-1
                                :options      {:binning {:strategy :num-bins :num-bins 10}}}
          ast-with-binning     (assoc sample-ast :group-by [dim-ref-with-binning])
          result               (ast.compile/compile-to-mbql ast-with-binning)
          breakout             (get-in result [:stages 0 :breakout])
          field-ref            (first breakout)]
      (is (= :field (first field-ref)))
      (is (= {:strategy :num-bins :num-bins 10} (get-in field-ref [1 :binning])))))

  (testing "compiles group-by with binning strategy :bin-width"
    (let [dim-ref-with-binning {:node/type    :ast/dimension-ref
                                :dimension-id uuid-1
                                :options      {:binning {:strategy :bin-width :bin-width 5}}}
          ast-with-binning     (assoc sample-ast :group-by [dim-ref-with-binning])
          result               (ast.compile/compile-to-mbql ast-with-binning)
          breakout             (get-in result [:stages 0 :breakout])
          field-ref            (first breakout)]
      (is (= :field (first field-ref)))
      (is (= {:strategy :bin-width :bin-width 5} (get-in field-ref [1 :binning]))))))

;;; -------------------------------------------------- Options --------------------------------------------------

(deftest ^:parallel compile-with-limit-test
  (let [result (ast.compile/compile-to-mbql sample-ast :limit 10)]
    (is (= 10 (get-in result [:stages 0 :limit])))))

;;; -------------------------------------------------- Combined Filters and Group By --------------------------------------------------

(deftest ^:parallel compile-full-exploration-test
  (let [full-ast (-> sample-ast
                     (assoc :filter {:node/type :filter/and
                                     :children  [{:node/type :filter/comparison
                                                  :operator  :=
                                                  :dimension dim-ref-1
                                                  :value     "Electronics"}
                                                 {:node/type :filter/temporal
                                                  :operator  :time-interval
                                                  :dimension dim-ref-2
                                                  :value     -30
                                                  :unit      :day}]})
                     (assoc :group-by [dim-ref-1 dim-ref-2]))
        result   (ast.compile/compile-to-mbql full-ast :limit 1000)
        stage    (first (:stages result))]

    (testing "has filters"
      (is (seq (:filters stage)))
      ;; Should be wrapped in :and since we have compound filter
      (let [filter (first (:filters stage))]
        (is (= :and (first filter)))))

    (testing "has breakouts"
      (is (= 2 (count (:breakout stage)))))

    (testing "has limit"
      (is (= 1000 (:limit stage))))

    (testing "has aggregation"
      (is (= 1 (count (:aggregation stage)))))))

;;; -------------------------------------------------- Dimension Resolution Errors --------------------------------------------------

(def ^:private unknown-uuid "99999999-9999-9999-9999-999999999999")

(deftest ^:parallel compile-unresolved-dimension-error-test
  (let [unknown-dim-ref {:node/type :ast/dimension-ref :dimension-id unknown-uuid}
        ast-with-filter (assoc sample-ast :filter
                               {:node/type :filter/comparison
                                :operator  :=
                                :dimension unknown-dim-ref
                                :value     "value"})]
    (testing "throws when dimension cannot be resolved"
      (is (thrown-with-msg? #?(:clj clojure.lang.ExceptionInfo :cljs ExceptionInfo)
                            #"Unable to resolve dimension"
                            (ast.compile/compile-to-mbql ast-with-filter))))))

;;; -------------------------------------------------- Source Filters --------------------------------------------------

(deftest ^:parallel compile-with-source-filters-test
  (let [source-filter {:node/type :filter/comparison
                       :operator  :=
                       :dimension dim-ref-1
                       :value     "source-value"}
        ast-with-source-filter (assoc-in sample-ast [:source :filters] source-filter)
        result                 (ast.compile/compile-to-mbql ast-with-source-filter)
        filters                (get-in result [:stages 0 :filters])]

    (testing "includes source filters in output"
      (is (= 1 (count filters)))
      (is (= := (first (first filters)))))))

(deftest ^:parallel compile-combines-source-and-user-filters-test
  (let [source-filter {:node/type :filter/comparison
                       :operator  :=
                       :dimension dim-ref-1
                       :value     "source-value"}
        user-filter   {:node/type :filter/comparison
                       :operator  :>
                       :dimension dim-ref-2
                       :value     100}
        ast           (-> sample-ast
                          (assoc-in [:source :filters] source-filter)
                          (assoc :filter user-filter))
        result        (ast.compile/compile-to-mbql ast)
        filters       (get-in result [:stages 0 :filters])
        filter        (first filters)]

    (testing "combines source and user filters with :and"
      (is (= 1 (count filters)))
      (is (= :and (first filter)))
      ;; Should have source filter and user filter as children
      (is (= 2 (count (drop 2 filter)))))))

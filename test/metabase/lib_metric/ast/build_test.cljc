(ns metabase.lib-metric.ast.build-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [malli.error :as me]
   [metabase.lib-metric.ast.build :as ast.build]
   [metabase.lib-metric.ast.schema :as ast.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.test-metadata :as meta]
   [metabase.util.malli.registry :as mr]))

;;; -------------------------------------------------- Test Data --------------------------------------------------

(def ^:private uuid-1 "550e8400-e29b-41d4-a716-446655440001")
(def ^:private uuid-2 "550e8400-e29b-41d4-a716-446655440002")
(def ^:private expr-uuid "550e8400-e29b-41d4-a716-446655440099")

(defn- sample-dimensions []
  [{:id uuid-1 :name "category" :display-name "Category" :status :status/active}
   {:id uuid-2 :name "created_at" :display-name "Created At" :status :status/active}])

(defn- sample-mappings []
  (let [venues-id (meta/id :venues)]
    [{:type :table :table-id venues-id :dimension-id uuid-1
      :target [:field {:lib/uuid "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"} (meta/id :venues :category-id)]}
     {:type :table :table-id venues-id :dimension-id uuid-2
      :target [:field {:lib/uuid "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"} (meta/id :venues :id)]}]))

(defn- sample-metric-query []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
      (lib/aggregate (lib/count))))

(defn- sample-metric-metadata []
  {:lib/type           :metadata/metric
   :id                 42
   :name               "Total Revenue"
   :dimensions         (sample-dimensions)
   :dimension-mappings (sample-mappings)
   :dataset-query      (sample-metric-query)})

(defn- sample-measure-query []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
      (lib/aggregate (lib/sum (meta/field-metadata :orders :total)))))

(defn- sample-measure-metadata []
  {:lib/type           :metadata/measure
   :id                 99
   :name               "Order Count"
   :dimensions         (sample-dimensions)
   :dimension-mappings (sample-mappings)
   :definition         (sample-measure-query)})

;; A metadata provider that wraps meta/metadata-provider but also serves metric/measure metadata
(defn- make-test-provider
  "Create a metadata provider that delegates to meta/metadata-provider for table/column queries
   and returns test metric/measure metadata for metric/measure queries."
  [metric-metadata measure-metadata]
  (reify lib.metadata.protocols/MetadataProvider
    (metadatas [_this metadata-spec]
      (case (:lib/type metadata-spec)
        :metadata/metric
        (if (contains? (:id metadata-spec) (:id metric-metadata))
          [metric-metadata]
          [])
        :metadata/measure
        (if (and measure-metadata (contains? (:id metadata-spec) (:id measure-metadata)))
          [measure-metadata]
          [])
        ;; Delegate to base provider for everything else
        (lib.metadata.protocols/metadatas meta/metadata-provider metadata-spec)))
    (database [_this]
      (lib.metadata.protocols/database meta/metadata-provider))
    (setting [_this setting-key]
      (lib.metadata.protocols/setting meta/metadata-provider setting-key))))

(defn- sample-definition []
  {:lib/type          :metric/definition
   :expression        [:metric {:lib/uuid expr-uuid} 42]
   :filters           []
   :projections       []
   :metadata-provider (make-test-provider (sample-metric-metadata) (sample-measure-metadata))})

;;; -------------------------------------------------- Primitive Construction --------------------------------------------------

(deftest ^:parallel table-node-test
  (testing "creates valid table node with id only"
    (let [node (ast.build/table-node 1)]
      (is (= {:node/type :ast/table :id 1} node))
      (is (nil? (me/humanize (mr/explain ::ast.schema/table-node node))))))

  (testing "creates valid table node with name"
    (let [node (ast.build/table-node 1 "orders")]
      (is (= {:node/type :ast/table :id 1 :name "orders"} node))
      (is (nil? (me/humanize (mr/explain ::ast.schema/table-node node)))))))

(deftest ^:parallel column-node-test
  (testing "creates valid column node with id only"
    (let [node (ast.build/column-node 1)]
      (is (= {:node/type :ast/column :id 1} node))
      (is (nil? (me/humanize (mr/explain ::ast.schema/column-node node))))))

  (testing "creates valid column node with all fields"
    (let [node (ast.build/column-node 1 "category" 10)]
      (is (= {:node/type :ast/column :id 1 :name "category" :table-id 10} node))
      (is (nil? (me/humanize (mr/explain ::ast.schema/column-node node)))))))

;;; -------------------------------------------------- Dimension Construction --------------------------------------------------

(deftest ^:parallel dimension-node-test
  (testing "creates valid dimension node from persisted dimension"
    (let [node (ast.build/dimension-node (first (sample-dimensions)))]
      (is (= {:node/type    :ast/dimension
              :id           uuid-1
              :name         "category"
              :display-name "Category"
              :status       :status/active}
             node))
      (is (nil? (me/humanize (mr/explain ::ast.schema/dimension-node node)))))))

(deftest ^:parallel dimension-mapping-node-test
  (testing "creates valid dimension mapping node"
    (let [mappings (sample-mappings)
          node     (ast.build/dimension-mapping-node (first mappings))]
      (is (= uuid-1 (:dimension-id node)))
      (is (= (meta/id :venues) (:table-id node)))
      (is (= :ast/dimension-mapping (:node/type node)))
      (is (= (meta/id :venues :category-id) (get-in node [:column :id])))
      (is (nil? (me/humanize (mr/explain ::ast.schema/dimension-mapping-node node)))))))

;;; -------------------------------------------------- from-definition --------------------------------------------------

(deftest ^:parallel from-definition-test
  (let [ast (ast.build/from-definition (sample-definition))]

    (testing "creates valid AST structure"
      (is (nil? (me/humanize (mr/explain ::ast.schema/ast ast)))))

    (testing "has correct root structure"
      (is (= :ast/root (:node/type ast)))
      (is (some? (:expression ast)))
      (is (some? (:metadata-provider ast))))

    (testing "expression is a single leaf"
      (is (= :expression/leaf (get-in ast [:expression :node/type])))
      (is (string? (get-in ast [:expression :uuid]))))

    (let [source-query (get-in ast [:expression :ast])]
      (testing "leaf wraps a source-query"
        (is (= :ast/source-query (:node/type source-query)))
        (is (nil? (:filter source-query)))
        (is (= [] (:group-by source-query))))

      (testing "has correct source"
        (let [source (:source source-query)]
          (is (= :source/metric (:node/type source)))
          (is (= 42 (:id source)))
          (is (= "Total Revenue" (:name source)))))

      (testing "has dimensions as nodes"
        (is (= 2 (count (:dimensions source-query))))
        (is (every? #(= :ast/dimension (:node/type %)) (:dimensions source-query)))
        (is (= uuid-1 (get-in source-query [:dimensions 0 :id]))))

      (testing "has mappings as nodes"
        (is (= 2 (count (:mappings source-query))))
        (is (every? #(= :ast/dimension-mapping (:node/type %)) (:mappings source-query)))))))

(deftest ^:parallel from-definition-measure-test
  (let [measure-def {:lib/type          :metric/definition
                     :expression        [:measure {:lib/uuid expr-uuid} 99]
                     :filters           []
                     :projections       []
                     :metadata-provider (make-test-provider (sample-metric-metadata) (sample-measure-metadata))}
        ast         (ast.build/from-definition measure-def)]

    (testing "creates valid AST for measure"
      (is (nil? (me/humanize (mr/explain ::ast.schema/ast ast)))))

    (testing "has measure source type"
      (is (= :source/measure (get-in ast [:expression :ast :source :node/type]))))

    (testing "extracts sum aggregation"
      (is (= :aggregation/sum (get-in ast [:expression :ast :source :aggregation :node/type]))))))

;;; -------------------------------------------------- Dimension Reference Conversion --------------------------------------------------

(deftest ^:parallel dimension-ref->ast-dimension-ref-test
  (testing "converts basic dimension reference"
    (let [result (ast.build/dimension-ref->ast-dimension-ref [:dimension {} uuid-1])]
      (is (= {:node/type    :ast/dimension-ref
              :dimension-id uuid-1}
             result))
      (is (nil? (me/humanize (mr/explain ::ast.schema/dimension-ref-node result))))))

  (testing "converts dimension reference with temporal-unit option"
    (let [result (ast.build/dimension-ref->ast-dimension-ref [:dimension {"temporal-unit" "year"} uuid-1])]
      (is (= {:node/type    :ast/dimension-ref
              :dimension-id uuid-1
              :options      {:temporal-unit :year}}
             result))))

  (testing "converts dimension reference with binning option"
    (let [result (ast.build/dimension-ref->ast-dimension-ref [:dimension {"binning" {"strategy" "default"}} uuid-1])]
      (is (= {:node/type    :ast/dimension-ref
              :dimension-id uuid-1
              :options      {:binning {:strategy :default}}}
             result))))

  (testing "converts binning strategy string values to keywords"
    (let [result (ast.build/dimension-ref->ast-dimension-ref
                  [:dimension {"binning" {"strategy" "num-bins" "num-bins" 10}} uuid-1])]
      (is (= :num-bins (get-in result [:options :binning :strategy])))
      (is (= 10 (get-in result [:options :binning :num-bins]))))))

;;; -------------------------------------------------- Filter Conversion --------------------------------------------------

(deftest ^:parallel mbql-filter->ast-filter-comparison-test
  (testing "converts comparison filters"
    (doseq [op [:= :!= :< :<= :> :>=]]
      (let [result (ast.build/mbql-filter->ast-filter [op {} [:dimension {} uuid-1] 42])]
        (is (= :filter/comparison (:node/type result)))
        (is (= op (:operator result)))
        (is (= uuid-1 (get-in result [:dimension :dimension-id])))
        (is (= [42] (:values result)))))))

(deftest ^:parallel mbql-filter->ast-filter-between-test
  (testing "converts between filter"
    (let [result (ast.build/mbql-filter->ast-filter [:between {} [:dimension {} uuid-1] 10 100])]
      (is (= :filter/between (:node/type result)))
      (is (= uuid-1 (get-in result [:dimension :dimension-id])))
      (is (= 10 (:min result)))
      (is (= 100 (:max result))))))

(deftest ^:parallel mbql-filter->ast-filter-inside-test
  (testing "converts inside filter"
    (let [result (ast.build/mbql-filter->ast-filter
                  [:inside {} [:dimension {} uuid-1] [:dimension {} uuid-2] 40.0 -73.0 39.0 -74.0])]
      (is (= :filter/inside (:node/type result)))
      (is (= uuid-1 (get-in result [:lat-dimension :dimension-id])))
      (is (= uuid-2 (get-in result [:lon-dimension :dimension-id])))
      (is (= 40.0 (:north result)))
      (is (= -73.0 (:east result)))
      (is (= 39.0 (:south result)))
      (is (= -74.0 (:west result))))))

(deftest ^:parallel mbql-filter->ast-filter-string-test
  (testing "converts string filters"
    (doseq [op [:contains :starts-with :ends-with :does-not-contain]]
      (let [result (ast.build/mbql-filter->ast-filter [op {} [:dimension {} uuid-1] "test"])]
        (is (= :filter/string (:node/type result)))
        (is (= op (:operator result)))
        (is (= "test" (:value result)))))))

(deftest ^:parallel mbql-filter->ast-filter-null-test
  (testing "converts null filters"
    (doseq [op [:is-null :not-null :is-empty :not-empty]]
      (let [result (ast.build/mbql-filter->ast-filter [op {} [:dimension {} uuid-1]])]
        (is (= :filter/null (:node/type result)))
        (is (= op (:operator result)))))))

(deftest ^:parallel mbql-filter->ast-filter-in-test
  (testing "converts in filters"
    (let [result (ast.build/mbql-filter->ast-filter [:in {} [:dimension {} uuid-1] 1 2 3])]
      (is (= :filter/in (:node/type result)))
      (is (= :in (:operator result)))
      (is (= [1 2 3] (:values result)))))

  (testing "converts not-in filters"
    (let [result (ast.build/mbql-filter->ast-filter [:not-in {} [:dimension {} uuid-1] "a" "b"])]
      (is (= :filter/in (:node/type result)))
      (is (= :not-in (:operator result)))
      (is (= ["a" "b"] (:values result))))))

(deftest ^:parallel mbql-filter->ast-filter-temporal-test
  (testing "converts time-interval filter"
    (let [result (ast.build/mbql-filter->ast-filter [:time-interval {} [:dimension {} uuid-1] -30 "day"])]
      (is (= :filter/temporal (:node/type result)))
      (is (= :time-interval (:operator result)))
      (is (= -30 (:value result)))
      (is (= :day (:unit result)))
      (is (nil? (:offset-value result)))))

  (testing "converts relative-time-interval filter with positional offsets"
    (let [result (ast.build/mbql-filter->ast-filter
                  [:relative-time-interval {} [:dimension {} uuid-1] -7 "day" -1 "month"])]
      (is (= :filter/temporal (:node/type result)))
      (is (= :relative-time-interval (:operator result)))
      (is (= -7 (:value result)))
      (is (= :day (:unit result)))
      (is (= -1 (:offset-value result)))
      (is (= :month (:offset-unit result)))))

  (testing "converts time-interval filter with offsets in opts map"
    (let [result (ast.build/mbql-filter->ast-filter
                  [:time-interval {:offset-value -1 :offset-unit :week} [:dimension {} uuid-1] -30 "day"])]
      (is (= :filter/temporal (:node/type result)))
      (is (= :time-interval (:operator result)))
      (is (= -30 (:value result)))
      (is (= :day (:unit result)))
      (is (= -1 (:offset-value result)))
      (is (= :week (:offset-unit result))))))

(deftest ^:parallel mbql-filter->ast-filter-compound-test
  (testing "converts and filter"
    (let [result (ast.build/mbql-filter->ast-filter [:and {}
                                                     [:= {} [:dimension {} uuid-1] 1]
                                                     [:= {} [:dimension {} uuid-2] 2]])]
      (is (= :filter/and (:node/type result)))
      (is (= 2 (count (:children result))))
      (is (every? #(= :filter/comparison (:node/type %)) (:children result)))))

  (testing "converts or filter"
    (let [result (ast.build/mbql-filter->ast-filter [:or {}
                                                     [:= {} [:dimension {} uuid-1] 1]
                                                     [:= {} [:dimension {} uuid-2] 2]])]
      (is (= :filter/or (:node/type result)))
      (is (= 2 (count (:children result))))))

  (testing "converts not filter"
    (let [result (ast.build/mbql-filter->ast-filter [:not {} [:= {} [:dimension {} uuid-1] 1]])]
      (is (= :filter/not (:node/type result)))
      (is (= :filter/comparison (get-in result [:child :node/type]))))))

(deftest ^:parallel mbql-filter->ast-filter-exclude-day-of-week-test
  (let [;; Exclude Monday (1) and Sunday (7) using ISO day-of-week
        ;; This is the MBQL 5 shape produced by lib/fe_util/exclude-date-filter-clause
        result (ast.build/mbql-filter->ast-filter
                [:!= {} [:get-day-of-week {} [:dimension {} uuid-2] :iso] 1 7])]
    (is (some? result) "should produce an AST filter node")
    (is (= :filter/comparison (:node/type result)))
    (is (= :!= (:operator result)))
    (is (= :ast/dimension-expression (get-in result [:dimension :node/type])))
    (is (= :get-day-of-week (get-in result [:dimension :expression-op])))
    (is (= uuid-2 (get-in result [:dimension :dimension :dimension-id])))
    (is (= [:iso] (get-in result [:dimension :args])))
    (is (= [1 7] (:values result)))))

(deftest ^:parallel mbql-filter->ast-filter-exclude-month-test
  (let [;; Exclude March (3) and December (12)
        result (ast.build/mbql-filter->ast-filter
                [:!= {} [:get-month {} [:dimension {} uuid-2]] 3 12])]
    (is (some? result) "should produce an AST filter node")
    (is (= :ast/dimension-expression (get-in result [:dimension :node/type])))
    (is (= :get-month (get-in result [:dimension :expression-op])))
    (is (= uuid-2 (get-in result [:dimension :dimension :dimension-id])))
    (is (nil? (get-in result [:dimension :args])) "get-month has no extra args")
    (is (= [3 12] (:values result)))))

(deftest ^:parallel mbql-filter->ast-filter-exclude-hour-test
  (let [;; Exclude hour 0 and hour 23
        result (ast.build/mbql-filter->ast-filter
                [:!= {} [:get-hour {} [:dimension {} uuid-2]] 0 23])]
    (is (some? result) "should produce an AST filter node")
    (is (= :ast/dimension-expression (get-in result [:dimension :node/type])))
    (is (= :get-hour (get-in result [:dimension :expression-op])))
    (is (= uuid-2 (get-in result [:dimension :dimension :dimension-id])))
    (is (= [0 23] (:values result)))))

(deftest ^:parallel mbql-filter->ast-filter-exclude-quarter-test
  (let [;; Exclude Q2 and Q4
        result (ast.build/mbql-filter->ast-filter
                [:!= {} [:get-quarter {} [:dimension {} uuid-2]] 2 4])]
    (is (some? result) "should produce an AST filter node")
    (is (= :ast/dimension-expression (get-in result [:dimension :node/type])))
    (is (= :get-quarter (get-in result [:dimension :expression-op])))
    (is (= uuid-2 (get-in result [:dimension :dimension :dimension-id])))
    (is (= [2 4] (:values result)))))

(deftest ^:parallel mbql-filters->ast-filter-test
  (testing "single filter returns that filter"
    (let [result (ast.build/mbql-filters->ast-filter [[:= {} [:dimension {} uuid-1] 42]])]
      (is (= :filter/comparison (:node/type result)))))

  (testing "multiple filters combined with and"
    (let [result (ast.build/mbql-filters->ast-filter [[:= {} [:dimension {} uuid-1] 1]
                                                      [:= {} [:dimension {} uuid-2] 2]])]
      (is (= :filter/and (:node/type result)))
      (is (= 2 (count (:children result))))))

  (testing "empty filters returns nil"
    (is (nil? (ast.build/mbql-filters->ast-filter [])))))

;;; -------------------------------------------------- from-definition with filters/projections --------------------------------------------------

(deftest ^:parallel from-definition-with-filters-test
  (let [definition-with-filters (assoc (sample-definition)
                                       :filters [{:lib/uuid expr-uuid
                                                  :filter [:= {} [:dimension {} uuid-1] 42]}])
        ast (ast.build/from-definition definition-with-filters)
        source-query (get-in ast [:expression :ast])]

    (testing "creates valid AST structure with filter"
      (is (nil? (me/humanize (mr/explain ::ast.schema/ast ast)))))

    (testing "has filter node"
      (is (some? (:filter source-query)))
      (is (= :filter/comparison (get-in source-query [:filter :node/type])))
      (is (= := (get-in source-query [:filter :operator]))))))

(deftest ^:parallel from-definition-with-projections-test
  (let [definition-with-projections (assoc (sample-definition)
                                           :projections [{:type :metric
                                                          :id 42
                                                          :lib/uuid expr-uuid
                                                          :projection [[:dimension {} uuid-1]
                                                                       [:dimension {"temporal-unit" "year"} uuid-2]]}])
        ast (ast.build/from-definition definition-with-projections)
        source-query (get-in ast [:expression :ast])]

    (testing "creates valid AST structure with group-by"
      (is (nil? (me/humanize (mr/explain ::ast.schema/ast ast)))))

    (testing "has group-by dimension refs"
      (is (= 2 (count (:group-by source-query))))
      (is (every? #(= :ast/dimension-ref (:node/type %)) (:group-by source-query)))
      (is (= uuid-1 (get-in source-query [:group-by 0 :dimension-id])))
      (is (= {:temporal-unit :year} (get-in source-query [:group-by 1 :options]))))))

(deftest ^:parallel from-definition-loads-dimensions-from-provider-test
  (testing "dimensions are loaded from metadata fetched via provider"
    (let [definition (sample-definition)
          ast (ast.build/from-definition definition)
          source-query (get-in ast [:expression :ast])]
      ;; Dimensions are loaded from provider -> sample-metric-metadata
      (is (= 2 (count (:dimensions source-query))))
      (is (= 2 (count (:mappings source-query)))))))

;;; -------------------------------------------------- Multi-Stage Source Queries --------------------------------------------------

(defn- sample-metric-query-with-join []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
      (lib/join (lib/join-clause (meta/table-metadata :categories)
                                 [(lib/= (meta/field-metadata :venues :category-id)
                                         (meta/field-metadata :categories :id))]))
      (lib/aggregate (lib/count))
      (lib/append-stage)))

(defn- sample-metric-metadata-with-join []
  {:lib/type           :metadata/metric
   :id                 42
   :name               "Total Revenue"
   :dimensions         (sample-dimensions)
   :dimension-mappings (sample-mappings)
   :dataset-query      (sample-metric-query-with-join)})

(deftest ^:parallel from-definition-multi-stage-extracts-from-stage-0-test
  (testing "joins, filters, and aggregation are extracted from stage 0 of multi-stage queries"
    (let [provider   (make-test-provider (sample-metric-metadata-with-join) (sample-measure-metadata))
          definition {:lib/type          :metric/definition
                      :expression        [:metric {:lib/uuid expr-uuid} 42]
                      :filters           []
                      :projections       []
                      :metadata-provider provider}
          ast        (ast.build/from-definition definition)]
      (testing "has joins extracted from stage 0"
        (is (seq (get-in ast [:expression :ast :source :joins]))))
      (testing "has aggregation extracted from stage 0"
        (is (some? (get-in ast [:expression :ast :source :aggregation])))))))

;;; -------------------------------------------------- Arithmetic Expression Building --------------------------------------------------

(def ^:private arith-uuid-a "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
(def ^:private arith-uuid-b "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

(defn- arithmetic-definition []
  {:lib/type          :metric/definition
   :expression        [:+ {}
                       [:metric {:lib/uuid arith-uuid-a} 42]
                       [:metric {:lib/uuid arith-uuid-b} 42]]
   :filters           []
   :projections       []
   :metadata-provider (make-test-provider (sample-metric-metadata) (sample-measure-metadata))})

(deftest ^:parallel from-definition-arithmetic-test
  (let [ast (ast.build/from-definition (arithmetic-definition))]

    (testing "arithmetic expression builds AST with :expression key"
      (is (= :ast/root (:node/type ast)))
      (is (some? (:expression ast)))
      (is (nil? (:source ast))))

    (testing "expression root is arithmetic node"
      (is (= :expression/arithmetic (get-in ast [:expression :node/type])))
      (is (= :+ (get-in ast [:expression :operator]))))

    (testing "arithmetic has two children"
      (is (= 2 (count (get-in ast [:expression :children])))))

    (testing "each child is an expression leaf with complete sub-AST"
      (doseq [child (get-in ast [:expression :children])]
        (is (= :expression/leaf (:node/type child)))
        (is (string? (:uuid child)))
        (let [sub-ast (:ast child)]
          (is (= :ast/source-query (:node/type sub-ast)))
          (is (some? (:source sub-ast)))
          (is (seq (:dimensions sub-ast)))
          (is (seq (:mappings sub-ast))))))

    (testing "leaf UUIDs match expression"
      (let [uuids (set (map :uuid (get-in ast [:expression :children])))]
        (is (contains? uuids arith-uuid-a))
        (is (contains? uuids arith-uuid-b))))))

(deftest ^:parallel from-definition-arithmetic-with-filters-test
  (let [definition (assoc (arithmetic-definition)
                          :filters [{:lib/uuid arith-uuid-a
                                     :filter [:= {} [:dimension {} uuid-1] 42]}])
        ast (ast.build/from-definition definition)]

    (testing "instance filters are partitioned to matching leaf sub-ASTs"
      (let [children (get-in ast [:expression :children])
            child-a  (first (filter #(= arith-uuid-a (:uuid %)) children))
            child-b  (first (filter #(= arith-uuid-b (:uuid %)) children))]
        (is (some? (get-in child-a [:ast :filter])))
        (is (nil? (get-in child-b [:ast :filter])))))))

(deftest ^:parallel from-definition-arithmetic-with-constant-test
  (let [definition {:lib/type          :metric/definition
                    :expression        [:* {} [:metric {:lib/uuid arith-uuid-a} 42] 100]
                    :filters           []
                    :projections       []
                    :metadata-provider (make-test-provider (sample-metric-metadata) (sample-measure-metadata))}
        ast (ast.build/from-definition definition)]

    (testing "creates valid AST with constant child"
      (is (nil? (me/humanize (mr/explain ::ast.schema/ast ast)))))

    (testing "expression root is arithmetic"
      (is (= :expression/arithmetic (get-in ast [:expression :node/type])))
      (is (= :* (get-in ast [:expression :operator]))))

    (testing "has one leaf and one constant child"
      (let [children (get-in ast [:expression :children])]
        (is (= 2 (count children)))
        (is (= :expression/leaf (get-in children [0 :node/type])))
        (is (= :expression/constant (get-in children [1 :node/type])))
        (is (= 100 (get-in children [1 :value])))))))

(deftest ^:parallel from-definition-arithmetic-with-projections-test
  (let [definition (assoc (arithmetic-definition)
                          :projections [{:type :metric
                                         :id 42
                                         :lib/uuid arith-uuid-a
                                         :projection [[:dimension {} uuid-1]]}
                                        {:type :metric
                                         :id 42
                                         :lib/uuid arith-uuid-b
                                         :projection [[:dimension {} uuid-1]]}])
        ast (ast.build/from-definition definition)]

    (testing "projections are assigned to matching leaf sub-ASTs"
      (doseq [child (get-in ast [:expression :children])]
        (is (= 1 (count (get-in child [:ast :group-by]))))))))

(ns metabase.lib-metric.ast.build-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [malli.error :as me]
   [metabase.lib-metric.ast.build :as ast.build]
   [metabase.lib-metric.ast.schema :as ast.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.util.malli.registry :as mr]))

;;; -------------------------------------------------- Test Data --------------------------------------------------

(def ^:private uuid-1 "550e8400-e29b-41d4-a716-446655440001")
(def ^:private uuid-2 "550e8400-e29b-41d4-a716-446655440002")

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

(defn- sample-definition []
  {:lib/type          :metric/definition
   :source            {:type     :source/metric
                       :id       42
                       :metadata (sample-metric-metadata)}
   :filters           []
   :projections       []
   :metadata-provider meta/metadata-provider})

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
      (is (nil? (:filter ast)))
      (is (= [] (:group-by ast)))
      (is (some? (:metadata-provider ast))))

    (testing "has correct source"
      (let [source (:source ast)]
        (is (= :source/metric (:node/type source)))
        (is (= 42 (:id source)))
        (is (= "Total Revenue" (:name source)))))

    (testing "has dimensions as nodes"
      (is (= 2 (count (:dimensions ast))))
      (is (every? #(= :ast/dimension (:node/type %)) (:dimensions ast)))
      (is (= uuid-1 (get-in ast [:dimensions 0 :id]))))

    (testing "has mappings as nodes"
      (is (= 2 (count (:mappings ast))))
      (is (every? #(= :ast/dimension-mapping (:node/type %)) (:mappings ast))))))

(deftest ^:parallel from-definition-measure-test
  (let [measure-def {:lib/type          :metric/definition
                     :source            {:type     :source/measure
                                         :id       99
                                         :metadata (sample-measure-metadata)}
                     :filters           []
                     :projections       []
                     :metadata-provider meta/metadata-provider}
        ast         (ast.build/from-definition measure-def)]

    (testing "creates valid AST for measure"
      (is (nil? (me/humanize (mr/explain ::ast.schema/ast ast)))))

    (testing "has measure source type"
      (is (= :source/measure (get-in ast [:source :node/type]))))

    (testing "extracts sum aggregation"
      (is (= :aggregation/sum (get-in ast [:source :aggregation :node/type]))))))

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
      ;; Binning strategy value stays as string since it's a value, not a keyword
      (is (= {:node/type    :ast/dimension-ref
              :dimension-id uuid-1
              :options      {:binning {:strategy "default"}}}
             result)))))

;;; -------------------------------------------------- Filter Conversion --------------------------------------------------

(deftest ^:parallel mbql-filter->ast-filter-comparison-test
  (testing "converts comparison filters"
    (doseq [op [:= :!= :< :<= :> :>=]]
      (let [result (ast.build/mbql-filter->ast-filter [op {} [:dimension {} uuid-1] 42])]
        (is (= :filter/comparison (:node/type result)))
        (is (= op (:operator result)))
        (is (= uuid-1 (get-in result [:dimension :dimension-id])))
        (is (= 42 (:value result)))))))

(deftest ^:parallel mbql-filter->ast-filter-between-test
  (testing "converts between filter"
    (let [result (ast.build/mbql-filter->ast-filter [:between {} [:dimension {} uuid-1] 10 100])]
      (is (= :filter/between (:node/type result)))
      (is (= uuid-1 (get-in result [:dimension :dimension-id])))
      (is (= 10 (:min result)))
      (is (= 100 (:max result))))))

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
      (is (= :day (:unit result))))))

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
                                       :filters [[:= {} [:dimension {} uuid-1] 42]])
        ast (ast.build/from-definition definition-with-filters)]

    (testing "creates valid AST structure with filter"
      (is (nil? (me/humanize (mr/explain ::ast.schema/ast ast)))))

    (testing "has filter node"
      (is (some? (:filter ast)))
      (is (= :filter/comparison (get-in ast [:filter :node/type])))
      (is (= := (get-in ast [:filter :operator]))))))

(deftest ^:parallel from-definition-with-projections-test
  (let [definition-with-projections (assoc (sample-definition)
                                           :projections [[:dimension {} uuid-1]
                                                         [:dimension {"temporal-unit" "year"} uuid-2]])
        ast (ast.build/from-definition definition-with-projections)]

    (testing "creates valid AST structure with group-by"
      (is (nil? (me/humanize (mr/explain ::ast.schema/ast ast)))))

    (testing "has group-by dimension refs"
      (is (= 2 (count (:group-by ast))))
      (is (every? #(= :ast/dimension-ref (:node/type %)) (:group-by ast)))
      (is (= uuid-1 (get-in ast [:group-by 0 :dimension-id])))
      (is (= {:temporal-unit :year} (get-in ast [:group-by 1 :options]))))))

(deftest ^:parallel from-definition-loads-dimensions-from-source-test
  (testing "dimensions are always loaded from source metadata"
    (let [definition {:lib/type          :metric/definition
                      :source            {:type     :source/metric
                                          :id       42
                                          :metadata (sample-metric-metadata)}
                      :filters           []
                      :projections       []
                      :metadata-provider meta/metadata-provider}
          ast (ast.build/from-definition definition)]
      ;; Dimensions are loaded from source metadata (sample-metric-metadata)
      (is (= 2 (count (:dimensions ast))))
      (is (= 2 (count (:mappings ast)))))))

(ns metabase.lib-metric.ast.schema-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.error :as me]
   [metabase.lib-metric.ast.schema :as ast.schema]
   [metabase.util.malli.registry :as mr]))

;;; -------------------------------------------------- Test Data --------------------------------------------------

(def ^:private uuid-1 "550e8400-e29b-41d4-a716-446655440001")
(def ^:private uuid-2 "550e8400-e29b-41d4-a716-446655440002")

;;; -------------------------------------------------- Primitive Nodes --------------------------------------------------

(deftest ^:parallel table-node-test
  (testing "valid table nodes"
    (are [node] (nil? (me/humanize (mr/explain ::ast.schema/table-node node)))
      {:node/type :ast/table :id 1}
      {:node/type :ast/table :id 1 :name "orders"}
      {:node/type :ast/table :id 100 :name nil}))
  (testing "invalid table nodes"
    (testing "missing id"
      (is (some? (me/humanize (mr/explain ::ast.schema/table-node
                                          {:node/type :ast/table})))))
    (testing "invalid id"
      (is (some? (me/humanize (mr/explain ::ast.schema/table-node
                                          {:node/type :ast/table :id 0})))))
    (testing "wrong node type"
      (is (some? (me/humanize (mr/explain ::ast.schema/table-node
                                          {:node/type :ast/column :id 1})))))))

(deftest ^:parallel column-node-test
  (testing "valid column nodes"
    (are [node] (nil? (me/humanize (mr/explain ::ast.schema/column-node node)))
      {:node/type :ast/column :id 1}
      {:node/type :ast/column :id 1 :name "category"}
      {:node/type :ast/column :id 1 :name "price" :table-id 10}
      {:node/type :ast/column :id 1 :name nil :table-id nil}))
  (testing "invalid column nodes"
    (testing "missing id"
      (is (some? (me/humanize (mr/explain ::ast.schema/column-node
                                          {:node/type :ast/column})))))
    (testing "invalid table-id"
      (is (some? (me/humanize (mr/explain ::ast.schema/column-node
                                          {:node/type :ast/column :id 1 :table-id -1})))))))

;;; -------------------------------------------------- Dimension Nodes --------------------------------------------------

(deftest ^:parallel dimension-node-test
  (testing "valid dimension nodes"
    (are [node] (nil? (me/humanize (mr/explain ::ast.schema/dimension-node node)))
      {:node/type :ast/dimension :id uuid-1}
      {:node/type :ast/dimension :id uuid-1 :name "category"}
      {:node/type      :ast/dimension
       :id             uuid-1
       :name           "category"
       :display-name   "Category"
       :effective-type :type/Text
       :semantic-type  :type/Category
       :status         :status/active}
      {:node/type :ast/dimension :id uuid-1 :status :status/orphaned}))
  (testing "invalid dimension nodes"
    (testing "invalid uuid"
      (is (some? (me/humanize (mr/explain ::ast.schema/dimension-node
                                          {:node/type :ast/dimension :id "not-a-uuid"})))))
    (testing "invalid status"
      (is (some? (me/humanize (mr/explain ::ast.schema/dimension-node
                                          {:node/type :ast/dimension :id uuid-1 :status :invalid})))))))

(deftest ^:parallel dimension-ref-node-test
  (testing "valid dimension ref nodes"
    (are [node] (nil? (me/humanize (mr/explain ::ast.schema/dimension-ref-node node)))
      {:node/type :ast/dimension-ref :dimension-id uuid-1}
      {:node/type    :ast/dimension-ref
       :dimension-id uuid-1
       :options      {:temporal-unit :month}}
      {:node/type    :ast/dimension-ref
       :dimension-id uuid-1
       :options      {:binning {:strategy :num-bins :num-bins 10}}}
      {:node/type    :ast/dimension-ref
       :dimension-id uuid-1
       :options      nil}))
  (testing "invalid dimension ref nodes"
    (testing "missing dimension-id"
      (is (some? (me/humanize (mr/explain ::ast.schema/dimension-ref-node
                                          {:node/type :ast/dimension-ref})))))
    (testing "invalid dimension-id"
      (is (some? (me/humanize (mr/explain ::ast.schema/dimension-ref-node
                                          {:node/type :ast/dimension-ref :dimension-id "not-a-uuid"})))))))

(deftest ^:parallel dimension-mapping-node-test
  (testing "valid dimension mapping nodes"
    (are [node] (nil? (me/humanize (mr/explain ::ast.schema/dimension-mapping-node node)))
      {:node/type    :ast/dimension-mapping
       :dimension-id uuid-1
       :column       {:node/type :ast/column :id 1}}
      {:node/type    :ast/dimension-mapping
       :dimension-id uuid-1
       :table-id     10
       :column       {:node/type :ast/column :id 1 :name "category" :table-id 10}}))
  (testing "invalid dimension mapping nodes"
    (testing "missing column"
      (is (some? (me/humanize (mr/explain ::ast.schema/dimension-mapping-node
                                          {:node/type :ast/dimension-mapping :dimension-id uuid-1})))))))

;;; -------------------------------------------------- Aggregation Nodes --------------------------------------------------

(deftest ^:parallel aggregation-node-test
  (testing "valid aggregation nodes"
    (are [node] (nil? (me/humanize (mr/explain ::ast.schema/aggregation-node node)))
      {:node/type :aggregation/count}
      {:node/type :aggregation/sum
       :column    {:node/type :ast/column :id 1}}
      {:node/type :aggregation/avg
       :column    {:node/type :ast/column :id 1}}
      {:node/type :aggregation/min
       :column    {:node/type :ast/column :id 1}}
      {:node/type :aggregation/max
       :column    {:node/type :ast/column :id 1}}
      {:node/type :aggregation/distinct
       :column    {:node/type :ast/column :id 1}}
      {:node/type :aggregation/mbql
       :clause    [:sum {} [:field {} 1]]}))
  (testing "invalid aggregation nodes"
    (testing "sum without column"
      (is (some? (me/humanize (mr/explain ::ast.schema/aggregation-node
                                          {:node/type :aggregation/sum})))))))

;;; -------------------------------------------------- Filter Nodes --------------------------------------------------

(deftest ^:parallel filter-comparison-test
  (let [dim-ref {:node/type :ast/dimension-ref :dimension-id uuid-1}]
    (testing "valid comparison filters"
      (are [node] (nil? (me/humanize (mr/explain ::ast.schema/filter-comparison node)))
        {:node/type :filter/comparison :operator := :dimension dim-ref :value "Electronics"}
        {:node/type :filter/comparison :operator :!= :dimension dim-ref :value 100}
        {:node/type :filter/comparison :operator :< :dimension dim-ref :value 50}
        {:node/type :filter/comparison :operator :<= :dimension dim-ref :value 50}
        {:node/type :filter/comparison :operator :> :dimension dim-ref :value 0}
        {:node/type :filter/comparison :operator :>= :dimension dim-ref :value 0}))
    (testing "invalid comparison filters"
      (testing "invalid operator"
        (is (some? (me/humanize (mr/explain ::ast.schema/filter-comparison
                                            {:node/type :filter/comparison
                                             :operator  :invalid
                                             :dimension dim-ref
                                             :value     1}))))))))

(deftest ^:parallel filter-between-test
  (let [dim-ref {:node/type :ast/dimension-ref :dimension-id uuid-1}]
    (testing "valid between filters"
      (are [node] (nil? (me/humanize (mr/explain ::ast.schema/filter-between node)))
        {:node/type :filter/between :dimension dim-ref :min 0 :max 100}
        {:node/type :filter/between :dimension dim-ref :min "2024-01-01" :max "2024-12-31"}))
    (testing "invalid between filters"
      (testing "missing min"
        (is (some? (me/humanize (mr/explain ::ast.schema/filter-between
                                            {:node/type :filter/between
                                             :dimension dim-ref
                                             :max       100}))))))))

(deftest ^:parallel filter-string-test
  (let [dim-ref {:node/type :ast/dimension-ref :dimension-id uuid-1}]
    (testing "valid string filters"
      (are [node] (nil? (me/humanize (mr/explain ::ast.schema/filter-string node)))
        {:node/type :filter/string :operator :contains :dimension dim-ref :value "foo"}
        {:node/type :filter/string :operator :starts-with :dimension dim-ref :value "bar"}
        {:node/type :filter/string :operator :ends-with :dimension dim-ref :value "baz"}
        {:node/type :filter/string
         :operator  :does-not-contain
         :dimension dim-ref
         :value     "qux"
         :options   {:case-sensitive false}}))
    (testing "invalid string filters"
      (testing "non-string value"
        (is (some? (me/humanize (mr/explain ::ast.schema/filter-string
                                            {:node/type :filter/string
                                             :operator  :contains
                                             :dimension dim-ref
                                             :value     123}))))))))

(deftest ^:parallel filter-null-test
  (let [dim-ref {:node/type :ast/dimension-ref :dimension-id uuid-1}]
    (testing "valid null filters"
      (are [node] (nil? (me/humanize (mr/explain ::ast.schema/filter-null node)))
        {:node/type :filter/null :operator :is-null :dimension dim-ref}
        {:node/type :filter/null :operator :not-null :dimension dim-ref}
        {:node/type :filter/null :operator :is-empty :dimension dim-ref}
        {:node/type :filter/null :operator :not-empty :dimension dim-ref}))))

(deftest ^:parallel filter-in-test
  (let [dim-ref {:node/type :ast/dimension-ref :dimension-id uuid-1}]
    (testing "valid in filters"
      (are [node] (nil? (me/humanize (mr/explain ::ast.schema/filter-in node)))
        {:node/type :filter/in :operator :in :dimension dim-ref :values ["a" "b" "c"]}
        {:node/type :filter/in :operator :not-in :dimension dim-ref :values [1 2 3]}
        {:node/type :filter/in :operator :in :dimension dim-ref :values []}))))

(deftest ^:parallel filter-temporal-test
  (let [dim-ref {:node/type :ast/dimension-ref :dimension-id uuid-1}]
    (testing "valid temporal filters"
      (are [node] (nil? (me/humanize (mr/explain ::ast.schema/filter-temporal node)))
        {:node/type :filter/temporal
         :operator  :time-interval
         :dimension dim-ref
         :value     -30
         :unit      :day}
        {:node/type :filter/temporal
         :operator  :relative-time-interval
         :dimension dim-ref
         :value     -7
         :unit      :week}))))

(deftest ^:parallel filter-compound-test
  (let [dim-ref {:node/type :ast/dimension-ref :dimension-id uuid-1}
        filter-a {:node/type :filter/comparison :operator := :dimension dim-ref :value 1}
        filter-b {:node/type :filter/comparison :operator :> :dimension dim-ref :value 0}]
    (testing "valid compound filters"
      (are [node] (nil? (me/humanize (mr/explain ::ast.schema/filter-node node)))
        {:node/type :filter/and :children [filter-a filter-b]}
        {:node/type :filter/or :children [filter-a filter-b]}
        {:node/type :filter/not :child filter-a}
        ;; Nested compound
        {:node/type :filter/and
         :children  [{:node/type :filter/or :children [filter-a filter-b]}
                     {:node/type :filter/not :child filter-a}]}))))

;;; -------------------------------------------------- Source Nodes --------------------------------------------------

(deftest ^:parallel source-metric-test
  (testing "valid source metric nodes"
    (are [node] (nil? (me/humanize (mr/explain ::ast.schema/source-metric node)))
      {:node/type   :source/metric
       :id          1
       :aggregation {:node/type :aggregation/count}
       :base-table  {:node/type :ast/table :id 1}}
      {:node/type   :source/metric
       :id          1
       :name        "Revenue"
       :aggregation {:node/type :aggregation/sum
                     :column    {:node/type :ast/column :id 10}}
       :base-table  {:node/type :ast/table :id 1 :name "orders"}})))

(deftest ^:parallel source-measure-test
  (testing "valid source measure nodes"
    (are [node] (nil? (me/humanize (mr/explain ::ast.schema/source-measure node)))
      {:node/type   :source/measure
       :id          1
       :aggregation {:node/type :aggregation/count}
       :base-table  {:node/type :ast/table :id 1}})))

;;; -------------------------------------------------- Root Node --------------------------------------------------

(deftest ^:parallel ast-root-test
  (let [source {:node/type   :source/metric
                :id          1
                :aggregation {:node/type :aggregation/count}
                :base-table  {:node/type :ast/table :id 1}}
        dim    {:node/type :ast/dimension :id uuid-1}
        mapping {:node/type    :ast/dimension-mapping
                 :dimension-id uuid-1
                 :column       {:node/type :ast/column :id 1}}]
    (testing "valid root AST"
      (are [node] (nil? (me/humanize (mr/explain ::ast.schema/ast node)))
        {:node/type  :ast/root
         :source     source
         :dimensions []
         :mappings   []}
        {:node/type  :ast/root
         :source     source
         :dimensions [dim]
         :mappings   [mapping]
         :filter     nil
         :group-by   []}
        {:node/type  :ast/root
         :source     source
         :dimensions [dim]
         :mappings   [mapping]
         :filter     {:node/type :filter/comparison
                      :operator  :=
                      :dimension {:node/type :ast/dimension-ref :dimension-id uuid-1}
                      :value     "test"}
         :group-by   [{:node/type :ast/dimension-ref :dimension-id uuid-1}]}))
    (testing "invalid root AST"
      (testing "missing source"
        (is (some? (me/humanize (mr/explain ::ast.schema/ast
                                            {:node/type  :ast/root
                                             :dimensions []
                                             :mappings   []}))))))))

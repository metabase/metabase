(ns metabase.lib-metric.ast.plan-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-metric.ast.plan :as ast.plan]))

;;; -------------------------------------------------- Test Data --------------------------------------------------

(def ^:private uuid-a "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
(def ^:private uuid-b "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
(def ^:private uuid-c "cccccccc-cccc-cccc-cccc-cccccccccccc")
(def ^:private dim-1  "dddddddd-dddd-dddd-dddd-dddddddddd01")
(def ^:private dim-2  "dddddddd-dddd-dddd-dddd-dddddddddd02")

(defn- make-leaf-ast
  "Build a minimal single-source AST for testing.
   Includes dimension mappings so compile-to-mbql can resolve dimension refs."
  [group-by-dim-ids]
  {:node/type  :ast/source-query
   :source     {:node/type   :source/metric
                :id          1
                :name        "test"
                :aggregation {:node/type :aggregation/count}
                :base-table  {:node/type :ast/table :id 1}
                :metadata    {:dataset-query {:database 1}}}
   :dimensions (mapv (fn [dim-id] {:node/type :ast/dimension :id dim-id}) group-by-dim-ids)
   :mappings   (mapv (fn [dim-id]
                       {:node/type    :ast/dimension-mapping
                        :dimension-id dim-id
                        :column       {:node/type :ast/column :id 100}})
                     group-by-dim-ids)
   :group-by   (mapv (fn [dim-id] {:node/type :ast/dimension-ref :dimension-id dim-id})
                     group-by-dim-ids)})

(defn- make-expression-leaf
  ([uuid group-by-dim-ids]
   {:node/type :expression/leaf
    :uuid      uuid
    :ast       (make-leaf-ast group-by-dim-ids)})
  ([uuid group-by-dim-ids dim-opts]
   {:node/type :expression/leaf
    :uuid      uuid
    :ast       (-> (make-leaf-ast group-by-dim-ids)
                   (update :dimensions
                           (fn [dims]
                             (mapv (fn [dim]
                                     (merge dim (get dim-opts (:id dim))))
                                   dims)))
                   (update :group-by
                           (fn [refs]
                             (mapv (fn [ref]
                                     (if-let [opts (get dim-opts (:dimension-id ref))]
                                       (cond-> ref
                                         (:temporal-unit opts) (assoc-in [:options :temporal-unit] (:temporal-unit opts)))
                                       ref))
                                   refs))))}))

(defn- make-expression-arithmetic [op children]
  {:node/type :expression/arithmetic
   :operator  op
   :children  children})

;;; -------------------------------------------------- evaluate-expression --------------------------------------------------

(deftest ^:parallel evaluate-expression-addition-test
  (testing "addition of two leaves"
    (let [expr (make-expression-arithmetic :+ [(make-expression-leaf uuid-a [])
                                               (make-expression-leaf uuid-b [])])]
      (is (= 30 (ast.plan/evaluate-expression expr {uuid-a 10 uuid-b 20}))))))

(deftest ^:parallel evaluate-expression-subtraction-test
  (testing "subtraction of two leaves"
    (let [expr (make-expression-arithmetic :- [(make-expression-leaf uuid-a [])
                                               (make-expression-leaf uuid-b [])])]
      (is (= -10 (ast.plan/evaluate-expression expr {uuid-a 10 uuid-b 20}))))))

(deftest ^:parallel evaluate-expression-multiplication-test
  (testing "multiplication of two leaves"
    (let [expr (make-expression-arithmetic :* [(make-expression-leaf uuid-a [])
                                               (make-expression-leaf uuid-b [])])]
      (is (= 200 (ast.plan/evaluate-expression expr {uuid-a 10 uuid-b 20}))))))

(deftest ^:parallel evaluate-expression-division-test
  (testing "division of two leaves"
    (let [expr (make-expression-arithmetic :/ [(make-expression-leaf uuid-a [])
                                               (make-expression-leaf uuid-b [])])]
      (is (= 0.5 (ast.plan/evaluate-expression expr {uuid-a 10 uuid-b 20}))))))

(deftest ^:parallel evaluate-expression-nested-test
  (testing "nested expression (a + b) * c"
    (let [inner (make-expression-arithmetic :+ [(make-expression-leaf uuid-a [])
                                                (make-expression-leaf uuid-b [])])
          expr  (make-expression-arithmetic :* [inner
                                                (make-expression-leaf uuid-c [])])]
      (is (= 150 (ast.plan/evaluate-expression expr {uuid-a 10 uuid-b 20 uuid-c 5}))))))

(deftest ^:parallel evaluate-expression-nil-propagation-test
  (testing "nil input propagates as nil"
    (let [expr (make-expression-arithmetic :+ [(make-expression-leaf uuid-a [])
                                               (make-expression-leaf uuid-b [])])]
      (is (nil? (ast.plan/evaluate-expression expr {uuid-a 10 uuid-b nil})))
      (is (nil? (ast.plan/evaluate-expression expr {uuid-a nil uuid-b 20})))
      (is (nil? (ast.plan/evaluate-expression expr {uuid-a 10}))))))

(deftest ^:parallel evaluate-expression-constant-test
  (testing "constant node returns its value"
    (is (= 42 (ast.plan/evaluate-expression {:node/type :expression/constant :value 42} {})))))

(deftest ^:parallel evaluate-expression-leaf-times-constant-test
  (testing "leaf * constant evaluates correctly"
    (let [expr (make-expression-arithmetic :* [(make-expression-leaf uuid-a [])
                                               {:node/type :expression/constant :value 100}])]
      (is (= 500 (ast.plan/evaluate-expression expr {uuid-a 5}))))))

(deftest ^:parallel validate-arithmetic-ast-with-constants-test
  (testing "arithmetic with constants + leaves with projections passes validation"
    (let [expr (make-expression-arithmetic :* [(make-expression-leaf uuid-a [dim-1])
                                               {:node/type :expression/constant :value 100}])]
      (is (nil? (ast.plan/validate-arithmetic-ast! expr))))))

(deftest ^:parallel evaluate-expression-division-by-zero-test
  (testing "division by zero returns nil"
    (let [expr (make-expression-arithmetic :/ [(make-expression-leaf uuid-a [])
                                               (make-expression-leaf uuid-b [])])]
      (is (nil? (ast.plan/evaluate-expression expr {uuid-a 10 uuid-b 0}))))))

;;; -------------------------------------------------- index-result-by-dimensions --------------------------------------------------

(deftest ^:parallel index-result-by-dimensions-no-breakouts-test
  (testing "no breakout columns — single row, empty key"
    (let [result {:data {:rows [[42]]}}]
      (is (= {[] 42} (ast.plan/index-result-by-dimensions result 0))))))

(deftest ^:parallel index-result-by-dimensions-with-breakouts-test
  (testing "two breakout columns"
    (let [result {:data {:rows [["US" "NY" 100]
                                ["US" "CA" 200]
                                ["UK" "London" 50]]}}]
      (is (= {["US" "NY"] 100
              ["US" "CA"] 200
              ["UK" "London"] 50}
             (ast.plan/index-result-by-dimensions result 2))))))

;;; -------------------------------------------------- join-and-compute --------------------------------------------------

(deftest ^:parallel join-and-compute-inner-join-test
  (testing "inner join semantics — only matching dimension tuples"
    (let [expr (make-expression-arithmetic :+ [(make-expression-leaf uuid-a [dim-1])
                                               (make-expression-leaf uuid-b [dim-1])])
          leaf-results {uuid-a {:data {:cols [{:name "dim1"} {:name "count"}]
                                       :rows [["X" 10] ["Y" 20] ["Z" 30]]}}
                        uuid-b {:data {:cols [{:name "dim1"} {:name "count"}]
                                       :rows [["X" 100] ["Y" 200] ["W" 400]]}}}
          result (ast.plan/join-and-compute expr leaf-results 1)]
      (is (= [["X" 110] ["Y" 220]]
             (:rows result))))))

(deftest ^:parallel join-and-compute-empty-results-test
  (testing "no matching tuples returns empty rows"
    (let [expr (make-expression-arithmetic :+ [(make-expression-leaf uuid-a [dim-1])
                                               (make-expression-leaf uuid-b [dim-1])])
          leaf-results {uuid-a {:data {:cols [{:name "dim1"} {:name "count"}]
                                       :rows [["X" 10]]}}
                        uuid-b {:data {:cols [{:name "dim1"} {:name "count"}]
                                       :rows [["Y" 20]]}}}
          result (ast.plan/join-and-compute expr leaf-results 1)]
      (is (= [] (:rows result))))))

;;; -------------------------------------------------- validate-arithmetic-ast! --------------------------------------------------

(deftest ^:parallel validate-arithmetic-ast-mismatched-dims-test
  (testing "throws 400 when leaves have different number of breakout dimensions"
    (let [expr (make-expression-arithmetic :+ [(make-expression-leaf uuid-a [dim-1])
                                               (make-expression-leaf uuid-b [dim-1 dim-2])])]
      (is (thrown-with-msg?
           #?(:clj clojure.lang.ExceptionInfo :cljs js/Error)
           #"same number of breakout"
           (ast.plan/validate-arithmetic-ast! expr))))))

(deftest ^:parallel validate-arithmetic-ast-mismatched-types-test
  (testing "throws 400 when leaves have same count but different dimension types"
    (let [expr (make-expression-arithmetic
                :+ [(make-expression-leaf uuid-a [dim-1] {dim-1 {:effective-type :type/Integer}})
                    (make-expression-leaf uuid-b [dim-1] {dim-1 {:effective-type :type/Text}})])]
      (is (thrown-with-msg?
           #?(:clj clojure.lang.ExceptionInfo :cljs js/Error)
           #"same breakout dimension types"
           (ast.plan/validate-arithmetic-ast! expr))))))

(deftest ^:parallel validate-arithmetic-ast-compatible-datetime-types-test
  (testing "accepts compatible date/datetime types across different databases"
    (let [expr (make-expression-arithmetic
                :+ [(make-expression-leaf uuid-a [dim-1] {dim-1 {:effective-type :type/Date}})
                    (make-expression-leaf uuid-b [dim-1] {dim-1 {:effective-type :type/DateTimeWithLocalTZ}})])]
      (is (nil? (ast.plan/validate-arithmetic-ast! expr)))))
  (testing "rejects incompatible temporal types (date vs time)"
    (let [expr (make-expression-arithmetic
                :+ [(make-expression-leaf uuid-a [dim-1] {dim-1 {:effective-type :type/Date}})
                    (make-expression-leaf uuid-b [dim-1] {dim-1 {:effective-type :type/Time}})])]
      (is (thrown-with-msg?
           #?(:clj clojure.lang.ExceptionInfo :cljs js/Error)
           #"same breakout dimension types"
           (ast.plan/validate-arithmetic-ast! expr))))))

(deftest ^:parallel validate-arithmetic-ast-valid-test
  (testing "valid arithmetic AST passes validation"
    (let [expr (make-expression-arithmetic :+ [(make-expression-leaf uuid-a [dim-1])
                                               (make-expression-leaf uuid-b [dim-1])])]
      (is (nil? (ast.plan/validate-arithmetic-ast! expr))))))

;;; -------------------------------------------------- plan-from-ast --------------------------------------------------

(deftest ^:parallel plan-from-ast-leaf-test
  (testing "single-source AST produces :leaf plan"
    (let [ast  {:node/type  :ast/root
                :expression {:node/type :expression/leaf
                             :uuid      uuid-a
                             :ast       (make-leaf-ast [dim-1])}}
          plan (ast.plan/plan-from-ast ast)]
      (is (= :leaf (:plan/type plan)))
      (is (some? (:plan/mbql plan))))))

(deftest ^:parallel plan-from-ast-arithmetic-test
  (testing "arithmetic AST produces :arithmetic plan"
    (let [expr (make-expression-arithmetic :+ [(make-expression-leaf uuid-a [dim-1])
                                               (make-expression-leaf uuid-b [dim-1])])
          ast  {:node/type  :ast/root
                :expression expr}
          plan (ast.plan/plan-from-ast ast)]
      (is (= :arithmetic (:plan/type plan)))
      (is (= 2 (count (:plan/leaves plan))))
      (is (= 1 (:plan/breakout-count plan)))
      (is (contains? (:plan/leaves plan) uuid-a))
      (is (contains? (:plan/leaves plan) uuid-b)))))

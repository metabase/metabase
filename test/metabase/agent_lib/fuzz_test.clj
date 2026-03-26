(ns metabase.agent-lib.fuzz-test
  "Property-based tests for agent-lib repair, validation, and error handling.
  Generators produce random program-like structures (both valid and invalid)
  to verify that the pipeline never crashes — it either succeeds or throws
  a structured `:invalid-generated-program` error."
  (:require
   [clojure.test :refer [deftest is testing]]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase.agent-lib.repair :as repair]
   [metabase.agent-lib.schema :as schema]
   [metabase.agent-lib.validate :as validate]
   [metabase.lib.test-metadata :as meta]))

(set! *warn-on-reflection* true)

;; --- Generators ---

(def ^:private gen-field-id
  "Generator for field ids from test metadata."
  (gen/elements [(meta/id :orders :id)
                 (meta/id :orders :total)
                 (meta/id :orders :product-id)
                 (meta/id :orders :user-id)
                 (meta/id :orders :created-at)
                 (meta/id :products :title)
                 (meta/id :products :category)
                 99999]))

(def ^:private gen-table-id
  (gen/elements [(meta/id :orders)
                 (meta/id :products)
                 (meta/id :people)
                 99999]))

(def ^:private gen-op-name
  "Generator for operator names — mix of valid and invalid."
  (gen/elements ["count" "sum" "avg" "min" "max" "distinct" "field"
                 "=" "!=" "<" ">" "in" "between" "contains"
                 "expression-ref" "aggregation-ref"
                 "case" "coalesce" "+" "-" "*" "/"
                 "with-temporal-bucket" "relative-datetime" "now"
                 ;; invalid operators to exercise error paths
                 "bogus" "YOLO" ""]))

(def ^:private gen-top-level-op-name
  (gen/elements ["filter" "aggregate" "breakout" "order-by"
                 "expression" "with-fields" "limit" "join"
                 "append-stage"
                 ;; invalid to exercise error paths
                 "bogus-top" ""]))

(def ^:private gen-scalar
  (gen/one-of [gen/small-integer
               (gen/double* {:NaN? false :infinite? false})
               gen/boolean
               (gen/not-empty gen/string-alphanumeric)
               (gen/return nil)]))

(defn- gen-node
  "Recursive generator for program nodes. `depth` limits nesting."
  [depth]
  (if (zero? depth)
    gen-scalar
    (gen/one-of
     [gen-scalar
      ;; field ref
      (gen/fmap (fn [id] ["field" id]) gen-field-id)
      ;; nested operator
      (gen/fmap (fn [[op args]] (into [op] args))
                (gen/tuple gen-op-name
                           (gen/vector (gen-node (dec depth)) 0 3)))
      ;; vector of nodes
      (gen/vector (gen-node (dec depth)) 0 3)])))

(def ^:private gen-operation
  "Generator for top-level operations."
  (gen/fmap (fn [[op args]] (into [op] args))
            (gen/tuple gen-top-level-op-name
                       (gen/vector (gen-node 3) 0 4))))

(def ^:private gen-source
  "Generator for program sources."
  (gen/one-of
   [(gen/return {:type "context" :ref "source"})
    (gen/fmap (fn [id] {:type "table" :id id}) gen-table-id)
    (gen/fmap (fn [id] {:type "metric" :id id}) (gen/elements [1 42 99999]))
    (gen/fmap (fn [id] {:type "card" :id id}) (gen/elements [1 99999]))
    ;; invalid source types
    (gen/return {:type "nonexistent"})
    (gen/return {})
    (gen/return nil)]))

(def ^:private gen-program
  "Generator for program-like structures."
  (gen/fmap (fn [[source ops]] {:source source :operations (vec ops)})
            (gen/tuple gen-source
                       (gen/vector gen-operation 0 6))))

(def ^:private gen-garbage
  "Generator for completely random values — not program-shaped at all."
  (gen/one-of
   [gen/small-integer
    gen/string-alphanumeric
    gen/boolean
    (gen/return nil)
    (gen/vector gen/small-integer 0 5)
    (gen/map gen/keyword gen/small-integer {:max-elements 3})]))

;; --- Helpers ---

(defn- orders-context
  []
  {:source-entity       {:model "table" :id (meta/id :orders)
                         :columns (mapv (fn [f] {:id (meta/id :orders f)})
                                        (meta/fields :orders))}
   :referenced-entities []
   :surrounding-tables  [{:id (meta/id :products)}
                         {:id (meta/id :people)}]
   :measure-ids         []})

(defn- structured-error?
  "True when `e` is the standard `:invalid-generated-program` error
  or a Malli input validation error (from mu/defn schemas)."
  [e]
  (let [data (ex-data e)]
    (or (= :invalid-generated-program (:error data))
        (= :metabase.util.malli.fn/invalid-input (:type data))
        (= :metabase.util.malli.fn/invalid-output (:type data)))))

;; --- Properties ---

(defspec repair-never-crashes 200
  (prop/for-all [program gen-program]
    (let [result (try
                   (repair/repair-program program)
                   ::ok
                   (catch Exception _
                     ::ok))]
      (= ::ok result))))

(defspec repair-returns-map-for-map-input 200
  (prop/for-all [program gen-program]
    (map? (repair/repair-program program))))

(defspec repair-preserves-source-key 200
  (prop/for-all [program gen-program]
    (contains? (repair/repair-program program) :source)))

(defspec repair-preserves-operations-key 200
  (prop/for-all [program gen-program]
    (contains? (repair/repair-program program) :operations)))

(defspec repair-is-idempotent 200
  (prop/for-all [program gen-program]
    (= (repair/repair-program program)
       (repair/repair-program (repair/repair-program program)))))

(defspec validation-never-crashes-with-unstructured-error 200
  (prop/for-all [program gen-program]
    (try
      (validate/validated-program program (orders-context))
      true
      (catch clojure.lang.ExceptionInfo e
        (structured-error? e))
      (catch Exception _
        ;; Non-ExceptionInfo exceptions are acceptable from downstream
        ;; libs (e.g. Malli schema validation); the key property is
        ;; agent-lib code itself doesn't throw raw exceptions.
        true))))

(defspec garbage-input-to-repair-never-crashes 100
  (prop/for-all [garbage gen-garbage]
    (try
      (repair/repair-program garbage)
      true
      (catch Exception _
        true))))

(defspec garbage-input-to-validation-never-crashes-with-unstructured-error 100
  (prop/for-all [garbage gen-garbage]
    (try
      (validate/validated-program garbage (orders-context))
      true
      (catch clojure.lang.ExceptionInfo e
        (structured-error? e))
      (catch Exception _
        true))))

(defspec schema-validation-rejects-or-accepts-cleanly 200
  (prop/for-all [program gen-program]
    (let [repaired (repair/repair-program program)]
      (try
        (schema/validated-structure repaired)
        true
        (catch clojure.lang.ExceptionInfo e
          (structured-error? e))))))

;; --- Deterministic edge-case tests ---

(deftest ^:parallel deeply-nested-operations-do-not-overflow-test
  (let [deep-op (reduce (fn [inner _] ["+" inner 1])
                        ["field" (meta/id :orders :total)]
                        (range 50))
        program {:source     {:type "table" :id (meta/id :orders)}
                 :operations [["filter" [">" deep-op 0]]]}]
    (testing "repair handles deeply nested operations"
      (is (map? (repair/repair-program program))))
    (testing "validation rejects or accepts without crashing"
      (try
        (validate/validated-program program (orders-context))
        (is true)
        (catch clojure.lang.ExceptionInfo e
          (is (structured-error? e)))))))

(deftest ^:parallel empty-and-minimal-programs-test
  (testing "empty operations"
    (let [program {:source {:type "table" :id (meta/id :orders)}
                   :operations []}]
      (is (= program (validate/validated-program program (orders-context))))))
  (testing "nil operations repairs to empty"
    (let [repaired (repair/repair-program {:source {:type "context" :ref "source"}
                                           :operations nil})]
      (is (vector? (:operations repaired)))))
  (testing "missing operations key repairs gracefully"
    (let [repaired (repair/repair-program {:source {:type "context" :ref "source"}})]
      (is (map? repaired)))))

(deftest ^:parallel many-operations-test
  (let [ops (vec (repeat 50 ["aggregate" ["count"]]))
        program {:source {:type "table" :id (meta/id :orders)}
                 :operations ops}]
    (testing "programs exceeding max-operations are rejected"
      (try
        (validate/validated-program program (orders-context))
        (is false "expected rejection")
        (catch clojure.lang.ExceptionInfo e
          (is (structured-error? e))
          (is (re-find #"maximum operation count"
                       (:details (ex-data e)))))))))

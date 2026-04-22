(ns metabase.agent-lib.representations-test
  "Tests for the representations YAML parser + structural validator."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.representations :as repr]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; Phase-1 YAML fixtures (strings as an LLM would write them)
;;; ============================================================

(def ^:private yaml-simple-count
  "Smallest valid query: count of rows from a single table."
  "lib/type: mbql/query
database: Sample
stages:
  - lib/type: mbql.stage/mbql
    source-table: [Sample, PUBLIC, ORDERS]
    aggregation:
      - [count, {}]
")

(def ^:private yaml-filter-breakout
  "Aggregation + breakout + filter."
  "lib/type: mbql/query
database: Sample
stages:
  - lib/type: mbql.stage/mbql
    source-table: [Sample, PUBLIC, ORDERS]
    filters:
      - ['>',
         {},
         [field, {}, [Sample, PUBLIC, ORDERS, TOTAL]],
         100]
    aggregation:
      - [count, {}]
    breakout:
      - [field, {temporal-unit: month}, [Sample, PUBLIC, ORDERS, CREATED_AT]]
    limit: 10
")

(def ^:private yaml-explicit-join
  "Explicit join — products joined under an alias."
  "lib/type: mbql/query
database: Sample
stages:
  - lib/type: mbql.stage/mbql
    source-table: [Sample, PUBLIC, ORDERS]
    joins:
      - alias: Products
        strategy: left-join
        stages:
          - lib/type: mbql.stage/mbql
            source-table: [Sample, PUBLIC, PRODUCTS]
        conditions:
          - ['=',
             {},
             [field, {}, [Sample, PUBLIC, ORDERS, PRODUCT_ID]],
             [field, {join-alias: Products}, [Sample, PUBLIC, PRODUCTS, ID]]]
    aggregation:
      - [count, {}]
    breakout:
      - [field, {join-alias: Products}, [Sample, PUBLIC, PRODUCTS, CATEGORY]]
")

(def ^:private yaml-schemaless-table
  "Schemaless databases use `null` for the schema slot."
  "lib/type: mbql/query
database: Mongo
stages:
  - lib/type: mbql.stage/mbql
    source-table: [Mongo, null, orders]
    aggregation:
      - [count, {}]
")

;;; ============================================================
;;; parse-yaml
;;; ============================================================

(deftest parse-yaml-test
  (testing "parses a valid YAML query preserving string keys"
    (let [parsed (repr/parse-yaml yaml-simple-count)]
      (is (= "mbql/query" (get parsed "lib/type")))
      (is (= "Sample" (get parsed "database")))
      (is (vector? (get parsed "stages")))
      (is (= "mbql.stage/mbql" (get-in parsed ["stages" 0 "lib/type"])))
      (is (= ["Sample" "PUBLIC" "ORDERS"]
             (get-in parsed ["stages" 0 "source-table"])))))
  (testing "options stay as empty maps, not nil"
    (let [parsed (repr/parse-yaml yaml-simple-count)
          agg0   (get-in parsed ["stages" 0 "aggregation" 0])]
      (is (vector? agg0))
      (is (= "count" (first agg0)))
      (is (map? (second agg0)))
      (is (= {} (second agg0)))))
  (testing "null schema survives YAML parsing"
    (let [parsed (repr/parse-yaml yaml-schemaless-table)]
      (is (= ["Mongo" nil "orders"]
             (get-in parsed ["stages" 0 "source-table"])))))
  (testing "non-string input is rejected"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"must be a YAML string"
                          #_:clj-kondo/ignore
                          (repr/parse-yaml {"lib/type" "mbql/query"}))))
  (testing "malformed YAML produces :invalid-representations-yaml"
    (try
      (repr/parse-yaml "lib/type: mbql/query\nstages: [unclosed")
      (is false "expected parse to throw")
      (catch clojure.lang.ExceptionInfo e
        (is (= :invalid-representations-yaml (:error (ex-data e))))
        (is (= 400 (:status-code (ex-data e))))))))

;;; ============================================================
;;; validate-query — happy paths
;;; ============================================================

(deftest validate-query-happy-path-test
  (testing "valid simple aggregation query"
    (let [parsed (repr/parse-yaml yaml-simple-count)]
      (is (= parsed (repr/validate-query parsed)))))
  (testing "valid filter + aggregation + breakout + limit"
    (let [parsed (repr/parse-yaml yaml-filter-breakout)]
      (is (= parsed (repr/validate-query parsed)))))
  (testing "valid explicit join"
    (let [parsed (repr/parse-yaml yaml-explicit-join)]
      (is (= parsed (repr/validate-query parsed)))))
  (testing "valid schemaless table FK (null schema)"
    (let [parsed (repr/parse-yaml yaml-schemaless-table)]
      (is (= parsed (repr/validate-query parsed))))))

;;; ============================================================
;;; validate-query — error paths
;;; ============================================================

(defn- validate-error [parsed]
  (try
    (repr/validate-query parsed)
    nil
    (catch clojure.lang.ExceptionInfo e
      (ex-data e))))

(deftest validate-query-error-paths-test
  (testing "missing lib/type on query"
    (let [parsed (repr/parse-yaml "database: Sample
stages:
  - lib/type: mbql.stage/mbql
    source-table: [Sample, PUBLIC, ORDERS]
    aggregation:
      - [count, {}]
")
          data (validate-error parsed)]
      (is (= :invalid-representations-query (:error data)))
      (is (= 400 (:status-code data)))))
  (testing "wrong lib/type value on query"
    (let [parsed {"lib/type" "mbql/wrong"
                  "database" "Sample"
                  "stages"   [{"lib/type" "mbql.stage/mbql"}]}]
      (is (some? (validate-error parsed)))))
  (testing "empty stages"
    (let [parsed {"lib/type" "mbql/query"
                  "database" "Sample"
                  "stages"   []}]
      (is (some? (validate-error parsed)))))
  (testing "table FK too short"
    (let [parsed {"lib/type" "mbql/query"
                  "database" "Sample"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC"]}]}]
      (is (some? (validate-error parsed)))))
  ;; Note: deep structural validation of FK-vectors *inside* clauses (e.g. ensuring a field
  ;; ref's 3rd slot is a 4+-element field FK) is intentionally deferred to the resolver /
  ;; lib.schema step — our malli schema here validates clause *shape* only (head + options map).
  (testing "missing options map on a clause (LLM-style mistake: nil in slot 1)"
    (let [parsed {"lib/type" "mbql/query"
                  "database" "Sample"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "aggregation"  [["count" nil]]}]}]
      (is (some? (validate-error parsed)))))
  (testing "clause head must be a non-blank string"
    (let [parsed {"lib/type" "mbql/query"
                  "database" "Sample"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "aggregation"  [["" {}]]}]}]
      (is (some? (validate-error parsed))))))

;;; ============================================================
;;; parse-and-validate
;;; ============================================================

(deftest parse-and-validate-test
  (testing "returns parsed data when both parse and validate succeed"
    (let [result (repr/parse-and-validate yaml-simple-count)]
      (is (= "mbql/query" (get result "lib/type")))))
  (testing "surfaces parse errors"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Failed to parse representations YAML"
                          (repr/parse-and-validate "bad: [yaml"))))
  (testing "surfaces validation errors"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"invalid structure"
                          (repr/parse-and-validate "lib/type: mbql/query
database: Sample
stages: []
")))))

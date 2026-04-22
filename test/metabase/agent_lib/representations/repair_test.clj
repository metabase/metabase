(ns metabase.agent-lib.representations.repair-test
  "Tests for the LLM-input repair pass."
  (:require
   [clojure.test :refer [deftest is testing]]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase.agent-lib.representations :as repr]
   [metabase.agent-lib.representations.repair :as repair]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; Pass 1 \u2014 insert `{}` options on clauses
;;; ============================================================

(deftest insert-options-on-bare-clause-test
  (testing "clause without options gets {} inserted"
    (is (= ["count" {}]
           (repair/repair ["count"])))
    (is (= ["sum" {} ["field" {} ["DB" "S" "T" "F"]]]
           (repair/repair ["sum" ["field" ["DB" "S" "T" "F"]]])))))

(deftest do-not-corrupt-fk-paths-test
  (testing "FK paths (all-string vectors) are left alone"
    (let [fk ["DB" "PUBLIC" "TBL" "COL"]]
      (is (= fk (repair/repair fk))))
    (let [fk ["DB" nil "TBL" "COL"]]
      (is (= fk (repair/repair fk)))))
  (testing "clause containing an FK in its arg position doesn't touch the FK"
    (let [input  ["field" ["DB" "PUBLIC" "TBL" "COL"]]
          output (repair/repair input)]
      (is (= ["field" {} ["DB" "PUBLIC" "TBL" "COL"]] output)))))

(deftest nested-clause-repair-test
  (testing "options filled in at every nesting level"
    (let [input  ["and"
                  ["="
                   ["field" ["DB" "S" "T" "A"]]
                   10]
                  [">"
                   ["field" ["DB" "S" "T" "B"]]
                   5]]
          output (repair/repair input)]
      (is (= ["and" {}
              ["=" {} ["field" {} ["DB" "S" "T" "A"]] 10]
              [">" {} ["field" {} ["DB" "S" "T" "B"]] 5]]
             output)))))

(deftest nil-options-replaced-test
  (testing "nil in options slot is replaced with {}"
    ;; clj-yaml sometimes hands us nil for `~` where we'd want {}
    (is (= ["count" {}] (repair/repair ["count" nil])))))

;;; ============================================================
;;; Pass 2 \u2014 fill in missing `lib/type`
;;; ============================================================

(deftest add-query-lib-type-test
  (testing "top-level query without lib/type gets mbql/query"
    (let [input  {"database" "Sample"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]}]}
          output (repair/repair input)]
      (is (= "mbql/query" (get output "lib/type")))))
  (testing "existing lib/type preserved"
    (let [input {"lib/type" "mbql/query"
                 "database" "Sample"
                 "stages"   [{"lib/type"     "mbql.stage/mbql"
                              "source-table" ["Sample" "PUBLIC" "ORDERS"]}]}]
      (is (= input (repair/repair input))))))

(deftest add-stage-lib-type-test
  (testing "stage without lib/type gets mbql.stage/mbql"
    (let [input  {"lib/type" "mbql/query"
                  "database" "Sample"
                  "stages"   [{"source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "aggregation"  [["count" {}]]}]}
          output (repair/repair input)]
      (is (= "mbql.stage/mbql" (get-in output ["stages" 0 "lib/type"])))))
  (testing "a random non-stage map without stage-body keys is untouched"
    (let [input {"foo" "bar"}]
      (is (= input (repair/repair input))))))

;;; ============================================================
;;; End-to-end repair then parse-and-validate
;;; ============================================================

(deftest end-to-end-yaml-repair-test
  (testing "LLM-style YAML missing both lib/types and options maps still parses+validates after repair"
    (let [yaml-input (str "database: Sample\n"
                          "stages:\n"
                          "  - source-table: [Sample, PUBLIC, ORDERS]\n"
                          "    aggregation:\n"
                          "      - [count]\n")
          repaired (repair/repair (repr/parse-yaml yaml-input))]
      (is (= "mbql/query" (get repaired "lib/type")))
      (is (= "mbql.stage/mbql" (get-in repaired ["stages" 0 "lib/type"])))
      (is (= [["count" {}]] (get-in repaired ["stages" 0 "aggregation"])))
      ;; repaired form should now pass the schema validator
      (is (= repaired (repr/validate-query repaired))))))

;;; ============================================================
;;; Idempotency \u2014 unit + property based
;;; ============================================================

(deftest idempotency-happy-path-test
  (testing "a fully-valid query is a fixed point"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]
                          "breakout"     [["field" {"temporal-unit" "month"}
                                           ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]]}]}]
      (is (= q (repair/repair q)))
      (is (= (repair/repair q) (repair/repair (repair/repair q)))))))

(deftest idempotency-degenerate-test
  (testing "repair(repair(x)) == repair(x) for a broken LLM input"
    (let [broken {"database" "Sample"
                  "stages"   [{"source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "aggregation"  [["count"]]
                               "breakout"     [["field" ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]]}]}
          once (repair/repair broken)
          twice (repair/repair once)]
      (is (= once twice)))))

;;; Property-based fuzz: randomly-shaped inputs go through repair twice and must equal on pass 2.

(def ^:private gen-scalar
  (gen/one-of [gen/string gen/small-integer gen/boolean (gen/return nil)]))

(def ^:private gen-op-name
  (gen/elements ["count" "sum" "avg" "field" "=" "!=" "<" ">" "and" "or" "not"
                 "expression" "aggregation" ">=" "<=" "asc" "desc"]))

(def ^:private gen-fk-segment (gen/elements ["DB" "PUBLIC" "ORDERS" "PRODUCTS" "ID" "TOTAL" nil]))

(def ^:private gen-fk-vector
  (gen/fmap vec (gen/vector gen-fk-segment 3 6)))

(defn- gen-clause [depth]
  (if (zero? depth)
    (gen/tuple gen-op-name
               (gen/one-of [(gen/return {}) (gen/return nil) (gen/return :absent)]))
    (gen/bind (gen/tuple gen-op-name
                         (gen/one-of [(gen/return {}) (gen/return nil) (gen/return :absent)])
                         (gen/vector (gen/one-of [gen-scalar gen-fk-vector]) 0 3))
              (fn [[op opts args]]
                (gen/return
                 (cond-> [op]
                   (not= opts :absent) (conj opts)
                   :always             (into args)))))))

(defn- gen-map-of [k-gen v-gen]
  (gen/fmap (fn [pairs] (into {} pairs))
            (gen/vector (gen/tuple k-gen v-gen) 0 4)))

(def ^:private gen-tree
  (gen/recursive-gen
   (fn [inner] (gen/one-of [(gen-clause 1)
                            (gen/vector inner 0 4)
                            (gen-map-of gen/string-alphanumeric inner)]))
   (gen/one-of [gen-scalar (gen-clause 0) gen-fk-vector])))

(defspec idempotency-property-test 100
  (prop/for-all [tree gen-tree]
    (= (repair/repair tree)
       (repair/repair (repair/repair tree)))))

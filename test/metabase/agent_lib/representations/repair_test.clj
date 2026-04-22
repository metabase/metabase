(ns metabase.agent-lib.representations.repair-test
  "Tests for the LLM-input repair pass."
  (:require
   [clojure.test :refer [deftest is testing]]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase.agent-lib.representations :as repr]
   [metabase.agent-lib.representations.repair :as repair]
   [metabase.lib.test-util :as lib.tu]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; Mock metadata providers
;;; ============================================================

(def ^:private trivial-mp
  "A metadata provider with a single database, no tables. Sufficient to satisfy the repair
  signature for shape-only tests — the implicit-join pass will no-op because it can't resolve
  the source-table."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}}))

(def ^:private mp-fks
  "3-table MP: ORDERS → PRODUCTS, ORDERS → USERS."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS"   :schema "PUBLIC" :db-id 1}
               {:id 20 :name "PRODUCTS" :schema "PUBLIC" :db-id 1}
               {:id 30 :name "USERS"    :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"         :table-id 10 :base-type :type/Integer}
               {:id 101 :name "PRODUCT_ID" :table-id 10 :base-type :type/Integer :fk-target-field-id 200}
               {:id 102 :name "USER_ID"    :table-id 10 :base-type :type/Integer :fk-target-field-id 300}
               {:id 200 :name "ID"         :table-id 20 :base-type :type/Integer}
               {:id 201 :name "CATEGORY"   :table-id 20 :base-type :type/Text}
               {:id 300 :name "ID"         :table-id 30 :base-type :type/Integer}
               {:id 301 :name "NAME"       :table-id 30 :base-type :type/Text}]}))

(def ^:private mp-ambiguous
  "Two FKs from ORDERS to PRODUCTS."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS"   :schema "PUBLIC" :db-id 1}
               {:id 20 :name "PRODUCTS" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"             :table-id 10 :base-type :type/Integer}
               {:id 101 :name "PRODUCT_ID"     :table-id 10 :base-type :type/Integer :fk-target-field-id 200}
               {:id 103 :name "ALT_PRODUCT_ID" :table-id 10 :base-type :type/Integer :fk-target-field-id 200}
               {:id 200 :name "ID"             :table-id 20 :base-type :type/Integer}
               {:id 201 :name "CATEGORY"       :table-id 20 :base-type :type/Text}]}))

(def ^:private mp-no-fk
  "ORDERS + PRODUCTS exist but with no FK between them."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS"   :schema "PUBLIC" :db-id 1}
               {:id 20 :name "PRODUCTS" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"       :table-id 10 :base-type :type/Integer}
               {:id 200 :name "ID"       :table-id 20 :base-type :type/Integer}
               {:id 201 :name "CATEGORY" :table-id 20 :base-type :type/Text}]}))

;;; ============================================================
;;; Pass 1 \u2014 insert `{}` options on clauses
;;; ============================================================

(deftest insert-options-on-bare-clause-test
  (testing "clause without options gets {} inserted"
    (is (= ["count" {}]
           (repair/repair trivial-mp ["count"])))
    (is (= ["sum" {} ["field" {} ["DB" "S" "T" "F"]]]
           (repair/repair trivial-mp ["sum" ["field" ["DB" "S" "T" "F"]]])))))

(deftest do-not-corrupt-fk-paths-test
  (testing "FK paths (all-string vectors) are left alone"
    (let [fk ["DB" "PUBLIC" "TBL" "COL"]]
      (is (= fk (repair/repair trivial-mp fk))))
    (let [fk ["DB" nil "TBL" "COL"]]
      (is (= fk (repair/repair trivial-mp fk)))))
  (testing "clause containing an FK in its arg position doesn't touch the FK"
    (let [input  ["field" ["DB" "PUBLIC" "TBL" "COL"]]
          output (repair/repair trivial-mp input)]
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
          output (repair/repair trivial-mp input)]
      (is (= ["and" {}
              ["=" {} ["field" {} ["DB" "S" "T" "A"]] 10]
              [">" {} ["field" {} ["DB" "S" "T" "B"]] 5]]
             output)))))

(deftest nil-options-replaced-test
  (testing "nil in options slot is replaced with {}"
    ;; clj-yaml sometimes hands us nil for `~` where we'd want {}
    (is (= ["count" {}] (repair/repair trivial-mp ["count" nil])))))

;;; ============================================================
;;; Pass 2 \u2014 fill in missing `lib/type`
;;; ============================================================

(deftest add-query-lib-type-test
  (testing "top-level query without lib/type gets mbql/query"
    (let [input  {"database" "Sample"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]}]}
          output (repair/repair trivial-mp input)]
      (is (= "mbql/query" (get output "lib/type")))))
  (testing "existing lib/type preserved"
    (let [input {"lib/type" "mbql/query"
                 "database" "Sample"
                 "stages"   [{"lib/type"     "mbql.stage/mbql"
                              "source-table" ["Sample" "PUBLIC" "ORDERS"]}]}]
      (is (= input (repair/repair trivial-mp input))))))

(deftest add-stage-lib-type-test
  (testing "stage without lib/type gets mbql.stage/mbql"
    (let [input  {"lib/type" "mbql/query"
                  "database" "Sample"
                  "stages"   [{"source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "aggregation"  [["count" {}]]}]}
          output (repair/repair trivial-mp input)]
      (is (= "mbql.stage/mbql" (get-in output ["stages" 0 "lib/type"])))))
  (testing "a random non-stage map without stage-body keys is untouched"
    (let [input {"foo" "bar"}]
      (is (= input (repair/repair trivial-mp input))))))

;;; ============================================================
;;; End-to-end repair then parse-and-validate
;;; ============================================================

(deftest end-to-end-yaml-repair-test
  (testing "LLM-style YAML missing both lib/types and options maps still parses+validates after repair"
    ;; This test intentionally goes through `parse-yaml` because its purpose is to confirm
    ;; that an LLM-style YAML shortcut — a 1-element flow sequence `[count]` without an
    ;; options map — round-trips cleanly through parser + repair. Other tests in this ns use
    ;; Clojure data directly.
    (let [yaml-input (str "database: Sample\n"
                          "stages:\n"
                          "  - source-table: [Sample, PUBLIC, ORDERS]\n"
                          "    aggregation:\n"
                          "      - [count]\n")
          repaired (repair/repair trivial-mp (repr/parse-yaml yaml-input))]
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
      (is (= q (repair/repair trivial-mp q)))
      (is (= (repair/repair trivial-mp q) (repair/repair trivial-mp (repair/repair trivial-mp q)))))))

(deftest idempotency-degenerate-test
  (testing "repair(repair(x)) == repair(x) for a broken LLM input"
    (let [broken {"database" "Sample"
                  "stages"   [{"source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "aggregation"  [["count"]]
                               "breakout"     [["field" ["Sample" "PUBLIC" "ORDERS" "CREATED_AT"]]]}]}
          once (repair/repair trivial-mp broken)
          twice (repair/repair trivial-mp once)]
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
    (= (repair/repair trivial-mp tree)
       (repair/repair trivial-mp (repair/repair trivial-mp tree)))))

;;; ============================================================
;;; Pass 3 — implicit-join `source-field` auto-wiring
;;; ============================================================

(def ^:private base-query
  "LLM-style query with a cross-table breakout on PRODUCTS.CATEGORY from source-table ORDERS."
  {"lib/type" "mbql/query"
   "database" "Sample"
   "stages"   [{"lib/type"     "mbql.stage/mbql"
                "source-table" ["Sample" "PUBLIC" "ORDERS"]
                "aggregation"  [["count" {}]]
                "breakout"     [["field" {}
                                 ["Sample" "PUBLIC" "PRODUCTS" "CATEGORY"]]]}]})

(deftest implicit-join-happy-path-test
  (testing "cross-table field gets `source-field` auto-filled to the unique FK path"
    (let [out (repair/repair mp-fks base-query)
          field-opts (get-in out ["stages" 0 "breakout" 0 1])]
      (is (= ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]
             (get field-opts "source-field"))))))

(deftest implicit-join-preserves-existing-source-field-test
  (testing "if the clause already has source-field, leave it alone"
    (let [q (assoc-in base-query
                      ["stages" 0 "breakout" 0 1]
                      {"source-field" ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]})
          out (repair/repair mp-fks q)]
      (is (= {"source-field" ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]}
             (get-in out ["stages" 0 "breakout" 0 1]))))))

(deftest implicit-join-skips-join-alias-test
  (testing "field with join-alias is treated as an explicit-join reference and untouched"
    (let [q (assoc-in base-query
                      ["stages" 0 "breakout" 0 1]
                      {"join-alias" "Products"})
          out (repair/repair mp-fks q)]
      (is (= {"join-alias" "Products"}
             (get-in out ["stages" 0 "breakout" 0 1]))))))

(deftest implicit-join-skips-field-on-source-table-test
  (testing "field that already lives on source-table doesn't get source-field added"
    (let [q (assoc-in base-query
                      ["stages" 0 "breakout"]
                      [["field" {} ["Sample" "PUBLIC" "ORDERS" "ID"]]])
          out (repair/repair mp-fks q)]
      (is (= {} (get-in out ["stages" 0 "breakout" 0 1]))))))

(deftest implicit-join-no-fk-path-test
  (testing "throws :no-fk-path when the target table isn't reachable via any FK"
    (try
      (repair/repair mp-no-fk base-query)
      (is false "expected throw")
      (catch clojure.lang.ExceptionInfo e
        (let [d (ex-data e)]
          (is (= :no-fk-path (:error d)))
          (is (true? (:agent-error? d)))
          (is (re-find #"no foreign key" (ex-message e))))))))

(deftest implicit-join-ambiguous-fk-test
  (testing "throws :ambiguous-fk and lists candidate FK paths when multiple FKs exist"
    (try
      (repair/repair mp-ambiguous base-query)
      (is false "expected throw")
      (catch clojure.lang.ExceptionInfo e
        (let [d (ex-data e)]
          (is (= :ambiguous-fk (:error d)))
          (is (true? (:agent-error? d)))
          (let [msg (ex-message e)]
            (is (re-find #"PRODUCT_ID" msg))
            (is (re-find #"ALT_PRODUCT_ID" msg)))
          (is (= 2 (count (:candidates d)))))))))

(deftest implicit-join-skips-joins-subtree-test
  (testing "field references inside explicit joins are not auto-wired with source-field"
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "joins"        [{"alias"    "P"
                                           "strategy" "left-join"
                                           "stages"   [{"lib/type"     "mbql.stage/mbql"
                                                        "source-table" ["Sample" "PUBLIC" "PRODUCTS"]}]
                                           "conditions"
                                           [["=" {}
                                             ["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]
                                             ["field" {"join-alias" "P"}
                                              ["Sample" "PUBLIC" "PRODUCTS" "ID"]]]]}]
                          "breakout"     [["field" {"join-alias" "P"}
                                           ["Sample" "PUBLIC" "PRODUCTS" "CATEGORY"]]]}]}
          out (repair/repair mp-fks q)
          join-field-opts (get-in out ["stages" 0 "joins" 0 "conditions" 0 3 1])
          breakout-opts   (get-in out ["stages" 0 "breakout" 0 1])]
      (testing "field in join conditions (not on source-table) is NOT given source-field"
        (is (not (contains? join-field-opts "source-field"))))
      (testing "breakout field with join-alias is preserved as-is"
        (is (= {"join-alias" "P"} breakout-opts))))))

(deftest implicit-join-idempotent-test
  (testing "implicit-join repair is idempotent"
    (let [once  (repair/repair mp-fks base-query)
          twice (repair/repair mp-fks once)]
      (is (= once twice)))))

(deftest implicit-join-no-op-when-mp-cannot-resolve-source-table-test
  (testing "when the MP can't resolve the source-table, the pass is a no-op (let later stages report)"
    ;; trivial-mp has only a Database, no tables. Source-table resolution fails silently.
    (let [out (repair/repair trivial-mp base-query)]
      (is (= {} (get-in out ["stages" 0 "breakout" 0 1]))))))

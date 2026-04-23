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
    ;; FK paths use "Sample" here because `repair` also normalises the DB component of every
    ;; portable FK to match the metadata provider's DB name (`trivial-mp` is named "Sample").
    ;; See `rewrite-database-name*` in repair.clj for the rationale.
    (is (= ["sum" {} ["field" {} ["Sample" "S" "T" "F"]]]
           (repair/repair trivial-mp ["sum" ["field" ["Sample" "S" "T" "F"]]])))))

(deftest do-not-corrupt-fk-paths-test
  (testing "FK paths (all-string vectors) are left alone (modulo DB-name normalization)"
    (let [fk ["Sample" "PUBLIC" "TBL" "COL"]]
      (is (= fk (repair/repair trivial-mp fk))))
    (let [fk ["Sample" nil "TBL" "COL"]]
      (is (= fk (repair/repair trivial-mp fk)))))
  (testing "clause containing an FK in its arg position doesn't touch the FK shape"
    (let [input  ["field" ["Sample" "PUBLIC" "TBL" "COL"]]
          output (repair/repair trivial-mp input)]
      (is (= ["field" {} ["Sample" "PUBLIC" "TBL" "COL"]] output)))))

(deftest nested-clause-repair-test
  (testing "options filled in at every nesting level"
    (let [input  ["and"
                  ["="
                   ["field" ["Sample" "S" "T" "A"]]
                   10]
                  [">"
                   ["field" ["Sample" "S" "T" "B"]]
                   5]]
          output (repair/repair trivial-mp input)]
      (is (= ["and" {}
              ["=" {} ["field" {} ["Sample" "S" "T" "A"]] 10]
              [">" {} ["field" {} ["Sample" "S" "T" "B"]] 5]]
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
;;; (Removed) Pass 2.5 — rewrite the database name to match the metadata provider
;;;
;;; This pass was deleted in `repr-plan.md` step 13. The previous role of the pass was to
;;; reconcile a YAML `database:` (often `Sample`, copied from the prompt examples) with the
;;; real MP DB name (often `Sample Database`). Now that the MP is *built from* the YAML's
;;; `database:` field via `construct/resolve-database-id-from-yaml`, the names are guaranteed
;;; to agree by construction — the rewrite has nothing to do.
;;;
;;; A wrong DB name now surfaces a clear `:agent-error?` (`:unknown-database`) at the database
;;; lookup step, with a message instructing the LLM to use the canonical name from
;;; `entity_details`. Tests for that behaviour live in `construct_representations_test.clj`
;;; under `llm-uses-prompt-example-database-name-now-fails-loudly-test`.
;;; ============================================================

;;; ============================================================
;;; Pass 2.7 — rewrite inline aggregations in `order-by` to aggregation refs
;;;
;;; The LLM tends to write `order-by: [[desc, {}, [sum, {}, [field, {}, FK]]]]`, re-stating
;;; the aggregation expression inline. The lib stack accepts this in MBQL 5 form but the
;;; legacy round-trip (which happens whenever the chart is later re-loaded) rejects it.
;;; Repair detects the pattern and rewrites it to a UUID-based aggregation reference,
;;; stamping the matching aggregation's `lib/uuid` if needed.
;;; ============================================================

(defn- uuid-string? [x]
  (and (string? x)
       (try (java.util.UUID/fromString x) true (catch Exception _ false))))

(defn- agg-uuid-of [stage idx]
  (get-in stage ["aggregation" idx 1 "lib/uuid"]))

(deftest rewrite-order-by-inline-agg-happy-path-test
  (testing "inline aggregation in order-by gets rewritten to an aggregation ref"
    (let [input    {"lib/type" "mbql/query"
                    "database" "Sample"
                    "stages"   [{"lib/type"     "mbql.stage/mbql"
                                 "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                 "aggregation"  [["sum" {}
                                                  ["field" {}
                                                   ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]
                                 "order-by"     [["desc" {}
                                                  ["sum" {}
                                                   ["field" {}
                                                    ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]]}]}
          repaired (repair/repair trivial-mp input)
          stage    (get-in repaired ["stages" 0])
          agg-uuid (agg-uuid-of stage 0)]
      (testing "the matched aggregation got a lib/uuid stamped into its options"
        (is (uuid-string? agg-uuid)))
      (testing "order-by inner clause is now [\"aggregation\" {} <that-uuid>]"
        (is (= ["aggregation" {} agg-uuid]
               (get-in stage ["order-by" 0 2])))))))

(deftest rewrite-order-by-multiple-aggregations-test
  (testing "order-by entries match the right aggregation by structural equality"
    (let [input    {"lib/type" "mbql/query"
                    "database" "Sample"
                    "stages"   [{"lib/type"     "mbql.stage/mbql"
                                 "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                 "aggregation"  [["sum" {}
                                                  ["field" {}
                                                   ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]
                                                 ["count" {}]]
                                 "order-by"     [["desc" {} ["count" {}]]
                                                 ["asc" {}
                                                  ["sum" {}
                                                   ["field" {}
                                                    ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]]}]}
          repaired (repair/repair trivial-mp input)
          stage    (get-in repaired ["stages" 0])
          sum-uuid (agg-uuid-of stage 0)
          cnt-uuid (agg-uuid-of stage 1)]
      (is (uuid-string? sum-uuid))
      (is (uuid-string? cnt-uuid))
      (is (not= sum-uuid cnt-uuid) "each aggregation gets its own uuid")
      (is (= ["aggregation" {} cnt-uuid] (get-in stage ["order-by" 0 2]))
          "first order-by (count) refers to the count aggregation")
      (is (= ["aggregation" {} sum-uuid] (get-in stage ["order-by" 1 2]))
          "second order-by (sum TOTAL) refers to the sum aggregation"))))

(deftest rewrite-order-by-reuses-existing-uuid-test
  (testing "if the matching aggregation already has a lib/uuid, reuse it"
    (let [existing-uuid "11111111-2222-3333-4444-555555555555"
          input    {"lib/type" "mbql/query"
                    "database" "Sample"
                    "stages"   [{"lib/type"     "mbql.stage/mbql"
                                 "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                 "aggregation"  [["sum" {"lib/uuid" existing-uuid}
                                                  ["field" {}
                                                   ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]
                                 "order-by"     [["desc" {}
                                                  ["sum" {}
                                                   ["field" {}
                                                    ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]]}]}
          repaired (repair/repair trivial-mp input)
          stage    (get-in repaired ["stages" 0])]
      (is (= existing-uuid (agg-uuid-of stage 0))
          "the pre-existing uuid is preserved")
      (is (= ["aggregation" {} existing-uuid] (get-in stage ["order-by" 0 2]))))))

(deftest rewrite-order-by-leaves-existing-aggregation-ref-alone-test
  (testing "an order-by that already uses [\"aggregation\" {} <uuid>] is left alone"
    (let [agg-uuid "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
          input    {"lib/type" "mbql/query"
                    "database" "Sample"
                    "stages"   [{"lib/type"     "mbql.stage/mbql"
                                 "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                 "aggregation"  [["sum" {"lib/uuid" agg-uuid}
                                                  ["field" {}
                                                   ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]
                                 "order-by"     [["desc" {}
                                                  ["aggregation" {} agg-uuid]]]}]}]
      (is (= input (repair/repair trivial-mp input))))))

(deftest rewrite-order-by-leaves-non-aggregation-orderings-alone-test
  (testing "order-by on a plain field is left alone"
    (let [input    {"lib/type" "mbql/query"
                    "database" "Sample"
                    "stages"   [{"lib/type"     "mbql.stage/mbql"
                                 "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                 "aggregation"  [["count" {}]]
                                 "order-by"     [["asc" {}
                                                  ["field" {}
                                                   ["Sample" "PUBLIC" "ORDERS" "ID"]]]]}]}]
      (is (= input (repair/repair trivial-mp input))))))

(deftest rewrite-order-by-leaves-non-matching-aggregation-alone-test
  (testing (str "if the inline order-by aggregation does NOT match any aggregation in the\n"
                "stage, leave it alone (let validation/normalize surface the real error)")
    (let [input    {"lib/type" "mbql/query"
                    "database" "Sample"
                    "stages"   [{"lib/type"     "mbql.stage/mbql"
                                 "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                 "aggregation"  [["count" {}]]
                                 "order-by"     [["desc" {}
                                                  ["sum" {}
                                                   ["field" {}
                                                    ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]]}]}
          repaired (repair/repair trivial-mp input)]
      (is (= ["sum" {} ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]
             (get-in repaired ["stages" 0 "order-by" 0 2]))))))

(deftest rewrite-order-by-idempotent-test
  (testing "running repair twice produces the same result (UUID is stable across runs)"
    (let [input  {"lib/type" "mbql/query"
                  "database" "Sample"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "aggregation"  [["sum" {}
                                                ["field" {}
                                                 ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]
                               "order-by"     [["desc" {}
                                                ["sum" {}
                                                 ["field" {}
                                                  ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]]}]}
          once   (repair/repair trivial-mp input)
          twice  (repair/repair trivial-mp once)]
      (is (= once twice)))))

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

;;; ============================================================
;;; Pass 4 -- cross-stage field-type inference (repr-plan step 8)
;;;
;;; When a later stage references a column from an earlier stage by name
;;; (`["field" {} "<column-name>"]`), the `lib.schema/query` validator requires the options
;;; map to carry `"base-type"` (and, by convention, `"effective-type"`). LLMs routinely
;;; forget this. This pass resolves the earlier stages enough to learn each column's name
;;; and base-type, then stamps the inferred types into the options map of every string-named
;;; cross-stage field ref in later stages.
;;; ============================================================

(def ^:private multi-stage-base-query
  "Two-stage query: aggregate orders by product id in stage 0, filter on count in stage 1.
  The stage-1 filter references the aggregation output by name (`count`) \u2014 an LLM that
  knows it has to filter an aggregate will typically write this shape and forget the
  `base-type`."
  {"lib/type" "mbql/query"
   "database" "Sample"
   "stages"   [{"lib/type"     "mbql.stage/mbql"
                "source-table" ["Sample" "PUBLIC" "ORDERS"]
                "aggregation"  [["count" {}]]
                "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "ID"]]]}
               {"lib/type" "mbql.stage/mbql"
                "filters"  [[">" {} ["field" {} "count"] 10]]}]})

(deftest cross-stage-field-type-inference-happy-path-test
  (testing "String-named cross-stage field ref gets `base-type` + `effective-type` inferred
           from the previous stage's `lib/returned-columns`."
    (let [out (repair/repair mp-fks multi-stage-base-query)
          field-clause (get-in out ["stages" 1 "filters" 0 2])
          opts (nth field-clause 1)]
      (testing "base-type / effective-type are populated"
        (is (= "type/Integer" (get opts "base-type")))
        (is (= "type/Integer" (get opts "effective-type"))))
      (testing "the string column name in position 2 is preserved"
        (is (= "count" (nth field-clause 2)))))))

(deftest cross-stage-field-type-preserves-existing-base-type-test
  (testing "If the LLM actually wrote `base-type`, we don't overwrite it."
    (let [q (assoc-in multi-stage-base-query
                      ["stages" 1 "filters" 0 2 1]
                      {"base-type" "type/Text" "effective-type" "type/Text"})
          out (repair/repair mp-fks q)
          opts (get-in out ["stages" 1 "filters" 0 2 1])]
      (is (= "type/Text" (get opts "base-type")))
      (is (= "type/Text" (get opts "effective-type"))))))

(deftest cross-stage-field-type-breakout-column-test
  (testing "A later stage can reference a BREAKOUT column from the previous stage by name;
           repair infers its base-type from the source column's metadata."
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "ID"]]]}
                         {"lib/type"  "mbql.stage/mbql"
                          "order-by" [["asc" {} ["field" {} "ID"]]]}]}
          out (repair/repair mp-fks q)
          opts (get-in out ["stages" 1 "order-by" 0 2 1])]
      (is (= "type/Integer" (get opts "base-type"))))))

(deftest cross-stage-field-type-leaves-vector-field-fks-alone-test
  (testing "A field clause that uses a portable FK path (vector in position 2) is a normal
           cross-table reference, not a cross-stage one \u2014 do not touch it."
    (let [out (repair/repair mp-fks multi-stage-base-query)
          stage-0-breakout-field (get-in out ["stages" 0 "breakout" 0])]
      (testing "stage-0 breakout is untouched by the cross-stage pass"
        ;; It may or may not have been touched by implicit-join; but the base-type should
        ;; NOT have been stamped in by the cross-stage pass (different code path).
        (is (vector? (nth stage-0-breakout-field 2)))))))

(deftest cross-stage-field-type-no-previous-stage-test
  (testing "String-named field in stage 0 has no previous stage to look at \u2014 we can't
           infer, so we leave the clause alone (the schema validator will surface the error)."
    (let [q {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type" "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "filters" [[">" {} ["field" {} "count"] 10]]}]}
          out (repair/repair mp-fks q)
          opts (get-in out ["stages" 0 "filters" 0 2 1])]
      (is (not (contains? opts "base-type"))))))

(deftest cross-stage-field-type-unknown-column-name-test
  (testing "If the referenced name isn't produced by the previous stage, leave the clause
           alone (the resolver will surface :unknown-column or similar with a better message)."
    (let [q (assoc-in multi-stage-base-query
                      ["stages" 1 "filters" 0 2 2] "no_such_column")
          out (repair/repair mp-fks q)
          opts (get-in out ["stages" 1 "filters" 0 2 1])]
      (is (not (contains? opts "base-type"))))))

(deftest cross-stage-field-type-idempotent-test
  (testing "cross-stage field-type inference is idempotent"
    (let [once  (repair/repair mp-fks multi-stage-base-query)
          twice (repair/repair mp-fks once)]
      (is (= once twice)))))

(deftest cross-stage-field-type-end-to-end-resolve-test
  (testing (str "End-to-end: a multi-stage YAML with a stage-1 cross-stage ref lacking\n"
                "base-type is repaired and then `resolve-query` + `lib/query` accept the\n"
                "result without a validation error.")
    ;; This is the exact failure mode that motivated this pass: pre-repair, lib/query throws
    ;; "Invalid output: {:stages [nil {:filters [[nil nil [nil {:base-type ...missing...}]]]}]}"
    (let [repaired (repair/repair mp-fks multi-stage-base-query)
          ;; We can't run the resolver on `mp-fks` (it's a lib mock, not an application-DB MP),
          ;; but we CAN assert that the stage-1 cross-stage ref now carries a base-type \u2014
          ;; that's the structural repair the downstream needs. The actual end-to-end resolve
          ;; is tested against a real application DB in construct_representations_test.
          opts (get-in repaired ["stages" 1 "filters" 0 2 1])]
      (is (= "type/Integer" (get opts "base-type"))))))

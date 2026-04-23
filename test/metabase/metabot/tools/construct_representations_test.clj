(ns metabase.metabot.tools.construct-representations-test
  "Tests for `execute-representations-query` — the representations-format entry point for
  `construct_notebook_query`.

  Covers the happy path (YAML -> resolved pMBQL wrapped in structured output), malformed YAML,
  unknown table, the `:agent-error?` error-translation contract, and the database-id
  resolution from the YAML's `database:` field (per `repr-plan.md` step 13: unknown name,
  ambiguous name, missing name, mismatched DB component in source-table).

  Most tests express the query as a Clojure data structure and serialize it via
  `yaml/generate-string` — the parser + validator then round-trip it back. Tests that
  specifically exercise parser edge cases (malformed YAML, LLM-inline shortcuts) keep raw
  YAML strings on purpose."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.test-util :as lib.tu]
   [metabase.metabot.tools.construct :as construct]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(def ^:private mp
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS"   :schema "PUBLIC" :db-id 1}
               {:id 20 :name "PRODUCTS" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"         :table-id 10 :base-type :type/Integer}
               {:id 101 :name "TOTAL"      :table-id 10 :base-type :type/Float}
               {:id 102 :name "PRODUCT_ID" :table-id 10 :base-type :type/Integer
                :fk-target-field-id 200}
               {:id 200 :name "ID"         :table-id 20 :base-type :type/Integer}
               {:id 201 :name "CATEGORY"   :table-id 20 :base-type :type/Text}]}))

(def ^:private mp-sample-database
  "Mirrors the *real* application DB shape the LLM hits in production: the database name
  is `Sample Database`, but our prompt examples all show `Sample`. Used by the
  database-name-mismatch reproducer."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample Database"}
    :tables   [{:id 10 :name "ORDERS"   :schema "PUBLIC" :db-id 1}
               {:id 20 :name "PRODUCTS" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"         :table-id 10 :base-type :type/Integer}
               {:id 101 :name "TOTAL"      :table-id 10 :base-type :type/Float}
               {:id 102 :name "PRODUCT_ID" :table-id 10 :base-type :type/Integer
                :fk-target-field-id 200}
               {:id 200 :name "ID"         :table-id 20 :base-type :type/Integer}
               {:id 201 :name "CATEGORY"   :table-id 20 :base-type :type/Text}]}))

(def ^:private mp-ambiguous
  "Two FKs from ORDERS to PRODUCTS — triggers :ambiguous-fk."
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS"   :schema "PUBLIC" :db-id 1}
               {:id 20 :name "PRODUCTS" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID"             :table-id 10 :base-type :type/Integer}
               {:id 102 :name "PRODUCT_ID"     :table-id 10 :base-type :type/Integer
                :fk-target-field-id 200}
               {:id 103 :name "ALT_PRODUCT_ID" :table-id 10 :base-type :type/Integer
                :fk-target-field-id 200}
               {:id 200 :name "ID"             :table-id 20 :base-type :type/Integer}
               {:id 201 :name "CATEGORY"       :table-id 20 :base-type :type/Text}]}))

;; Note: `resolve-database-id-from-yaml` (the post-step-13 replacement for
;; `resolve-source-database-id`) hits toucan2 to look the database up by name. We stub it
;; directly per fixture so tests don't need a live application DB. Each fixture's stub
;; returns the id matching the bound metadata provider.

(defn- with-mp-and-stubs! [f]
  (with-redefs [lib-be/application-database-metadata-provider (fn [_db-id] mp)
                construct/resolve-database-id-from-yaml       (fn [_] 1)]
    (f)))

(defn- with-ambiguous-mp-and-stubs! [f]
  (with-redefs [lib-be/application-database-metadata-provider (fn [_db-id] mp-ambiguous)
                construct/resolve-database-id-from-yaml       (fn [_] 1)]
    (f)))

(defn- query-yaml
  "Serialize a Clojure query data structure (string-keyed, repr shape) to YAML for the tool."
  [query-data]
  (yaml/generate-string query-data))

(deftest happy-path-test
  (with-mp-and-stubs!
    (fn []
      (let [result (construct/execute-representations-query
                    (query-yaml
                     {"lib/type" "mbql/query"
                      "database" "Sample"
                      "stages"   [{"lib/type"     "mbql.stage/mbql"
                                   "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                   "aggregation"  [["count" {}]]}]}))
            structured (:structured-output result)
            q (:query structured)]
        (testing "structured-output shape"
          (is (string? (:query-id structured)))
          (is (vector? (:result-columns structured))))
        (testing "query is a valid resolved MBQL 5 query"
          (is (= :mbql/query (:lib/type q)))
          (is (= 1 (:database q)))
          (is (= 10 (get-in q [:stages 0 :source-table])))
          (is (= :count (first (get-in q [:stages 0 :aggregation 0])))))))))

(deftest malformed-yaml-surfaces-agent-error-test
  (with-mp-and-stubs!
    (fn []
      (try
        (construct/execute-representations-query
         "not: [valid yaml")
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d (ex-data e)]
            (testing "marked as an agent-error for the tool wrapper"
              (is (true? (:agent-error? d))))
            (testing "preserves underlying error code"
              (is (= :invalid-representations-yaml (:error d))))))))))

(deftest unknown-table-surfaces-agent-error-test
  (with-mp-and-stubs!
    (fn []
      (try
        (construct/execute-representations-query
         (query-yaml
          {"lib/type" "mbql/query"
           "database" "Sample"
           "stages"   [{"lib/type"     "mbql.stage/mbql"
                        "source-table" ["Sample" "PUBLIC" "DOES_NOT_EXIST"]
                        "aggregation"  [["count" {}]]}]}))
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d (ex-data e)]
            (is (true? (:agent-error? d)))
            (is (= :unknown-table (:error d)))))))))

(deftest implicit-join-happy-path-test
  (testing "cross-table breakout gets auto-wired with a :source-field after repair"
    (with-mp-and-stubs!
      (fn []
        (let [result (construct/execute-representations-query
                      (query-yaml
                       {"lib/type" "mbql/query"
                        "database" "Sample"
                        "stages"   [{"lib/type"     "mbql.stage/mbql"
                                     "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                     "aggregation"  [["count" {}]]
                                     "breakout"     [["field" {}
                                                      ["Sample" "PUBLIC" "PRODUCTS" "CATEGORY"]]]}]}))
              q (get-in result [:structured-output :query])
              breakout-field (get-in q [:stages 0 :breakout 0])
              field-opts (second breakout-field)]
          (testing "field-id is resolved to PRODUCTS.CATEGORY (201)"
            (is (= 201 (nth breakout-field 2))))
          (testing "source-field is populated with ORDERS.PRODUCT_ID (102)"
            (is (= 102 (:source-field field-opts)))))))))

(deftest implicit-join-ambiguous-surfaces-agent-error-test
  (with-ambiguous-mp-and-stubs!
    (fn []
      (try
        (construct/execute-representations-query
         (query-yaml
          {"lib/type" "mbql/query"
           "database" "Sample"
           "stages"   [{"lib/type"     "mbql.stage/mbql"
                        "source-table" ["Sample" "PUBLIC" "ORDERS"]
                        "aggregation"  [["count" {}]]
                        "breakout"     [["field" {}
                                         ["Sample" "PUBLIC" "PRODUCTS" "CATEGORY"]]]}]}))
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d (ex-data e)]
            (is (true? (:agent-error? d)))
            (is (= :ambiguous-fk (:error d)))
            (is (re-find #"PRODUCT_ID" (ex-message e)))))))))

(deftest llm-uses-prompt-example-database-name-now-fails-loudly-test
  (testing (str "After `repr-plan.md` step 13, the YAML's `database:` field is the source of\n"
                "truth: it's used to look up the application database. If the LLM writes\n"
                "`database: Sample` against an instance whose DB is named `Sample Database`,\n"
                "the lookup fails fast with a clear `:unknown-database` `:agent-error?` rather\n"
                "than silently being repaired (the previous `rewrite-database-name*` pass).\n"
                "The LLM gets a useful nudge in the error message; the prompt change to use\n"
                "the canonical name from `entity_details` is the real long-term fix.")
    ;; This fixture's MP-name is "Sample Database". We DON'T stub `resolve-database-id-from-yaml`
    ;; here — we want the actual function to run against `name = "Sample"` and observe the
    ;; not-found behaviour. The MP stub still binds in case the lookup would somehow succeed.
    (with-redefs [lib-be/application-database-metadata-provider (fn [_db-id] mp-sample-database)
                  construct/resolve-database-id-from-yaml
                  (fn [parsed]
                    (let [db-name (get parsed "database")]
                      (if (= db-name "Sample Database")
                        1
                        (throw (ex-info (str "Unknown database: `" db-name "`.")
                                        {:agent-error? true
                                         :status-code  400
                                         :error        :unknown-database
                                         :database     db-name})))))]
      (let [yaml-str (query-yaml
                      {"lib/type" "mbql/query"
                       "database" "Sample"
                       "stages"   [{"lib/type"     "mbql.stage/mbql"
                                    "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                    "aggregation"  [["count" {}]]}]})]
        (try
          (construct/execute-representations-query yaml-str)
          (is false "expected throw")
          (catch clojure.lang.ExceptionInfo e
            (let [d (ex-data e)]
              (testing "surfaces as :agent-error? with :unknown-database"
                (is (true? (:agent-error? d)))
                (is (= :unknown-database (:error d)))
                (is (= "Sample" (:database d))))
              (testing "error message includes the offending name"
                (is (re-find #"Sample" (ex-message e)))))))))))

(deftest llm-orders-by-inline-aggregation-reproducer-test
  (testing (str "Reproducer: when the LLM writes `order-by` by re-stating the aggregation\n"
                "expression inline (`[desc, {}, [sum, {}, [field, {}, FK]]]`) instead of using\n"
                "an aggregation reference, the construct call appears to succeed but the\n"
                "resulting query is unrunnable: the legacy-MBQL form has an inline aggregation\n"
                "in `:order-by`, which legacy MBQL rejects. Triggered by the natural-language\n"
                "request 'total revenue per product category' \u2014 the LLM adds a sort by\n"
                "revenue desc and writes the order-by inline.")
    (with-mp-and-stubs!
      (fn []
        (let [yaml-str (query-yaml
                        {"lib/type" "mbql/query"
                         "database" "Sample"
                         "stages"   [{"lib/type"     "mbql.stage/mbql"
                                      "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                      "aggregation"  [["sum" {}
                                                       ["field" {}
                                                        ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]
                                      "breakout"     [["field" {}
                                                       ["Sample" "PUBLIC" "PRODUCTS" "CATEGORY"]]]
                                      "order-by"     [["desc" {}
                                                       ["sum" {}
                                                        ["field" {}
                                                         ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]]}]})
              ;; Today: `execute-representations-query` succeeds quietly here. The crash
              ;; happens later, when downstream callers (chart re-load, normalize, QP) try to
              ;; round-trip the query through legacy MBQL.
              result   (try
                         (construct/execute-representations-query yaml-str)
                         (catch clojure.lang.ExceptionInfo e e))]
          (testing "the pipeline produces a runnable query (not just an apparently-resolved one)"
            (is (not (instance? clojure.lang.ExceptionInfo result))
                (str "Pipeline failed with: "
                     (when (instance? clojure.lang.ExceptionInfo result)
                       (pr-str {:msg (ex-message result) :data (ex-data result)}))))
            (when-not (instance? clojure.lang.ExceptionInfo result)
              (let [q          (get-in result [:structured-output :query])
                    ;; Round-trip through legacy is the gate the production failure hit.
                    legacy     #_{:clj-kondo/ignore [:discouraged-var]}
                    (lib/->legacy-MBQL q)
                    rebuilt    (try (lib/query mp legacy)
                                    (catch clojure.lang.ExceptionInfo e e))]
                (testing "order-by uses an aggregation reference, not an inline aggregation"
                  ;; In MBQL 5: `[:aggregation {} \"<uuid>\"]`. Whatever shape we settle on, an
                  ;; inline `[:sum [:field ...]]` (a stage-aggregation expression) must NOT
                  ;; appear inside `:order-by`.
                  (is (not= :sum
                            (let [first-ord (first (get-in q [:stages 0 :order-by]))
                                  ;; first-ord is `[:desc {} <inner>]`; `nth ord 2` is the inner clause
                                  inner     (when (and (vector? first-ord) (>= (count first-ord) 3))
                                              (nth first-ord 2))]
                              (when (vector? inner) (first inner))))
                      "order-by inner clause should be an aggregation ref, not :sum"))
                (testing "legacy round-trip succeeds (would fail in production with :order-by [:sum ...])"
                  (is (not (instance? clojure.lang.ExceptionInfo rebuilt))
                      (str "legacy-roundtrip failed: "
                           (when (instance? clojure.lang.ExceptionInfo rebuilt)
                             (ex-message rebuilt)))))))))))))

(deftest repair-fills-missing-pieces-test
  (testing "LLM-style YAML missing lib/types and {} options still resolves after repair"
    ;; Intentionally written as a raw string: the whole point of this test is that the parser
    ;; + repair pass cope with LLM-style shortcuts (missing `lib/type` markers, `[count]`
    ;; without an options map) that round-tripping through `yaml/generate-string` would
    ;; silently "fix" by emitting the canonical form.
    (with-mp-and-stubs!
      (fn []
        (let [result (construct/execute-representations-query
                      (str "database: Sample\n"
                           "stages:\n"
                           "  - source-table: [Sample, PUBLIC, ORDERS]\n"
                           "    aggregation:\n"
                           "      - [count]\n"))
              q (get-in result [:structured-output :query])]
          (is (= :mbql/query (:lib/type q)))
          (is (= :count (first (get-in q [:stages 0 :aggregation 0])))))))))

;;; ============================================================
;;; Step-13 contract: database identity from the YAML
;;; ============================================================

(deftest resolve-database-id-from-yaml-missing-database-field-test
  (testing "YAML without a top-level `database:` field surfaces an :agent-error?"
    ;; We pass a parsed map directly so we don't have to fight YAML round-tripping (which would
    ;; complain about the malformed structure earlier).
    (try
      (construct/resolve-database-id-from-yaml
       {"lib/type" "mbql/query"
        "stages"   [{"lib/type" "mbql.stage/mbql"
                     "source-table" ["Sample" "PUBLIC" "ORDERS"]}]})
      (is false "expected throw")
      (catch clojure.lang.ExceptionInfo e
        (let [d (ex-data e)]
          (is (true? (:agent-error? d)))
          (is (= :missing-database-name (:error d))))))))

(deftest resolve-database-id-from-yaml-non-string-database-test
  (testing "YAML where `database:` is not a string (e.g. parsed as a number) surfaces :agent-error?"
    (try
      (construct/resolve-database-id-from-yaml
       {"lib/type" "mbql/query"
        "database" 42
        "stages"   [{"lib/type" "mbql.stage/mbql"
                     "source-table" ["Sample" "PUBLIC" "ORDERS"]}]})
      (is false "expected throw")
      (catch clojure.lang.ExceptionInfo e
        (let [d (ex-data e)]
          (is (true? (:agent-error? d)))
          (is (= :missing-database-name (:error d))))))))

(deftest execute-representations-query-database-mismatch-test
  (testing (str "`database:` and `source-table[0]` must agree. The repair pass no longer rewrites\n"
                "the DB name to the MP's name (per `repr-plan.md` step 13), so a mismatch surfaces\n"
                "as :unknown-table (the resolver's existing message for portable-FK / MP\n"
                "DB-name mismatch) \u2014 reflagged :agent-error? for the LLM.")
    (with-mp-and-stubs!
      (fn []
        ;; MP is bound to DB id 1 / name "Sample"; YAML has database: Sample but source-table
        ;; references a DIFFERENT DB. The resolver enforces the agreement and we relay the error.
        ;; The current resolver wording (`Portable table FK references database X, but metadata
        ;; provider is for Y`) classifies this under :unknown-table, which is fine — the
        ;; important contract is that the error reaches the LLM with :agent-error? true and an
        ;; ex-message that names the offending database.
        (try
          (construct/execute-representations-query
           (query-yaml
            {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["OtherDB" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]}]}))
          (is false "expected throw")
          (catch clojure.lang.ExceptionInfo e
            (let [d (ex-data e)]
              (is (true? (:agent-error? d)))
              (is (= :unknown-table (:error d)))
              (is (re-find #"OtherDB" (ex-message e))))))))))

;;; ============================================================
;;; Step-8 contract: multi-stage queries
;;; ============================================================

(deftest multi-stage-post-aggregation-filter-end-to-end-test
  (testing (str "Two-stage query: aggregate orders by product id in stage 0, filter where\n"
                "`count > 10` in stage 1. The stage-1 filter references the aggregation output\n"
                "by string name (`count`) without `base-type` \u2014 a recurring LLM mistake \u2014\n"
                "and the cross-stage field-type inference pass (per `repr-plan.md` step 8)\n"
                "silently fills it in so the resolver + lib/query accept the query.")
    (with-mp-and-stubs!
      (fn []
        (let [result (construct/execute-representations-query
                      (query-yaml
                       {"lib/type" "mbql/query"
                        "database" "Sample"
                        "stages"   [{"lib/type"     "mbql.stage/mbql"
                                     "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                     "aggregation"  [["count" {}]]
                                     "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]}
                                    {"lib/type" "mbql.stage/mbql"
                                     "filters"  [[">" {} ["field" {} "count"] 10]]}]}))
              q (get-in result [:structured-output :query])]
          (testing "two-stage shape preserved"
            (is (= 2 (count (:stages q))))
            (is (= 10 (get-in q [:stages 0 :source-table])))
            (is (nil? (get-in q [:stages 1 :source-table]))))
          (testing "stage-1 filter resolved into a real `:>` clause whose field carries types"
            (let [filter-clause (get-in q [:stages 1 :filters 0])
                  field-clause  (nth filter-clause 2)
                  field-opts    (nth field-clause 1)]
              (is (= :> (first filter-clause)))
              (is (= :field (first field-clause)))
              (is (= "count" (nth field-clause 2)))
              (is (= :type/Integer (:base-type field-opts)))
              (is (= :type/Integer (:effective-type field-opts)))))
          (testing "result-columns reflect the post-filter stage's output"
            (is (= #{"PRODUCT_ID" "count"}
                   (set (mapv :name (get-in result [:structured-output :result-columns])))))))))))

(deftest multi-stage-respects-explicit-base-type-test
  (testing (str "If the LLM happens to write `base-type` on a cross-stage ref already, repair\n"
                "leaves it alone. Confirms the inference pass is additive, not overwriting.")
    (with-mp-and-stubs!
      (fn []
        (let [result (construct/execute-representations-query
                      (query-yaml
                       {"lib/type" "mbql/query"
                        "database" "Sample"
                        "stages"   [{"lib/type"     "mbql.stage/mbql"
                                     "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                     "aggregation"  [["count" {}]]
                                     "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]}
                                    {"lib/type" "mbql.stage/mbql"
                                     "filters"  [[">" {} ["field" {"base-type" "type/Integer"} "count"] 10]]}]}))
              q (get-in result [:structured-output :query])
              field-opts (get-in q [:stages 1 :filters 0 2 1])]
          (is (= :type/Integer (:base-type field-opts))))))))

(deftest multi-stage-three-stage-chain-test
  (testing (str "A three-stage query: aggregate \u2192 filter (stage 1, references `count`) \u2192\n"
                "order-by (stage 2, references `count` again). Verifies that the cross-stage\n"
                "inference pass walks all stages, not just stage 1.")
    (with-mp-and-stubs!
      (fn []
        (let [result (construct/execute-representations-query
                      (query-yaml
                       {"lib/type" "mbql/query"
                        "database" "Sample"
                        "stages"   [{"lib/type"     "mbql.stage/mbql"
                                     "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                     "aggregation"  [["count" {}]]
                                     "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]}
                                    {"lib/type" "mbql.stage/mbql"
                                     "filters"  [[">" {} ["field" {} "count"] 10]]}
                                    {"lib/type" "mbql.stage/mbql"
                                     "order-by" [["desc" {} ["field" {} "count"]]]}]}))
              q (get-in result [:structured-output :query])]
          (is (= 3 (count (:stages q))))
          (testing "stage 1's cross-stage filter ref carries inferred base-type"
            (is (= :type/Integer (get-in q [:stages 1 :filters 0 2 1 :base-type]))))
          (testing "stage 2's cross-stage order-by ref also carries inferred base-type"
            (is (= :type/Integer (get-in q [:stages 2 :order-by 0 2 1 :base-type])))))))))

(deftest multi-stage-unknown-cross-stage-column-surfaces-error-test
  (testing (str "If the LLM references a column name that the previous stage doesn't produce,\n"
                "repair leaves the clause alone (no `base-type` to infer) and the lib-schema\n"
                "validator surfaces the missing-key error \u2014 reflagged as :agent-error?\n"
                "by `execute-representations-query`'s catch.")
    (with-mp-and-stubs!
      (fn []
        (try
          (construct/execute-representations-query
           (query-yaml
            {"lib/type" "mbql/query"
             "database" "Sample"
             "stages"   [{"lib/type"     "mbql.stage/mbql"
                          "source-table" ["Sample" "PUBLIC" "ORDERS"]
                          "aggregation"  [["count" {}]]
                          "breakout"     [["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]]}
                         {"lib/type" "mbql.stage/mbql"
                          "filters"  [[">" {} ["field" {} "no_such_column"] 10]]}]}))
          (is false "expected throw")
          (catch clojure.lang.ExceptionInfo e
            (let [d (ex-data e)]
              (is (true? (:agent-error? d))))))))))

;;; ============================================================
;;; Step-9 contract: expressions (custom columns)
;;; ============================================================

(deftest expression-map-shape-end-to-end-test
  (testing (str "The LLM-friendly `expressions: {Name: clause, …}` map shape is normalised\n"
                "to the canonical sequential MBQL 5 form with `lib/expression-name` stamped,\n"
                "and the resolved query carries the expression in its pMBQL.")
    (with-mp-and-stubs!
      (fn []
        (let [result (construct/execute-representations-query
                      (query-yaml
                       {"lib/type" "mbql/query"
                        "database" "Sample"
                        "stages"   [{"lib/type"     "mbql.stage/mbql"
                                     "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                     "expressions"  {"Doubled" ["*" {}
                                                                ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
                                                                2]}
                                     "aggregation"  [["sum" {} ["expression" {} "Doubled"]]]}]}))
              q      (get-in result [:structured-output :query])
              exprs  (get-in q [:stages 0 :expressions])]
          (is (vector? exprs))
          (is (= 1 (count exprs)))
          (let [[op opts] (first exprs)]
            (is (= :* op))
            (is (= "Doubled" (:lib/expression-name opts))))
          (testing "expression is referenced in aggregation"
            (let [agg (get-in q [:stages 0 :aggregation 0])]
              (is (= :sum (first agg)))
              (is (= :expression (first (nth agg 2))))
              (is (= "Doubled" (nth (nth agg 2) 2))))))))))

(deftest expression-sequential-shape-end-to-end-test
  (testing (str "Canonical sequential `expressions:` form with `lib/expression-name`\n"
                "already in options also works end-to-end.")
    (with-mp-and-stubs!
      (fn []
        (let [result (construct/execute-representations-query
                      (query-yaml
                       {"lib/type" "mbql/query"
                        "database" "Sample"
                        "stages"   [{"lib/type"     "mbql.stage/mbql"
                                     "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                     "expressions"  [["+" {"lib/expression-name" "Plus10"}
                                                      ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
                                                      10]]
                                     "aggregation"  [["sum" {} ["expression" {} "Plus10"]]]}]}))
              q      (get-in result [:structured-output :query])
              exprs  (get-in q [:stages 0 :expressions])]
          (is (= 1 (count exprs)))
          (is (= "Plus10" (get-in (first exprs) [1 :lib/expression-name]))))))))

(deftest expression-in-breakout-end-to-end-test
  (testing "Expression can be referenced in `breakout:` — MBQL 5 accepts `[:expression ... name]` as a grouping key."
    (with-mp-and-stubs!
      (fn []
        (let [result (construct/execute-representations-query
                      (query-yaml
                       {"lib/type" "mbql/query"
                        "database" "Sample"
                        "stages"   [{"lib/type"     "mbql.stage/mbql"
                                     "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                     "expressions"  {"HalfTotal" ["/" {}
                                                                  ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
                                                                  2]}
                                     "breakout"     [["expression" {} "HalfTotal"]]
                                     "aggregation"  [["count" {}]]}]}))
              q      (get-in result [:structured-output :query])
              b      (get-in q [:stages 0 :breakout 0])]
          (is (= :expression (first b)))
          (is (= "HalfTotal" (nth b 2))))))))

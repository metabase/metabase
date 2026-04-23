(ns metabase.metabot.tools.construct-representations-test
  "Tests for `execute-representations-query` — the representations-format entry point for
  `construct_notebook_query`.

  Covers the happy path (YAML -> resolved pMBQL wrapped in structured output), malformed YAML,
  unknown table, and the `:agent-error?` error-translation contract.

  Most tests express the query as a Clojure data structure and serialize it via
  `yaml/generate-string` — the parser + validator then round-trip it back. Tests that
  specifically exercise parser edge cases (malformed YAML, LLM-inline shortcuts) keep raw
  YAML strings on purpose."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-be.core :as lib-be]
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

(defn- with-mp-and-stubs! [f]
  (with-redefs [lib-be/application-database-metadata-provider (fn [_db-id] mp)
                construct/resolve-source-database-id          (fn [_] 1)]
    (f)))

(defn- with-ambiguous-mp-and-stubs! [f]
  (with-redefs [lib-be/application-database-metadata-provider (fn [_db-id] mp-ambiguous)
                construct/resolve-source-database-id          (fn [_] 1)]
    (f)))

(defn- with-sample-database-mp-and-stubs! [f]
  (with-redefs [lib-be/application-database-metadata-provider (fn [_db-id] mp-sample-database)
                construct/resolve-source-database-id          (fn [_] 1)]
    (f)))

(defn- query-yaml
  "Serialize a Clojure query data structure (string-keyed, repr shape) to YAML for the tool."
  [query-data]
  (yaml/generate-string query-data))

(deftest happy-path-test
  (with-mp-and-stubs!
    (fn []
      (let [result (construct/execute-representations-query
                    {:type "table" :id 10}
                    nil
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
         {:type "table" :id 10}
         nil
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
         {:type "table" :id 10}
         nil
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
                      {:type "table" :id 10}
                      nil
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
         {:type "table" :id 10}
         nil
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

(deftest llm-uses-prompt-example-database-name-reproducer-test
  (testing (str "Reproducer: real DB is `Sample Database`, but the prompt examples all use\n"
                "`Sample`, so the LLM follows the examples and produces a query that the\n"
                "resolver rejects with :unknown-database. This is the failure observed in\n"
                "the `total revenue per product category` user query.")
    (with-sample-database-mp-and-stubs!
      (fn []
        ;; Verbatim shape of the YAML produced by the agent in the bug report:
        ;;   database: Sample
        ;;   source-table: [Sample, PUBLIC, ORDERS]
        ;;   field FKs:    [Sample, PUBLIC, ORDERS, TOTAL] / [Sample, PUBLIC, PRODUCTS, CATEGORY]
        ;; against a metadata provider whose DB name is the realistic "Sample Database".
        (let [yaml-str (query-yaml
                        {"lib/type" "mbql/query"
                         "database" "Sample"
                         "stages"   [{"lib/type"     "mbql.stage/mbql"
                                      "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                      "aggregation"  [["sum" {}
                                                       ["field" {}
                                                        ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]
                                      "breakout"     [["field" {}
                                                       ["Sample" "PUBLIC" "PRODUCTS" "CATEGORY"]]]}]})
              result   (try
                         (construct/execute-representations-query
                          {:type "table" :id 10}
                          nil
                          yaml-str)
                         (catch clojure.lang.ExceptionInfo e e))]
          (testing "the pipeline should succeed (or at minimum: not :unknown-database)"
            ;; The chart should construct cleanly. Today this fails because the resolver
            ;; insists the YAML's `database:` key match the metadata-provider name verbatim.
            (is (not (instance? clojure.lang.ExceptionInfo result))
                (str "Pipeline failed with: "
                     (when (instance? clojure.lang.ExceptionInfo result)
                       (pr-str {:msg (ex-message result) :data (ex-data result)}))))
            (when-not (instance? clojure.lang.ExceptionInfo result)
              (let [q (get-in result [:structured-output :query])]
                (is (= :mbql/query (:lib/type q)))
                (is (= 1 (:database q)))
                (is (= 10 (get-in q [:stages 0 :source-table])))))))))))

(deftest repair-fills-missing-pieces-test
  (testing "LLM-style YAML missing lib/types and {} options still resolves after repair"
    ;; Intentionally written as a raw string: the whole point of this test is that the parser
    ;; + repair pass cope with LLM-style shortcuts (missing `lib/type` markers, `[count]`
    ;; without an options map) that round-tripping through `yaml/generate-string` would
    ;; silently "fix" by emitting the canonical form.
    (with-mp-and-stubs!
      (fn []
        (let [result (construct/execute-representations-query
                      {:type "table" :id 10}
                      nil
                      (str "database: Sample\n"
                           "stages:\n"
                           "  - source-table: [Sample, PUBLIC, ORDERS]\n"
                           "    aggregation:\n"
                           "      - [count]\n"))
              q (get-in result [:structured-output :query])]
          (is (= :mbql/query (:lib/type q)))
          (is (= :count (first (get-in q [:stages 0 :aggregation 0])))))))))

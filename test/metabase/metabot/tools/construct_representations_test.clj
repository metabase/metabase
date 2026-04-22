(ns metabase.metabot.tools.construct-representations-test
  "Tests for `execute-representations-query` — the representations-format entry point for
  `construct_notebook_query`.

  Covers the happy path (YAML -> resolved pMBQL wrapped in structured output), malformed YAML,
  unknown table, and the `:agent-error?` error-translation contract."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.test-util :as lib.tu]
   [metabase.metabot.tools.construct :as construct]))

(set! *warn-on-reflection* true)

(def ^:private mp
  (lib.tu/mock-metadata-provider
   {:database {:id 1 :name "Sample"}
    :tables   [{:id 10 :name "ORDERS" :schema "PUBLIC" :db-id 1}]
    :fields   [{:id 100 :name "ID" :table-id 10 :base-type :type/Integer}
               {:id 101 :name "TOTAL" :table-id 10 :base-type :type/Float}]}))

(defn- with-mp-and-stubs! [f]
  (with-redefs [lib-be/application-database-metadata-provider (fn [_db-id] mp)
                construct/resolve-source-database-id          (fn [_] 1)]
    (f)))

(defn- yaml [& lines] (str (str/join "\n" lines) "\n"))

(deftest happy-path-test
  (with-mp-and-stubs!
    (fn []
      (let [result (construct/execute-representations-query
                    {:type "table" :id 10}
                    nil
                    (yaml "lib/type: mbql/query"
                          "database: Sample"
                          "stages:"
                          "  - lib/type: mbql.stage/mbql"
                          "    source-table: [Sample, PUBLIC, ORDERS]"
                          "    aggregation:"
                          "      - [count, {}]"))
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
         (yaml "lib/type: mbql/query"
               "database: Sample"
               "stages:"
               "  - lib/type: mbql.stage/mbql"
               "    source-table: [Sample, PUBLIC, DOES_NOT_EXIST]"
               "    aggregation:"
               "      - [count, {}]"))
        (is false "expected throw")
        (catch clojure.lang.ExceptionInfo e
          (let [d (ex-data e)]
            (is (true? (:agent-error? d)))
            (is (= :unknown-table (:error d)))))))))

(deftest repair-fills-missing-pieces-test
  (testing "LLM-style YAML missing lib/types and {} options still resolves after repair"
    (with-mp-and-stubs!
      (fn []
        (let [result (construct/execute-representations-query
                      {:type "table" :id 10}
                      nil
                      (yaml "database: Sample"
                            "stages:"
                            "  - source-table: [Sample, PUBLIC, ORDERS]"
                            "    aggregation:"
                            "      - [count]"))
              q (get-in result [:structured-output :query])]
          (is (= :mbql/query (:lib/type q)))
          (is (= :count (first (get-in q [:stages 0 :aggregation 0])))))))))

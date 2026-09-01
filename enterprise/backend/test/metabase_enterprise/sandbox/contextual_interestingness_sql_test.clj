(ns metabase-enterprise.sandbox.contextual-interestingness-sql-test
  "The contextual-interestingness scorer sends a chart's compiled SQL to an external model provider
  for semantic context. Compilation runs under the exploration creator's identity, so a sandboxed
  creator's GTAP is applied and their user-attribute values become parameters of that query.

  Those values must not reach the prompt: nobody configuring a sandbox is opting to send identity
  attributes to a third party. See [[metabase.contextual-interestingness.sql]]."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.contextual-interestingness.sql :as ci.sql]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private secret-attribute-value
  "Distinctive enough that finding it in a SQL string is unambiguous."
  "ACME-SECRET-VALUE")

(deftest sandbox-attribute-values-do-not-reach-the-llm-sql-test
  (testing "a sandboxed creator's attribute value is a parameter of the compiled query, and must be
            dropped with the rest of the params rather than inlined into the string we hand the LLM"
    (met/with-gtaps! {:gtaps      {:venues {:remappings {"acme" [:dimension [:field (mt/id :venues :name) nil]]}}}
                      :attributes {"acme" secret-attribute-value}}
      (let [mp  (mt/metadata-provider)
            sql (ci.sql/dataset-query->sql
                 (lib/->legacy-MBQL (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                        (lib/aggregate (lib/count)))))]
        (testing "sanity: we still produce SQL, and it still carries the query's structure"
          (is (string? sql))
          (is (str/includes? (u/lower-case-en sql) "count")))
        (testing "the attribute value is nowhere in it"
          (is (not (str/includes? sql secret-attribute-value))
              "sandbox attribute value was inlined into the SQL sent to the LLM provider"))))))

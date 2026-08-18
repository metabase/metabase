(ns metabase.queries.schema-test
  (:require
   [clojure.test :refer :all]
   [malli.error :as me]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel validate-query-test
  (is (= {:dataset_query {:stages [["Initial MBQL stage must have either :source-table or :source-card (but not both)"]]}}
         (me/humanize (mr/explain ::queries.schema/card
                                  {:dataset_query {:lib/type :mbql/query, :database 2378, :stages [{:lib/type :mbql.stage/mbql}]}})))))

(deftest ^:parallel maybe-legacy-or-empty-query-test
  (testing "a saved query may be empty"
    (is (mr/validate ::lib-be.schema/maybe-legacy-or-empty-query {}))
    (testing "but an incoming one may not"
      (is (not (mr/validate ::lib-be.schema/maybe-legacy-query {})))))
  (testing "legacy MBQL is not valid until it has been normalized to MBQL 5"
    (is (not (mr/validate ::lib-be.schema/maybe-legacy-query
                          {:database 1, :type :query, :query {:source-table 2}})))))

(deftest ^:parallel set-invalid-metadata-to-nil-test
  (is (= {:result_metadata nil}
         (queries.schema/normalize-card {:result_metadata [{}]}))))

(deftest ^:parallel keep-result-metadata-with-string-coercion-strategy-test
  (testing "a JSON-roundtripped column with a string :coercion_strategy must normalize, not nullify the whole metadata"
    (let [col {:name              "created_at"
               :display_name      "Created At"
               :base_type         "type/DateTime"
               :effective_type    "type/DateTime"
               :coercion_strategy "Coercion/UNIXMilliSeconds->DateTime"
               :semantic_type     "type/CreationTimestamp"
               :source            "fields"}
          normalized (queries.schema/normalize-card {:result_metadata [col]})]
      (is (=? [{:name              "created_at"
                :base_type         :type/DateTime
                :coercion_strategy :Coercion/UNIXMilliSeconds->DateTime}]
              (:result_metadata normalized))))))

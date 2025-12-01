(ns metabase.queries.schema-test
  (:require
   [clojure.test :refer :all]
   [malli.error :as me]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel validate-query-test
  (is (= {:dataset_query {:lib/metadata ["missing required key"]
                          :stages       [["Initial MBQL stage must have either :source-table or :source-card (but not both)"]]}}
         (me/humanize (mr/explain ::queries.schema/card
                                  {:dataset_query {:lib/type :mbql/query, :database 2378, :stages [{:lib/type :mbql.stage/mbql}]}})))))

(deftest ^:parallel set-invalid-metadata-to-nil-test
  (is (= {:result_metadata nil}
         (queries.schema/normalize-card {:result_metadata [{}]}))))

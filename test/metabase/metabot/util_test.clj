(ns metabase.metabot.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.util :as metabot.u]))

(deftest ^:parallel extract-sql-content-native-test
  (testing "extracts SQL from normalized MBQL 5 and legacy query shapes"
    (are [expected query] (= expected (metabot.u/extract-sql-content query))
      "SELECT 1" {:stages [{:lib/type :mbql.stage/native
                            :native   "SELECT 1"}]}
      "SELECT 2" {:native {:query "SELECT 2"}})))

(deftest ^:parallel extract-sql-content-orphaned-query-test
  (testing "extracts SQL from orphaned string-keyed query shapes"
    (are [expected query] (= expected (metabot.u/extract-sql-content query))
      "SELECT 3" {"database" nil
                  "native"   {"query" "SELECT 3"}}
      "SELECT 4" {"database" nil
                  "stages"   [{"native" "SELECT 4"}]})))

(deftest ^:parallel extract-sql-content-multi-stage-test
  (testing "does not mistake the first stage of a multi-stage query for the whole query"
    (are [query] (nil? (metabot.u/extract-sql-content query))
      {:stages [{:lib/type :mbql.stage/native :native "SELECT 5"}
                {:lib/type :mbql.stage/mbql}]}
      {"stages" [{"native" "SELECT 6"}
                 {"lib/type" "mbql.stage/mbql"}]})))

(deftest ^:parallel extract-sql-content-non-native-test
  (testing "a non-native MBQL query has no SQL content"
    (is (nil? (metabot.u/extract-sql-content
               {:stages [{:lib/type :mbql.stage/mbql :source-table 1}]})))))

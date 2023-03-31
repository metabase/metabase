(ns metabase.lib.normalize-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]))

(deftest ^:parallel normalize-query-type-test
  (testing "Query type should get normalized"
    (is (= {:type :native}
           (lib/normalize {:type "native"})))))

(deftest ^:parallel do-not-normalize-native-queries-test
  (testing "native queries should NOT get normalized"
    (are [x expected] (= expected
                         (lib/normalize x))
      {"lib/type" "mbql/query"
       "stages"   [{"lib/type" "mbql.stage/native"
                    "native"   "SELECT COUNT(*) FROM CANS;"}]}
      {:lib/type :mbql/query
       :stages   [{:lib/type :mbql.stage/native
                   :native   "SELECT COUNT(*) FROM CANS;"}]}

      {:lib/type :mbql/query
       :stages   [{"lib/type" "mbql.stage/native"
                   "native"   {:NAME         "FAKE_QUERY"
                               "description" "Theoretical fake query in a JSON-based query lang"}}]}
      {:lib/type :mbql/query
       :stages   [{:lib/type :mbql.stage/native
                   :native   {:NAME         "FAKE_QUERY"
                              "description" "Theoretical fake query in a JSON-based query lang"}}]})))

(deftest ^:parallel normalize-value-test
  (testing ":value clauses should keep snake_case keys in the type info arg"
    ;; See https://github.com/metabase/metabase/issues/23354 for details
    (is (= [:value {:some_key "some key value"} "some value"]
           (lib/normalize [:value {:some_key "some key value"} "some value"])))))

(deftest ^:parallel e2e-test
  (is (= {:lib/type :mbql/query
          :database 1
          :type     :pipeline
          :stages   [{:lib/type     :mbql.stage/mbql
                      :lib/options  {:lib/uuid "a8f41095-1e37-4da6-a4e5-51a9c2c3f523"}
                      :source-table 1
                      :aggregation  [[:count {:lib/uuid "a6685a7d-62b3-4ceb-a13f-f9db405dcb49"}]]
                      :filter       [:=
                                     {:lib/uuid "c4984ada-f8fe-4ac2-b6b4-45885527f5b4"}
                                     [:field
                                      {:base-type :type/Integer
                                       :lib/uuid "5a84d551-ea5f-44f4-952f-2162f05cdcc4"}
                                      1]
                                     4]}]}
         (lib/normalize
          {"lib/type" "mbql/query"
           "database" 1
           "type"     "pipeline"
           "stages"   [{"lib/type"     "mbql.stage/mbql"
                        "lib/options"  {"lib/uuid" "a8f41095-1e37-4da6-a4e5-51a9c2c3f523"}
                        "source-table" 1
                        "aggregation"  [["count" {"lib/uuid" "a6685a7d-62b3-4ceb-a13f-f9db405dcb49"}]]
                        "filter"       ["="
                                        {"lib/uuid" "c4984ada-f8fe-4ac2-b6b4-45885527f5b4"}
                                        ["field"
                                         {"base-type" "type/Integer"
                                          "lib/uuid"  "5a84d551-ea5f-44f4-952f-2162f05cdcc4"}
                                         1]
                                        4]}]}))))

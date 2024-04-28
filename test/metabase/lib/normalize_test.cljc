(ns metabase.lib.normalize-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel do-not-normalize-native-queries-test
  (testing "native queries should NOT get normalized"
    (are [x expected] (= expected
                         (lib/normalize x))
      {"lib/type" "mbql/query"
       "database" 1
       "stages"   [{"lib/type" "mbql.stage/native"
                    "native"   "SELECT COUNT(*) FROM CANS;"}]}
      {:lib/type :mbql/query
       :database 1
       :stages   [{:lib/type :mbql.stage/native
                   :native   "SELECT COUNT(*) FROM CANS;"}]}

      {:lib/type :mbql/query
       :database 1
       :stages   [{"lib/type" "mbql.stage/native"
                   "native"   {:NAME         "FAKE_QUERY"
                               "description" "Theoretical fake query in a JSON-based query lang"}}]}
      {:lib/type :mbql/query
       :database 1
       :stages   [{:lib/type :mbql.stage/native
                   :native   {:NAME         "FAKE_QUERY"
                              "description" "Theoretical fake query in a JSON-based query lang"}}]})))

(deftest ^:parallel normalize-value-test
  ;; huh? The schema for this says `:effective-type` is required... I'm confused about why we need to preserve snake
  ;; keys
  (testing ":value clauses should keep snake_case keys in the type info arg (#23354)"
    (is (= [:value {:lib/uuid       "ca0a1ee8-a9a6-4ca7-8a78-699c352fac7c"
                    :effective-type :type/Integer
                    :some_key       "some key value"}
            "some value"]
           (lib/normalize [:value {:lib/uuid       "ca0a1ee8-a9a6-4ca7-8a78-699c352fac7c"
                                   :effective-type :type/Integer
                                   :some_key       "some key value"}
                           "some value"])
           (lib/normalize ["value" {"lib/uuid"       "ca0a1ee8-a9a6-4ca7-8a78-699c352fac7c"
                                    "effective-type" "type/Integer"
                                    "some_key"       "some key value"}
                           "some value"])))))

(deftest ^:parallel e2e-test
  (is (= {:lib/type :mbql/query
          :database 1
          :stages   [{:lib/type     :mbql.stage/mbql
                      :source-table 1
                      :aggregation  [[:count {:lib/uuid "a6685a7d-62b3-4ceb-a13f-f9db405dcb49"}]]
                      :filters      [[:=
                                      {:lib/uuid "c4984ada-f8fe-4ac2-b6b4-45885527f5b4"}
                                      [:field
                                       {:base-type :type/Integer
                                        :lib/uuid  "5a84d551-ea5f-44f4-952f-2162f05cdcc4"}
                                       1]
                                      4]]}]}
         (lib/normalize
          {"lib/type" "mbql/query"
           "database" 1
           "stages"   [{"lib/type"     "mbql.stage/mbql"
                        "source-table" 1
                        "aggregation"  [["count" {"lib/uuid" "a6685a7d-62b3-4ceb-a13f-f9db405dcb49"}]]
                        "filters"      [["="
                                         {"lib/uuid" "c4984ada-f8fe-4ac2-b6b4-45885527f5b4"}
                                         ["field"
                                          {"base-type" "type/Integer"
                                           "lib/uuid"  "5a84d551-ea5f-44f4-952f-2162f05cdcc4"}
                                          1]
                                         4]]}]}))))

(deftest ^:parallel normalize-native-query-test
  (let [metadata-provider meta/metadata-provider
        query             (lib/query metadata-provider {:lib/type :mbql.stage/native
                                                        :native   "SELECT *;"})]
    (is (= {:lib/type     :mbql/query
            :lib/metadata meta/metadata-provider
            :database     (meta/id)
            :stages       [{:lib/type :mbql.stage/native
                            :native   "SELECT *;"}]}
           (lib/normalize query)))))

(deftest ^:parallel add-uuids-test
  (testing "Normalization should add :lib/uuid if it is missing"
    (is (=? {:lib/type :mbql/query
             :database 1
             :stages   [{:lib/type     :mbql.stage/mbql
                         :source-table 1
                         :aggregation  [[:count {:lib/uuid string?}]]
                         :filters      [[:=
                                         {:lib/uuid string?}
                                         [:field {:lib/uuid string?} 1]
                                         4]]}]}
            (lib/normalize
             {"lib/type" "mbql/query"
              "database" 1
              "stages"   [{"lib/type"     "mbql.stage/mbql"
                           "source-table" 1
                           "aggregation"  [["count" {}]]
                           "filters"      [["=" {} ["field" {} 1] 4]]}]})))))

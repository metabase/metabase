(ns metabase.lib.normalize-test
  (:require
   [clojure.set :as set]
   [clojure.test :as t :refer [deftest is are testing]]
   [metabase.lib.normalize :as lib.normalize]))


(deftest ^:parallel normalize-query-type-test
  (testing "Query type should get normalized"
    (is (= {:type :native}
           (lib.normalize/normalize {:type "native"})))))

(deftest ^:parallel do-not-normalize-native-queries-test
  (testing "native queries should NOT get normalized"
    (are [x expected] (= expected
                         (lib.normalize/normalize x))
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
      {:stages [{:lib/type :mbql.stage/native
                 :native   {:NAME         "FAKE_QUERY"
                            "description" "Theoretical fake query in a JSON-based query lang"}}]})))



(deftest ^:parallel normalize-value-test
  (testing ":value clauses should keep snake_case keys in the type info arg"
    ;; See https://github.com/metabase/metabase/issues/23354 for details
    (is (= [:value {:some_key "some key value"} "some value"]
           (lib.normalize/normalize [:value {:some_key "some key value"} "some value"])))))

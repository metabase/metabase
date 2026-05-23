(ns metabase.agent-lib.representations-test
  "Tests for the representations boundary helpers — JSON external-query validation, the
  external↔portable conversion, and the post-repair portable-form sanity schema."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.representations :as repr]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; external-query->portable
;;; ============================================================

(deftest external-query->portable-test
  (testing "stringifies map keys preserving namespace"
    (is (= {"lib/type"     "mbql/query"
            "database"     "Sample"
            "stages"       [{"lib/type"     "mbql.stage/mbql"
                             "source-table" ["Sample" "PUBLIC" "ORDERS"]
                             "limit"        5}]}
           (repr/external-query->portable
            {:lib/type "mbql/query"
             :database "Sample"
             :stages   [{:lib/type     "mbql.stage/mbql"
                         :source-table ["Sample" "PUBLIC" "ORDERS"]
                         :limit        5}]}))))
  (testing "stringifies keyword values too"
    (is (= {"lib/type" "mbql/query"
            "stages"   [{"lib/type" "mbql.stage/mbql"}]}
           (repr/external-query->portable
            {:lib/type :mbql/query
             :stages   [{:lib/type :mbql.stage/mbql}]}))))
  (testing "leaves string values untouched"
    (is (= {"stages" [{"source-table" ["Sample" "PUBLIC" "ORDERS"]
                       "aggregation"  [["count" {}]]}]}
           (repr/external-query->portable
            {:stages [{:source-table ["Sample" "PUBLIC" "ORDERS"]
                       :aggregation  [["count" {}]]}]}))))
  (testing "preserves nil for schemaless table FK"
    (is (= {"stages" [{"source-table" ["Mongo" nil "orders"]}]}
           (repr/external-query->portable
            {:stages [{:source-table ["Mongo" nil "orders"]}]})))))

;;; ============================================================
;;; validate-external-query
;;; ============================================================

(deftest validate-external-query-happy-path-test
  (testing "valid external-query with string-valued enums"
    (let [q {:lib/type "mbql/query"
             :database "Sample"
             :stages   [{:lib/type     "mbql.stage/mbql"
                         :source-table ["Sample" "PUBLIC" "ORDERS"]
                         :limit        5}]}
          decoded (repr/validate-external-query q)]
      (testing "string-transformer keywordizes enum values"
        (is (= :mbql/query (:lib/type decoded))))
      (testing "ID-typed strings stay as strings (substituted in ::external-query)"
        (is (= "Sample" (:database decoded))))
      (testing "portable FK vectors pass through unchanged"
        (is (= ["Sample" "PUBLIC" "ORDERS"]
               (get-in decoded [:stages 0 :source-table])))))))

(deftest validate-external-query-error-paths-test
  (testing "missing :stages"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"invalid structure"
                          (repr/validate-external-query
                           {:lib/type "mbql/query"})))))

;;; ============================================================
;;; validate-query (post-repair, portable form)
;;; ============================================================

(defn- validate-query-error [parsed]
  (try
    (repr/validate-query parsed)
    nil
    (catch clojure.lang.ExceptionInfo e
      (ex-data e))))

(deftest validate-query-happy-path-test
  (testing "minimal valid portable form"
    (let [parsed {"lib/type" "mbql/query"
                  "database" "Sample"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]
                               "aggregation"  [["count" {}]]}]}]
      (is (= parsed (repr/validate-query parsed)))))
  (testing "schemaless source-table (null schema)"
    (let [parsed {"lib/type" "mbql/query"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Mongo" nil "orders"]
                               "aggregation"  [["count" {}]]}]}]
      (is (= parsed (repr/validate-query parsed))))))

(deftest validate-query-error-paths-test
  (testing "missing lib/type on query"
    (let [parsed {"database" "Sample"
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]}]}
          data   (validate-query-error parsed)]
      (is (= :invalid-representations-query (:error data)))
      (is (= 400 (:status-code data)))))
  (testing "wrong lib/type value on query"
    (is (some? (validate-query-error {"lib/type" "mbql/wrong"
                                      "stages"   [{"lib/type" "mbql.stage/mbql"}]}))))
  (testing "empty stages"
    (is (some? (validate-query-error {"lib/type" "mbql/query"
                                      "stages"   []}))))
  (testing "table FK too short"
    (is (some? (validate-query-error {"lib/type" "mbql/query"
                                      "stages"   [{"lib/type"     "mbql.stage/mbql"
                                                   "source-table" ["Sample" "PUBLIC"]}]}))))
  (testing "missing options map on a clause (nil in slot 1)"
    (is (some? (validate-query-error {"lib/type" "mbql/query"
                                      "stages"   [{"lib/type"     "mbql.stage/mbql"
                                                   "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                                   "aggregation"  [["count" nil]]}]}))))
  (testing "clause head must be a non-blank string"
    (is (some? (validate-query-error {"lib/type" "mbql/query"
                                      "stages"   [{"lib/type"     "mbql.stage/mbql"
                                                   "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                                   "aggregation"  [["" {}]]}]})))))

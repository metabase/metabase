(ns metabase.agent-lib.representations-test
  "Tests for the representations boundary helpers — JSON external-query validation, the
  external↔portable conversion, and the post-repair portable-form sanity schema."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.agent-lib.representations :as repr]
   [metabase.util.malli.humanize :as mu.humanize]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; external-query->portable
;;; ============================================================

(deftest ^:parallel external-query->portable-test
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

(deftest ^:parallel validate-external-query-happy-path-test
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

(deftest ^:parallel validate-external-query-error-paths-test
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

(deftest ^:parallel validate-query-happy-path-test
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

(deftest ^:parallel validate-query-error-paths-test
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

(defn- join-query-with-lib-type
  "A minimal portable query with a single explicit join with `join-lib-type`.
  `join-lib-type` is spliced into the join (or, when `nil`, the `lib/type` key is omitted)."
  [join-lib-type]
  (let [condition ["=" {}
                   ["field" {} ["Sample" "PUBLIC" "ORDERS" "PRODUCT_ID"]]
                   ["field" {"join-alias" "P"} ["Sample" "PUBLIC" "PRODUCTS" "ID"]]]
        join      (cond-> {"alias"      "P"
                           "conditions" [condition]
                           "stages"     [{"lib/type"     "mbql.stage/mbql"
                                          "source-table" ["Sample" "PUBLIC" "PRODUCTS"]}]}
                    join-lib-type (assoc "lib/type" join-lib-type))]
    {"lib/type" "mbql/query"
     "database" "Sample"
     "stages"   [{"lib/type"     "mbql.stage/mbql"
                  "source-table" ["Sample" "PUBLIC" "ORDERS"]
                  "joins"        [join]}]}))

(deftest ^:parallel validate-query-canonical-join-lib-type-test
  (testing "a join with the canonical `mbql/join` lib/type validates"
    (let [parsed (join-query-with-lib-type "mbql/join")]
      (is (= parsed (repr/validate-query parsed))))))

(deftest ^:parallel validate-query-misspelled-join-lib-type-test
  (testing "BOT-1657: a join with the misspelled `mbql.join/join` lib/type is rejected"
    (let [data (validate-query-error (join-query-with-lib-type "mbql.join/join"))]
      (is (= :invalid-representations-query (:error data)))
      (is (= 400 (:status-code data))))))

(deftest ^:parallel validate-query-missing-join-lib-type-test
  (testing "a join with no lib/type is rejected"
    (let [data (validate-query-error (join-query-with-lib-type nil))]
      (is (= :invalid-representations-query (:error data)))
      (is (= 400 (:status-code data))))))

(deftest ^:parallel humanized-paths-test
  (let [base-query {"lib/type" "mbql/query"
                    "stages" [{"lib/type" "mbql.stage/mbql"
                               "source-table" ["Sample" "PUBLIC" "ORDERS"]}]}
        stage-query #(update-in base-query ["stages" 0] merge %)
        problem     "should be a vector, clause must be [operator-string, options-map, \u2026args]"
        field       ["field" {} ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]
        join-query  (join-query-with-lib-type "mbql/join")]
    (doseq [[query expected]
            [[(stage-query {"filters" {"op" ">"}})
              "stages[0].filters: invalid type"]
             [(stage-query {"filters" [{"op" ">"}]})
              (str "stages[0].filters[0]: " problem)]
             [(stage-query {"filters" [{"op" ">"} {"op" "<"}]})
              (str "stages[0].filters[0]: " problem "; stages[0].filters[1]: " problem)]
             [(stage-query {"filters" [[">" {} field 1] {"op" "<"} {"op" "="}]})
              (str "stages[0].filters[1]: " problem "; stages[0].filters[2]: " problem)]
             [(update base-query "stages" conj {"lib/type" "mbql.stage/mbql" "filters" [{"op" ">"}]})
              (str "stages[1].filters[0]: " problem)]
             [(update (stage-query {"filters" [{"op" ">"}]}) "stages" conj
                      {"lib/type" "mbql.stage/mbql" "aggregation" [{"op" "sum"}]})
              (str "stages[0].filters[0]: " problem "; stages[1].aggregation[0]: " problem)]
             [(assoc-in join-query ["stages" 0 "joins" 0 "fields"] [{"x" 1}])
              (str "stages[0].joins[0].fields: should be either \"all\" or \"none\"; "
                   "stages[0].joins[0].fields[0]: " problem)]
             [(stage-query {"joins" ["P"]})
              "stages[0].joins[0]: invalid type"]
             [(-> join-query
                  (assoc-in ["stages" 0 "joins" 0 "stages"] [])
                  (assoc-in ["stages" 0 "joins" 0 "conditions"] [{"op" "="}]))
              (str "stages[0].joins[0].stages: should have at least 1 elements; "
                   "stages[0].joins[0].conditions[0]: " problem)]]]
      (testing (pr-str query)
        (is (= expected (repr/humanized->paths (:humanized (validate-query-error query)))))))
    (testing "a valid query produces no failing paths"
      (is (= "" (repr/humanized->paths (:humanized (validate-query-error base-query))))))
    (testing "errors on the whole query have an explicit location"
      (is (= "(root): invalid type" (repr/humanized->paths (:humanized (validate-query-error nil)))))))
  (testing "keyword keys retain their namespace"
    (is (= "stages[0].lib/type: missing required key"
           (repr/humanized->paths
            (mu.humanize/humanize
             (mr/explain [:map [:stages [:sequential [:map [:lib/type :string]]]]]
                         {:stages [{}]})))))))

(deftest ^:parallel humanized-paths-length-test
  (let [humanized (fn [message]
                    (mu.humanize/humanize
                     (mr/explain [:map ["filters" [:fn {:error/message message} (constantly false)]]]
                                 {"filters" nil})))]
    (testing "short explanations retain all their text"
      (let [text (apply str (repeat 491 "x"))]
        (is (= (str "filters: " text) (repr/humanized->paths (humanized text))))))
    (testing "long explanations end with an ellipsis within the character budget"
      (is (= (str "filters: " (apply str (repeat 490 "x")) "\u2026")
             (repr/humanized->paths (humanized (apply str (repeat 1000 "x")))))))))

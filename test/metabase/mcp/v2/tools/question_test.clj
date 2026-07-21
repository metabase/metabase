(ns metabase.mcp.v2.tools.question-test
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.v2.tools.question :as v2.question]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(comment v2.question/keep-me)

(deftest resolve-query-source-exactly-one-test
  (mt/with-current-user (mt/user->id :rasta)
    (testing "zero sources is a teaching error"
      (is (thrown-with-msg? Exception #"exactly one"
                            (#'v2.question/resolve-query-source {} nil))))
    (testing "two sources is a teaching error"
      (is (thrown-with-msg? Exception #"exactly one"
                            (#'v2.question/resolve-query-source
                             {:query {:database (mt/id) :stages [{}]}
                              :native {:database_id (mt/id) :sql "SELECT 1"}} nil))))
    (testing "native builds a native dataset_query"
      (let [q (#'v2.question/resolve-query-source
               {:native {:database_id (mt/id) :sql "SELECT 1"}} nil)]
        (is (=? {:stages [{:lib/type :mbql.stage/native :native "SELECT 1"}]} q))))))

(defn- tag-by-name
  "Template tags are stored on the pMBQL stage as a vector (not a map keyed by name — see
   `metabase.lib.schema.template-tag/template-tags`), so tests look up by `:name`."
  [q tag-name]
  (some #(when (= tag-name (:name %)) %) (get-in q [:stages 0 :template-tags])))

(deftest native-template-tags-test
  (mt/with-current-user (mt/user->id :rasta)
    (testing "a supplied tag not present in the SQL is a teaching error"
      (is (thrown-with-msg? Exception #"\{\{missing\}\}"
                            (#'v2.question/resolve-query-source
                             {:native {:database_id (mt/id)
                                       :sql "SELECT 1"
                                       :template_tags {"missing" {:type "number"}}}} nil))))
    (testing "a typed tag present in the SQL is applied"
      (let [q (#'v2.question/resolve-query-source
               {:native {:database_id (mt/id)
                         :sql "SELECT * FROM orders WHERE total > {{min_total}}"
                         :template_tags {"min_total" {:type "number"}}}} nil)]
        (is (= :number (:type (tag-by-name q "min_total"))))))
    (testing "a dimension tag with a field ref and widget type is applied"
      (let [field-id (mt/id :orders :total)
            q (#'v2.question/resolve-query-source
               {:native {:database_id (mt/id)
                         :sql "SELECT * FROM orders WHERE {{d}}"
                         :template_tags {"d" {:type "dimension"
                                              :dimension [:field {:lib/uuid (str (random-uuid))} field-id]
                                              :widget_type "number/="}}}} nil)]
        (is (=? {:type :dimension
                 :widget-type :number/=
                 :dimension [:field {} field-id]}
                (tag-by-name q "d")))))))

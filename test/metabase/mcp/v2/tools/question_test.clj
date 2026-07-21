(ns metabase.mcp.v2.tools.question-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.tools.question :as v2.question]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
    (testing "a dimension tag with a field_id and widget type is applied"
      (let [field-id (mt/id :orders :total)
            q (#'v2.question/resolve-query-source
               {:native {:database_id (mt/id)
                         :sql "SELECT * FROM orders WHERE {{d}}"
                         :template_tags {"d" {:type "dimension"
                                              :field_id field-id
                                              :widget_type "number/="}}}} nil)]
        (is (=? {:type :dimension
                 :widget-type :number/=
                 :dimension [:field {} field-id]}
                (tag-by-name q "d")))))))

(deftest create-question-happy-path-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [args   {:method "create"
                    :name "Agent Q"
                    :query {:database (mt/id)
                            :stages [{:source-table (mt/id :orders)}]}}
            result (registry/call-tool #{"agent:question:create"} (str (random-uuid)) "question_write" args)]
        (is (not (:isError result)) (-> result :content first :text))
        (let [card-id (:id (:structuredContent result))]
          (is (int? card-id))
          (is (= "Agent Q" (t2/select-one-fn :name :model/Card :id card-id)))
          (is (= :question (t2/select-one-fn :type :model/Card :id card-id))))))))

(deftest create-question-name-required-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [result (registry/call-tool #{"agent:question:create"} nil "question_write"
                                     {:method "create" :query {:database (mt/id) :stages [{}]}})]
      (is (:isError result))
      (is (re-find #"`name` is required" (-> result :content first :text))))))

(deftest create-question-collection-target-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [base-args {:method "create"
                       :query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}}]
        (testing "collection_id: \"root\" saves to the root collection"
          (let [result (registry/call-tool #{"agent:question:create"} (str (random-uuid)) "question_write"
                                           (assoc base-args :name "Agent Q root" :collection_id "root"))]
            (is (not (:isError result)) (-> result :content first :text))
            (is (nil? (t2/select-one-fn :collection_id :model/Card
                                        :id (:id (:structuredContent result)))))))
        (testing "omitted collection_id saves to the caller's personal collection"
          (let [personal-id (:id (collection/user->personal-collection (mt/user->id :crowberto)))
                result (registry/call-tool #{"agent:question:create"} (str (random-uuid)) "question_write"
                                           (assoc base-args :name "Agent Q personal"))]
            (is (not (:isError result)) (-> result :content first :text))
            (is (= personal-id (t2/select-one-fn :collection_id :model/Card
                                                 :id (:id (:structuredContent result)))))))))))

(deftest create-model-with-column-metadata-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [args   {:method "create"
                    :card_type "model"
                    :name "Agent Model"
                    :query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}
                    :column_metadata [{:name "total" :display_name "Total $" :semantic_type "type/Currency"}]}
            result (registry/call-tool #{"agent:question:create"} (str (random-uuid)) "question_write" args)]
        (is (not (:isError result)) (-> result :content first :text))
        (let [card-id (:id (:structuredContent result))]
          (is (= :model (t2/select-one-fn :type :model/Card :id card-id)))
          (is (= "Agent Model" (t2/select-one-fn :name :model/Card :id card-id)))
          (is (=? [{:name "total" :display_name "Total $" :semantic_type :type/Currency}]
                  (t2/select-one-fn :result_metadata :model/Card :id card-id))))))))

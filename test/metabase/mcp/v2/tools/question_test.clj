(ns metabase.mcp.v2.tools.question-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]
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

(defn- create-model-result-metadata
  "Create a model card via the tool with `extra-args` merged in, returning its persisted
   `result_metadata`."
  [extra-args]
  (let [base-args {:method "create" :card_type "model"
                   :query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}}
        result    (registry/call-tool #{"agent:question:create"} (str (random-uuid)) "question_write"
                                      (merge base-args extra-args))]
    (is (not (:isError result)) (-> result :content first :text))
    (t2/select-one-fn :result_metadata :model/Card :id (:id (:structuredContent result)))))

(deftest create-model-with-column-metadata-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [baseline         (create-model-result-metadata {:name "Agent Model Baseline"})
            result-metadata  (create-model-result-metadata
                              {:name "Agent Model"
                               :column_metadata [{:name "TOTAL" :display_name "Total $" :semantic_type "type/Currency"}]})
            by-name          (into {} (map (juxt :name identity)) result-metadata)]
        (testing "every query column is present, not just the annotated one"
          (is (= (count baseline) (count result-metadata))))
        (testing "the annotated column carries the override plus its real (non-fake) base_type"
          (is (=? {:display_name "Total $" :semantic_type :type/Currency :base_type :type/Float}
                  (get by-name "TOTAL"))))
        (testing "a non-annotated column is still present with its real base_type"
          (is (=? {:base_type :type/BigInteger}
                  (get by-name "ID"))))))))

(deftest create-model-with-unknown-column-metadata-name-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [args   {:method "create"
                  :card_type "model"
                  :name "Agent Model Bad Column"
                  :query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}
                  :column_metadata [{:name "NOT_A_REAL_COLUMN" :display_name "whoops"}]}
          result (registry/call-tool #{"agent:question:create"} (str (random-uuid)) "question_write" args)]
      (is (:isError result))
      (is (re-find #"\"NOT_A_REAL_COLUMN\" is not in the query results"
                   (-> result :content first :text))))))

(deftest create-native-model-with-column-metadata-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-current-user (mt/user->id :crowberto)
      (testing "column_metadata on a native-source model is a teaching error, not a bogus \"not in results\" error"
        (let [args   {:method "create"
                      :card_type "model"
                      :name "Native Model With CM"
                      :native {:database_id (mt/id) :sql "SELECT * FROM orders"}
                      :column_metadata [{:name "TOTAL" :display_name "Total $"}]}
              result (registry/call-tool #{"agent:question:create"} (str (random-uuid)) "question_write" args)]
          (is (:isError result))
          (is (re-find #"column_metadata isn't supported for models built from a native \(SQL\) query"
                       (-> result :content first :text)))))
      (testing "a native-source model without column_metadata still creates fine"
        (let [args   {:method "create"
                      :card_type "model"
                      :name "Native Model No CM"
                      :native {:database_id (mt/id) :sql "SELECT * FROM orders"}}
              result (registry/call-tool #{"agent:question:create"} (str (random-uuid)) "question_write" args)]
          (is (not (:isError result)) (-> result :content first :text))
          (is (= :model (t2/select-one-fn :type :model/Card :id (:id (:structuredContent result))))))))))

(deftest create-dashboard-question-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard dash {:collection_id nil}]
        (let [args   {:method "create"
                      :name "Dash Q"
                      :dashboard_id (:id dash)
                      :query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}}
              result (registry/call-tool #{"agent:question:create"} (str (random-uuid)) "question_write" args)]
          (is (not (:isError result)) (-> result :content first :text))
          (let [card-id (:id (:structuredContent result))]
            (is (= (:id dash) (t2/select-one-fn :dashboard_id :model/Card :id card-id)))))))))

(deftest create-dashboard-question-model-type-rejected-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard dash {:collection_id nil}]
      (let [args   {:method "create"
                    :card_type "model"
                    :name "Dash Model"
                    :dashboard_id (:id dash)
                    :query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}}
            result (registry/call-tool #{"agent:question:create"} (str (random-uuid)) "question_write" args)]
        (is (:isError result))
        (is (re-find #"Invalid dashboard-internal card" (-> result :content first :text)))))))

(deftest create-dashboard-question-collection-id-exclusivity-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard dash {:collection_id nil}
                   :model/Collection coll {}]
      (let [args   {:method "create"
                    :name "Dash Q Both"
                    :dashboard_id (:id dash)
                    :collection_id (:id coll)
                    :query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}}
            result (registry/call-tool #{"agent:question:create"} (str (random-uuid)) "question_write" args)]
        (is (:isError result))
        (is (re-find #"Pass either collection_id or dashboard_id, not both"
                     (-> result :content first :text)))))))

;;; ------------------------------------------------------ Update --------------------------------------------------

(deftest update-question-rename-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card card {:name "Before" :dataset_query (mt/mbql-query orders)}]
      (let [result (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                       {:method "update" :id (:id card) :description "new desc"})]
        (is (not (:isError result)) (-> result :content first :text))
        (is (= "new desc" (t2/select-one-fn :description :model/Card :id (:id card))))))))

(deftest update-archive-restore-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card card {:archived false :dataset_query (mt/mbql-query orders)}]
      (let [archive-result (registry/call-tool #{::scope/unrestricted} nil "question_write" {:method "update" :id (:id card) :archived true})]
        (is (not (:isError archive-result)) (-> archive-result :content first :text)))
      (is (true? (t2/select-one-fn :archived :model/Card :id (:id card))))
      (let [restore-result (registry/call-tool #{::scope/unrestricted} nil "question_write" {:method "update" :id (:id card) :archived false})]
        (is (not (:isError restore-result)) (-> restore-result :content first :text)))
      (is (false? (t2/select-one-fn :archived :model/Card :id (:id card)))))))

(deftest update-not-found-collapses-test
  (mt/with-current-user (mt/user->id :rasta)
    (let [result (registry/call-tool #{::scope/unrestricted} nil "question_write"
                                     {:method "update" :id 999999999 :name "x"})]
      (is (:isError result))
      (is (re-find #"not found" (-> result :content first :text))))))

(deftest update-scope-denied-test
  (mt/with-temp [:model/Card card {:name "X"}]
    (let [result (registry/call-tool #{"agent:question:create"} nil "question_write"
                                     {:method "update" :id (:id card) :name "Y"})]
      (is (:isError result))
      (is (re-find #"method: update" (-> result :content first :text))))))

(deftest update-question-swap-query-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query orders)}]
      (let [new-query {:database (mt/id) :stages [{:source-table (mt/id :products)}]}
            result    (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                          {:method "update" :id (:id card) :query new-query})]
        (is (not (:isError result)) (-> result :content first :text))
        (is (=? {:stages [{:source-table (mt/id :products)}]}
                (t2/select-one-fn :dataset_query :model/Card :id (:id card))))))))

(deftest update-model-column-metadata-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [baseline (create-model-result-metadata {:name "Update Model Baseline"})
            create-result (registry/call-tool #{"agent:question:create"} (str (random-uuid)) "question_write"
                                              {:method "create" :card_type "model"
                                               :name "Update Model"
                                               :query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}})
            card-id (:id (:structuredContent create-result))
            update-result (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                              {:method "update" :id card-id
                                               :column_metadata [{:name "TOTAL" :display_name "Total $"
                                                                  :semantic_type "type/Currency"}]})
            result-metadata (t2/select-one-fn :result_metadata :model/Card :id card-id)
            by-name (into {} (map (juxt :name identity)) result-metadata)]
        (is (not (:isError update-result)) (-> update-result :content first :text))
        (testing "every query column is still present, not just the annotated one"
          (is (= (count baseline) (count result-metadata))))
        (testing "the annotated column carries the override plus its real (non-fake) base_type"
          (is (=? {:display_name "Total $" :semantic_type :type/Currency :base_type :type/Float}
                  (get by-name "TOTAL"))))
        (testing "a non-annotated column is still present with its real base_type, unmodified"
          (is (=? {:base_type :type/BigInteger}
                  (get by-name "ID"))))))))

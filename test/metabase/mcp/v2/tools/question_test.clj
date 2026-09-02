(ns metabase.mcp.v2.tools.question-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.api.macros.scope :as scope]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.v2.queries :as v2.queries]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.tools.question :as v2.question]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.queries.core :as queries]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment v2.question/keep-me)

(defn- orders-query
  "A Lib query over ORDERS — a runnable `:dataset_query` for fixtures that only need the card to
   have one."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :orders)))))

(deftest resolve-query-source-exactly-one-test
  (mt/with-current-user (mt/user->id :rasta)
    (testing "zero sources is a teaching error"
      (is (thrown-with-msg? Exception #"exactly one"
                            (#'v2.question/resolve-query-source {} nil nil))))
    (testing "two sources is a teaching error"
      (is (thrown-with-msg? Exception #"exactly one"
                            (#'v2.question/resolve-query-source
                             {:query {:database (mt/id) :stages [{}]}
                              :native {:database_id (mt/id) :sql "SELECT 1"}} nil nil))))
    (testing "native builds a native dataset_query"
      (let [q (#'v2.question/resolve-query-source
               {:native {:database_id (mt/id) :sql "SELECT 1"}} nil nil)]
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
                                       :template_tags {"missing" {:type "number"}}}} nil nil))))
    (testing "a typed tag present in the SQL is applied"
      (let [q (#'v2.question/resolve-query-source
               {:native {:database_id (mt/id)
                         :sql "SELECT * FROM orders WHERE total > {{min_total}}"
                         :template_tags {"min_total" {:type "number"}}}} nil nil)]
        (is (= :number (:type (tag-by-name q "min_total"))))))
    (testing "a dimension tag without a widget_type is a teaching error"
      (is (thrown-with-msg? Exception #"dimension template tag requires a widget_type"
                            (#'v2.question/resolve-query-source
                             {:native {:database_id (mt/id)
                                       :sql "SELECT * FROM orders WHERE {{d}}"
                                       :template_tags {"d" {:type "dimension"
                                                            :field_id (mt/id :orders :total)}}}} nil nil))))
    (testing "a dimension tag with a field_id and widget type is applied"
      (let [field-id (mt/id :orders :total)
            q (#'v2.question/resolve-query-source
               {:native {:database_id (mt/id)
                         :sql "SELECT * FROM orders WHERE {{d}}"
                         :template_tags {"d" {:type "dimension"
                                              :field_id field-id
                                              :widget_type "number/="}}}} nil nil)]
        (is (=? {:type :dimension
                 :widget-type :number/=
                 :dimension [:field {} field-id]}
                (tag-by-name q "d")))))))

(deftest native-template-tags-teaching-errors-carry-the-contract-test
  (mt/with-current-user (mt/user->id :rasta)
    (testing "a dimension tag without a field_id names field_id and embeds the tag shape"
      (is (thrown-with-msg? Exception #"(?s)requires a field_id.*template_tags is a map keyed by \{\{tag\}\} name"
                            (#'v2.question/resolve-query-source
                             {:native {:database_id (mt/id)
                                       :sql "SELECT * FROM orders WHERE {{d}}"
                                       :template_tags {"d" {:type "dimension"
                                                            :widget_type "number/="}}}} nil nil))))
    (testing "an unknown tag type names the valid types and embeds the tag shape"
      (is (thrown-with-msg? Exception #"(?s)temporal-unit.*learn\(\"native-parameters\"\)"
                            (#'v2.question/resolve-query-source
                             {:native {:database_id (mt/id)
                                       :sql "SELECT * FROM orders WHERE {{d}}"
                                       :template_tags {"d" {:type "widget"}}}} nil nil))))))

(deftest native-template-tags-more-kinds-test
  (mt/with-current-user (mt/user->id :rasta)
    (testing "a boolean raw variable is applied"
      (let [q (#'v2.question/resolve-query-source
               {:native {:database_id (mt/id)
                         :sql "SELECT 1 WHERE {{flag}}"
                         :template_tags {"flag" {:type "boolean"}}}} nil nil)]
        (is (= :boolean (:type (tag-by-name q "flag"))))))
    (testing "a temporal-unit tag takes a field_id and no widget_type"
      (let [field-id (mt/id :orders :created_at)
            q (#'v2.question/resolve-query-source
               {:native {:database_id (mt/id)
                         :sql "SELECT * FROM orders WHERE {{unit}}"
                         :template_tags {"unit" {:type "temporal-unit" :field_id field-id}}}} nil nil)]
        (is (=? {:type :temporal-unit :dimension [:field {} field-id]}
                (tag-by-name q "unit")))))))

(deftest native-template-tags-read-shape-round-trip-test
  (mt/with-current-user (mt/user->id :rasta)
    (testing "the kebab-case shape get_content emits — display-name, widget-type, a legacy dimension ref — is accepted verbatim"
      (let [field-id (mt/id :orders :total)
            q (#'v2.question/resolve-query-source
               {:native {:database_id (mt/id)
                         :sql "SELECT * FROM orders WHERE {{d}}"
                         :template_tags {"d" {:type           "dimension"
                                              :id             "0f8266e0-5df9-4b95-a6d9-fea1e4a4c3ff"
                                              :name           "d"
                                              (keyword "display-name") "Total"
                                              (keyword "widget-type")  "number/="
                                              :dimension      ["field" field-id nil]}}}} nil nil)]
        (is (=? {:type :dimension
                 :display-name "Total"
                 :widget-type :number/=
                 :dimension [:field {} field-id]}
                (tag-by-name q "d")))))
    (testing "reference tags — a snippet as get_content emits it — are accepted and ignored, so a card using one round-trips"
      (let [q (#'v2.question/resolve-query-source
               {:native {:database_id (mt/id)
                         :sql "SELECT * FROM orders WHERE {{min}} > 0 AND {{snippet: base}}"
                         :template_tags {"min" {:type "number" :display_name "Min"}
                                         (keyword "snippet: base") {:type          "snippet"
                                                                    :name          "snippet: base"
                                                                    (keyword "snippet-name") "base"
                                                                    (keyword "display-name") "Snippet: base"}}}} nil nil)]
        (is (= :number (:type (tag-by-name q "min"))))
        (is (= :snippet (:type (tag-by-name q "snippet: base"))))))
    (testing "an MBQL 5 dimension ref (options second, id third) also yields the field"
      (let [field-id (mt/id :orders :total)
            q (#'v2.question/resolve-query-source
               {:native {:database_id (mt/id)
                         :sql "SELECT * FROM orders WHERE {{d}}"
                         :template_tags {"d" {:type "dimension"
                                              (keyword "widget-type") "number/="
                                              :dimension ["field" {} field-id]}}}} nil nil)]
        (is (=? {:dimension [:field {} field-id]}
                (tag-by-name q "d")))))))

(deftest create-question-happy-path-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [args   {:method "create"
                    :name "Agent Q"
                    :query {:database (mt/id)
                            :stages [{:source-table (mt/id :orders)}]}}
            result (registry/call-tool #{"agent:content:write"} (str (random-uuid)) "question_write" args)]
        (is (not (:isError result)) (-> result :content first :text))
        (let [card-id (:id (:structuredContent result))]
          (is (int? card-id))
          (is (= "Agent Q" (t2/select-one-fn :name :model/Card :id card-id)))
          (is (= :question (t2/select-one-fn :type :model/Card :id card-id))))))))

(defn- mint-handle-via-execute!
  "Mint a query_handle for `query` the way `execute_query` does — straight into the handle store,
   reproducing the exact round-trip (pMBQL → JSON → string-valued map) the save path must survive.
   Deferred-tests ledger: `execute_query` itself lands in the query PR (GHY-4363); when it does,
   route this through `registry/call-tool` with `:validate_only true` so the whole tool path is
   exercised, not just the store."
  [session-id query]
  ;; a real minted handle always carries :database — the execute pipeline guarantees it
  (v2.queries/mint-query-handle! session-id api/*current-user-id*
                                 (v2.queries/encode-serialized-query
                                  (merge {:database (mt/id)} query))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest create-question-via-query-handle-test
  (mt/with-model-cleanup [:model/Card :model/McpQueryHandle]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [sid    (str (random-uuid))
            handle (mint-handle-via-execute!
                    sid
                    {:lib/type "mbql/query"
                     :stages   [{:lib/type     "mbql.stage/mbql"
                                 :source-table (mt/id :orders)
                                 :aggregation  [["count" {}]]
                                 :breakout     [["field" {:temporal-unit "month"}
                                                 (mt/id :orders :created_at)]]}]})
            result (registry/call-tool #{"agent:content:write"} sid "question_write"
                                       {:method "create" :name "From Handle" :query_handle handle})]
        (is (not (:isError result)) (-> result :content first :text))
        (let [card-id (:id (:structuredContent result))]
          (is (int? card-id))
          (is (=? {:lib/type :mbql/query
                   :stages   [{:lib/type    :mbql.stage/mbql
                               :aggregation [[:count {}]]}]}
                  (t2/select-one-fn :dataset_query :model/Card :id card-id))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest create-question-via-native-query-handle-test
  (mt/with-model-cleanup [:model/Card :model/McpQueryHandle]
    (mt/with-current-user (mt/user->id :crowberto)
      (testing "a native handle — the shape execute_sql mints — is saveable"
        (let [sid    (str (random-uuid))
              mp     (mt/metadata-provider)
              handle (v2.queries/mint-query-handle!
                      sid (mt/user->id :crowberto)
                      (v2.queries/encode-serialized-query
                       (lib/prepare-for-serialization (lib/native-query mp "SELECT 1"))))
              result (registry/call-tool #{"agent:content:write"} sid "question_write"
                                         {:method "create" :name "From SQL Handle" :query_handle handle})]
          (is (not (:isError result)) (-> result :content first :text))
          (is (=? {:stages [{:lib/type :mbql.stage/native :native "SELECT 1"}]}
                  (t2/select-one-fn :dataset_query :model/Card
                                    :id (:id (:structuredContent result))))))))))

(deftest create-question-name-required-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [result (registry/call-tool #{"agent:content:write"} nil "question_write"
                                     {:method "create" :query {:database (mt/id) :stages [{}]}})]
      (is (:isError result))
      (is (re-find #"`name` is required" (-> result :content first :text))))))

(deftest create-question-collection-target-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [base-args {:method "create"
                       :query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}}]
        (testing "collection_id: \"root\" saves to the root collection"
          (let [result (registry/call-tool #{"agent:content:write"} (str (random-uuid)) "question_write"
                                           (assoc base-args :name "Agent Q root" :collection_id "root"))]
            (is (not (:isError result)) (-> result :content first :text))
            (is (nil? (t2/select-one-fn :collection_id :model/Card
                                        :id (:id (:structuredContent result)))))))
        (testing "omitted collection_id saves to the caller's personal collection"
          (let [personal-id (:id (collection/user->personal-collection (mt/user->id :crowberto)))
                result (registry/call-tool #{"agent:content:write"} (str (random-uuid)) "question_write"
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
        result    (registry/call-tool #{"agent:content:write"} (str (random-uuid)) "question_write"
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
          result (registry/call-tool #{"agent:content:write"} (str (random-uuid)) "question_write" args)]
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
              result (registry/call-tool #{"agent:content:write" "agent:sql:run"} (str (random-uuid))
                                         "question_write" args)]
          (is (:isError result))
          (is (re-find #"column_metadata isn't supported for models built from a native \(SQL\) query"
                       (-> result :content first :text)))))
      (testing "a native-source model without column_metadata still creates fine"
        (let [args   {:method "create"
                      :card_type "model"
                      :name "Native Model No CM"
                      :native {:database_id (mt/id) :sql "SELECT * FROM orders"}}
              result (registry/call-tool #{"agent:content:write" "agent:sql:run"} (str (random-uuid))
                                         "question_write" args)]
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
              result (registry/call-tool #{"agent:content:write"} (str (random-uuid)) "question_write" args)]
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
            result (registry/call-tool #{"agent:content:write"} (str (random-uuid)) "question_write" args)]
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
            result (registry/call-tool #{"agent:content:write"} (str (random-uuid)) "question_write" args)]
        (is (:isError result))
        (is (re-find #"Pass either collection_id or dashboard_id, not both"
                     (-> result :content first :text)))))))

(deftest create-dashboard-question-nonexistent-numeric-id-test
  (testing "a numeric dashboard_id with no matching row is a clean not-found, not a raw FK
            violation surfacing as an internal error (GHY-4352)"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [args   {:method "create"
                    :name "Dash Q Bad Numeric Id"
                    :dashboard_id 999999999
                    :query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}}
            result (registry/call-tool #{"agent:content:write"} (str (random-uuid)) "question_write" args)]
        (is (:isError result))
        (is (re-find #"Dashboard 999999999 not found"
                     (-> result :content first :text)))))))

;;; ------------------------------------------------------ Update --------------------------------------------------

(deftest update-question-rename-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card card {:name "Before" :dataset_query (orders-query)}]
      (let [result (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                       {:method "update" :id (:id card) :description "new desc"})]
        (is (not (:isError result)) (-> result :content first :text))
        (is (= "new desc" (t2/select-one-fn :description :model/Card :id (:id card))))))))

(deftest ^:parallel semantic-type-accepts-relation-types-test
  (testing "type/PK and type/FK are relation types (not Semantic/*), accepted by the column schema and named
            in the tool's own examples, so the check must let them through"
    (is (= :type/PK (#'v2.question/check-semantic-type! "type/PK")))
    (is (= :type/FK (#'v2.question/check-semantic-type! "type/FK")))
    (is (= :type/Currency (#'v2.question/check-semantic-type! "type/Currency")))
    (is (thrown-with-msg? Exception #"Invalid semantic_type" (#'v2.question/check-semantic-type! "type/Nope")))))

(deftest update-by-entity-id-test
  (testing "an update addressed by the card's 21-character entity_id resolves to the numeric id everywhere
            downstream — the save-cycle graph and the readback select, not just the write check"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card card {:name "By eid" :dataset_query (orders-query)}]
        (let [result (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                         {:method "update"
                                          :id     (:entity_id card)
                                          :query  {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}
                                          :name   "By eid, renamed"})]
          (is (not (:isError result)) (-> result :content first :text))
          (is (= (:id card) (:id (:structuredContent result))))
          (is (= "By eid, renamed" (t2/select-one-fn :name :model/Card :id (:id card)))))))))

(deftest update-checks-permissions-before-inferring-metadata-test
  (testing "on update, result-metadata inference (whose teaching errors name the columns it found) runs only
            after the permission check on the new query — otherwise a caller could learn the columns of a
            table they cannot run, one guessed column_metadata name at a time"
    (mt/with-temp [:model/Card card {:name "Mine" :creator_id (mt/user->id :rasta) :dataset_query (orders-query)}]
      (mt/with-no-data-perms-for-all-users!
        (mt/with-current-user (mt/user->id :rasta)
          (let [result (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                           {:method          "update"
                                            :id              (:id card)
                                            ;; a different table than the stored query's, so this is a query
                                            ;; modification and the run-permission check applies to it
                                            :query           {:database (mt/id) :stages [{:source-table (mt/id :venues)}]}
                                            :column_metadata [{:name "NOT_A_COLUMN" :description "guess"}]})
                text   (-> result :content first :text)]
            (is (:isError result))
            (is (not (re-find #"not in the query results" text))
                "the column-name teaching error must not be reachable without run permission on the query")))))))

(deftest update-archive-restore-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card card {:archived false :dataset_query (orders-query)}]
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

(deftest update-question-swap-query-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card card {:dataset_query (orders-query)}]
      (let [new-query {:database (mt/id) :stages [{:source-table (mt/id :products)}]}
            result    (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                          {:method "update" :id (:id card) :query new-query})]
        (is (not (:isError result)) (-> result :content first :text))
        (is (=? {:stages [{:source-table (mt/id :products)}]}
                (t2/select-one-fn :dataset_query :model/Card :id (:id card))))))))

;; not ^:parallel: mt/with-model-cleanup on the shared query-handle table
(deftest update-question-swap-query-via-query-handle-test
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card card {:dataset_query (orders-query)}]
        (let [sid    (str (random-uuid))
              handle (mint-handle-via-execute!
                      sid
                      {:lib/type "mbql/query"
                       :stages   [{:lib/type     "mbql.stage/mbql"
                                   :source-table (mt/id :products)}]})
              result (registry/call-tool #{::scope/unrestricted} sid "question_write"
                                         {:method "update" :id (:id card) :query_handle handle})]
          (is (not (:isError result)) (-> result :content first :text))
          (is (=? {:stages [{:source-table (mt/id :products)}]}
                  (t2/select-one-fn :dataset_query :model/Card :id (:id card)))))))))

(deftest update-model-column-metadata-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [baseline (create-model-result-metadata {:name "Update Model Baseline"})
            create-result (registry/call-tool #{"agent:content:write"} (str (random-uuid)) "question_write"
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

(deftest update-model-column-metadata-preserves-prior-overrides-test
  (testing "a second partial column_metadata update keeps overrides set by an earlier one (GHY-4145)"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [create-result (registry/call-tool #{"agent:content:write"} (str (random-uuid)) "question_write"
                                                {:method "create" :card_type "model"
                                                 :name "Iteratively Annotated Model"
                                                 :query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}})
              card-id       (:id (:structuredContent create-result))
              annotate!     (fn [column_metadata]
                              (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                                  {:method "update" :id card-id :column_metadata column_metadata}))]
          ;; first annotate TOTAL, then — in a separate call that never mentions TOTAL — annotate ID
          (is (not (:isError (annotate! [{:name "TOTAL" :display_name "Total $" :semantic_type "type/Currency"}]))))
          (is (not (:isError (annotate! [{:name "ID" :display_name "Order ID"}]))))
          (let [by-name (into {} (map (juxt :name identity))
                              (t2/select-one-fn :result_metadata :model/Card :id card-id))]
            (testing "the newly annotated column carries its override"
              (is (=? {:display_name "Order ID"} (get by-name "ID"))))
            (testing "the earlier override survives the second update rather than being wiped"
              (is (=? {:display_name "Total $" :semantic_type :type/Currency}
                      (get by-name "TOTAL"))))))))))

(deftest update-model-column-metadata-explicit-null-clears-override-test
  (testing "an explicit null semantic_type clears a previously-set override, not just an omitted key (GHY-4352)"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [create-result (registry/call-tool #{"agent:content:write"} (str (random-uuid)) "question_write"
                                                {:method "create" :card_type "model"
                                                 :name "Clearable Override Model"
                                                 :query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}
                                                 :column_metadata [{:name "TOTAL" :semantic_type "type/Currency"}]})
              card-id       (:id (:structuredContent create-result))
              clear-result  (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                                {:method "update" :id card-id
                                                 :column_metadata [{:name "TOTAL" :semantic_type nil}]})]
          (is (not (:isError clear-result)) (-> clear-result :content first :text))
          (let [by-name (into {} (map (juxt :name identity))
                              (t2/select-one-fn :result_metadata :model/Card :id card-id))]
            (is (nil? (:semantic_type (get by-name "TOTAL"))))))))))

(deftest create-model-column-metadata-invalid-semantic-type-test
  (testing "an unrecognized semantic_type is a teaching error, not a sanitized internal error (GHY-4352)"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [args   {:method "create" :card_type "model"
                    :name "Bad Semantic Type Model"
                    :query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}
                    :column_metadata [{:name "TOTAL" :semantic_type "Currency"}]}
            result (registry/call-tool #{"agent:content:write"} (str (random-uuid)) "question_write" args)]
        (is (:isError result))
        (is (re-find #"Invalid semantic_type \"Currency\""
                     (-> result :content first :text)))))))

(deftest create-model-column-metadata-invalid-visibility-type-test
  (testing "an out-of-enum visibility_type is rejected at the args schema"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [args   {:method "create" :card_type "model"
                    :name "Bad Visibility Type Model"
                    :query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}
                    :column_metadata [{:name "TOTAL" :visibility_type "bogus"}]}
            result (registry/call-tool #{"agent:content:write"} (str (random-uuid)) "question_write" args)]
        (is (:isError result))
        (is (re-find #"visibility_type"
                     (-> result :content first :text)))))))

(deftest update-move-question-into-dashboard-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection dash-coll {}
                     :model/Dashboard dash {:collection_id (:id dash-coll)}
                     :model/Card card {:dataset_query (orders-query) :collection_id nil}]
        (let [result (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                         {:method "update" :id (:id card) :dashboard_id (:id dash)})]
          (is (not (:isError result)) (-> result :content first :text))
          (is (= (:id dash) (t2/select-one-fn :dashboard_id :model/Card :id (:id card))))
          (testing "the card's collection follows the dashboard's, matching create"
            (is (= (:id dash-coll) (t2/select-one-fn :collection_id :model/Card :id (:id card))))))))))

(deftest update-move-archived-question-into-dashboard-force-restores-test
  (testing "moving an already-archived card into a dashboard force-restores it, matching REST (GHY-4352)"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Collection dash-coll {}
                       :model/Dashboard dash {:collection_id (:id dash-coll)}
                       :model/Card card {:archived true :archived_directly true :dataset_query (orders-query)}]
          (let [result (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                           {:method "update" :id (:id card) :dashboard_id (:id dash)})]
            (is (not (:isError result)) (-> result :content first :text))
            (is (=? {:archived          false
                     :archived_directly false
                     :dashboard_id      (:id dash)
                     :collection_id     (:id dash-coll)}
                    (t2/select-one [:model/Card :archived :archived_directly :dashboard_id :collection_id] :id (:id card))))))))))

(deftest update-move-into-dashboard-while-archiving-refused-test
  (testing "archived:true and dashboard_id together are refused rather than persisting a card
            that's simultaneously trashed and a dashboard's internal question (GHY-4352)"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection dash-coll {}
                     :model/Dashboard dash {:collection_id (:id dash-coll)}
                     :model/Card card {:archived false :dataset_query (orders-query)}]
        (let [result (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                         {:method "update" :id (:id card) :dashboard_id (:id dash) :archived true})]
          (is (:isError result))
          (is (re-find #"Can't move a card into a dashboard while also archiving it"
                       (-> result :content first :text)))
          (testing "the card is untouched"
            (is (=? {:archived false :dashboard_id nil}
                    (t2/select-one [:model/Card :archived :dashboard_id] :id (:id card))))))))))

(deftest update-nonexistent-numeric-dashboard-id-test
  (testing "a numeric dashboard_id with no matching row is a clean not-found on update too (GHY-4352)"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card card {:dataset_query (orders-query)}]
        (let [result (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                         {:method "update" :id (:id card) :dashboard_id 999999999})]
          (is (:isError result))
          (is (re-find #"Dashboard 999999999 not found"
                       (-> result :content first :text)))
          (testing "the card is untouched"
            (is (nil? (t2/select-one-fn :dashboard_id :model/Card :id (:id card))))))))))

(deftest update-dashboard-id-collection-exclusivity-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Dashboard dash {:collection_id nil}
                   :model/Collection coll {}
                   :model/Card card {:dataset_query (orders-query)}]
      (let [result (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                       {:method "update" :id (:id card)
                                        :dashboard_id (:id dash) :collection_id (:id coll)})]
        (is (:isError result))
        (is (re-find #"Pass either collection_id or dashboard_id, not both"
                     (-> result :content first :text)))
        (testing "the card is untouched"
          (is (nil? (t2/select-one-fn :dashboard_id :model/Card :id (:id card)))))))))

(deftest update-move-into-dashboard-requires-destination-write-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-temp [:model/Collection coll-a {}
                   :model/Collection coll-b {}
                   :model/Dashboard dash-b {:collection_id (:id coll-b)}
                   :model/Card card {:dataset_query (orders-query) :collection_id (:id coll-a)}]
      ;; the default "All Users" group has write access to freshly created root collections in
      ;; tests; revoke it on the destination only, to prove the collection-move check (and thus
      ;; the write requirement on the dashboard's collection) still runs for a dashboard move.
      (perms/revoke-collection-permissions! (perms-group/all-users) coll-b)
      (mt/with-current-user (mt/user->id :rasta)
        (let [result (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                         {:method "update" :id (:id card) :dashboard_id (:id dash-b)})]
          (is (:isError result))
          (is (re-find #"You don't have permissions to do that"
                       (-> result :content first :text)))
          (testing "the card is untouched"
            (is (nil? (t2/select-one-fn :dashboard_id :model/Card :id (:id card))))))))))

;;; ---------------------------------------------- Card-type guard -------------------------------------------------

(defn- count-metric-query
  "A single-aggregation query over ORDERS — a valid `:dataset_query` for a `:metric` fixture."
  []
  (lib/aggregate (orders-query) (lib/count)))

(deftest ^:parallel update-rejects-metric-card-test
  (testing "GHY-4327: question_write refuses a card that isn't a question or model, so it can neither
            retype a metric nor store a native query on one"
    (mt/with-temp [:model/Card {card-id :id} {:type          :metric
                                              :name          "question-test not a question"
                                              :dataset_query (count-metric-query)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (testing "a field update is refused, naming the card's type and the tool that owns it"
          (let [result (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                           {:method "update" :id card-id :name "nope"})
                msg    (-> result :content first :text)]
            (is (:isError result))
            (is (str/includes? msg "metric_write"))
            (is (str/includes? msg "metric"))))
        (testing "a card_type that would retype the metric is refused, not honored"
          (is (:isError (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                            {:method "update" :id card-id :card_type "question"}))))
        (testing "storing a native query on the metric is refused rather than corrupting it"
          (is (:isError (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                            {:method "update" :id card-id
                                             :native {:database_id (mt/id) :sql "SELECT 1"}}))))
        (testing "the card is untouched"
          (is (=? {:type :metric :name "question-test not a question"}
                  (t2/select-one [:model/Card :type :name] :id card-id))))))))

;; not ^:parallel: with-redefs
(deftest update-save-check-uses-the-stored-card-type-test
  (testing "GHY-4327: the save check sees the stored card's type, not the caller's omitted card_type"
    (mt/with-temp [:model/Card {card-id :id} {:type :model :dataset_query (orders-query)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [seen     (atom ::unset)
              original queries/check-card-can-be-saved!]
          (with-redefs [queries/check-card-can-be-saved! (fn [query card-type]
                                                           (reset! seen card-type)
                                                           (original query card-type))]
            (let [result (registry/call-tool #{::scope/unrestricted} (str (random-uuid)) "question_write"
                                             {:method "update" :id card-id :name "renamed"})]
              (is (not (:isError result)) (-> result :content first :text))))
          (is (= :model @seen)))))))

(deftest native-source-requires-the-sql-scope-test
  (testing "an inline `native` source stores raw SQL that run_saved_question then executes, so it is
            execute_sql's capability and needs execute_sql's own scope — the content write scope
            alone would reproduce raw SQL for a token the operator never granted it to"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [write-only  #{"agent:content:write"}
              with-sql    #{"agent:content:write" "agent:sql:run"}
              create-args {:method "create" :name "Native Q"
                           :native {:database_id (mt/id) :sql "SELECT 1"}}]
          (testing "create with only the write scope is refused, naming the missing scope"
            (let [result (registry/call-tool write-only (str (random-uuid)) "question_write" create-args)]
              (is (:isError result))
              (is (re-find #"agent:sql:run" (-> result :content first :text)))
              (is (zero? (t2/count :model/Card :name "Native Q")))))
          (testing "the identical call goes through once the token carries the SQL scope"
            (let [result (registry/call-tool with-sql (str (random-uuid)) "question_write" create-args)]
              (is (not (:isError result)) (-> result :content first :text))
              (is (=? {:stages [{:lib/type :mbql.stage/native :native "SELECT 1"}]}
                      (t2/select-one-fn :dataset_query :model/Card
                                        :id (:id (:structuredContent result)))))))
          (testing "update is gated too — swapping a stored MBQL query for SQL stores the same capability"
            (mt/with-temp [:model/Card card {:dataset_query (orders-query)}]
              (let [update-args {:method "update" :id (:id card)
                                 :native {:database_id (mt/id) :sql "SELECT 2"}}
                    refused     (registry/call-tool write-only (str (random-uuid)) "question_write" update-args)]
                (is (:isError refused))
                (is (re-find #"agent:sql:run" (-> refused :content first :text)))
                (is (=? {:stages [{:lib/type :mbql.stage/mbql}]}
                        (t2/select-one-fn :dataset_query :model/Card :id (:id card))))
                (testing "and goes through with the SQL scope"
                  (let [ok (registry/call-tool with-sql (str (random-uuid)) "question_write" update-args)]
                    (is (not (:isError ok)) (-> ok :content first :text))
                    (is (=? {:stages [{:lib/type :mbql.stage/native :native "SELECT 2"}]}
                            (t2/select-one-fn :dataset_query :model/Card :id (:id card))))))))))))))

(deftest inline-query-with-a-native-stage-is-gated-like-the-native-source-test
  (testing "an inline `query` carrying a native stage resolves to raw SQL just like the `native`
            source, so it must pass the same execute_sql gates — otherwise the `query` source is a
            back door around the scope + kill switch (GHY-4352 review)"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [write-only  #{"agent:content:write"}
              with-sql    #{"agent:content:write" "agent:sql:run"}
              ;; a native stage smuggled through the inline `query` arg rather than the `native` arg
              native-inline {:method "create" :name "Backdoor Q"
                             :query {:database (mt/id)
                                     :stages [{:native "SELECT 1"}]}}]
          (testing "the write scope alone is refused, naming the missing SQL scope"
            (let [result (registry/call-tool write-only (str (random-uuid)) "question_write" native-inline)]
              (is (:isError result))
              (is (re-find #"agent:sql:run" (-> result :content first :text)))
              (is (zero? (t2/count :model/Card :name "Backdoor Q")))))
          (testing "the identical call goes through with the SQL scope, storing the native query"
            (let [result (registry/call-tool with-sql (str (random-uuid)) "question_write" native-inline)]
              (is (not (:isError result)) (-> result :content first :text))
              (is (=? {:stages [{:lib/type :mbql.stage/native :native "SELECT 1"}]}
                      (t2/select-one-fn :dataset_query :model/Card :id (:id (:structuredContent result)))))))
          (testing "a plain inline MBQL query is unaffected — still creatable with the write scope only"
            (let [result (registry/call-tool write-only (str (random-uuid)) "question_write"
                                             {:method "create" :name "Plain MBQL Q"
                                              :query {:database (mt/id)
                                                      :stages [{:source-table (mt/id :orders)}]}})]
              (is (not (:isError result)) (-> result :content first :text)))))))))

;; not ^:parallel: mt/with-temporary-setting-values on the shared kill-switch setting
(deftest native-source-honors-the-execute-sql-kill-switch-test
  (testing "the mcp-execute-sql-enabled kill switch must cover every path that stores raw SQL, or
            question_write plus run_saved_question rebuilds execute_sql on an instance where an
            admin turned it off"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temporary-setting-values [mcp-execute-sql-enabled false]
          (let [result (registry/call-tool #{"agent:content:write" "agent:sql:run"} (str (random-uuid))
                                           "question_write"
                                           {:method "create" :name "Killed Native Q"
                                            :native {:database_id (mt/id) :sql "SELECT 1"}})]
            (is (:isError result))
            (is (str/includes? (-> result :content first :text) "mcp-execute-sql-enabled"))
            (is (zero? (t2/count :model/Card :name "Killed Native Q")))))))))

(deftest write-response-respects-read-scope-test
  (testing "GHY-4217: without agent:resource:read the response is a minimal ack — the write scope
            must not double as a read scope"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [args  {:method "create" :name "Ack Q"
                     :query {:database (mt/id) :stages [{:source-table (mt/id :orders)}]}}
              acked (:structuredContent (registry/call-tool #{"agent:content:write"}
                                                            (str (random-uuid)) "question_write" args))]
          (is (pos-int? (:id acked)))
          (is (re-find #"agent:content:read" (:note acked)))
          (is (not (contains? acked :name)))
          (testing "with the read scope the full response comes back"
            (let [full (:structuredContent (registry/call-tool #{"agent:content:write" "agent:content:read"}
                                                               (str (random-uuid)) "question_write"
                                                               (assoc args :name "Full Q")))]
              (is (= "Full Q" (:name full))))))))))

(deftest question-write-scopes-registered-test
  (testing "the unified write scope flows into the OAuth surface"
    (let [scopes (set (registry/registered-scopes))]
      (is (contains? scopes "agent:content:write")))))

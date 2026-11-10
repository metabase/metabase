(ns metabase-enterprise.metabot.tools.entity-details-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase-enterprise.sandbox.test-util :as sandbox.tu]
   [metabase-enterprise.test :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.field-stats :as field-stats]
   [metabase.permissions.core :as perms]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- sandboxed-query []
  (let [mp       (mt/metadata-provider)
        table    (lib.metadata/table mp (mt/id :categories))
        id-field (lib.metadata/field mp (mt/id :categories :id))]
    (lib/filter (lib/query mp table) (lib/< id-field 3))))

(deftest sandboxed-field-values-test
  (met/with-gtaps! {:gtaps {:categories {:query (sandboxed-query)}}}
    (let [field-ids [(mt/id :categories :id) (mt/id :categories :name)]]
      (try
        (let [result (entity-details/get-table-details {:entity-type :table :entity-id (mt/id :categories)})
              field  (fn [field-name]
                       (some #(when (= field-name (:name %)) %) (get-in result [:structured-output :fields])))]
          (testing "returns sandboxed field values"
            (is (= ["African" "American"] (:field_values (field "NAME")))))
          (testing "doesn't fetch values for the primary key"
            (is (some? (field "ID")))
            (is (nil? (:field_values (field "ID"))))
            (is (not (t2/exists? :model/FieldValues :field_id (mt/id :categories :id) :type :advanced)))))
        (finally
          (t2/delete! :model/FieldValues :field_id [:in field-ids] :type :advanced))))))

(deftest sandboxed-model-fields-test
  (testing "get-table-details for a model over a column-sandboxed table only returns allowed fields"
    (met/with-gtaps! {:gtaps {:venues {:query (sandbox.tu/restricted-column-query (mt/id))}}}
      (mt/with-temp [:model/Card {model-id :id} {:name          "Venues model"
                                                 :type          :model
                                                 :database_id   (mt/id)
                                                 :table_id      (mt/id :venues)
                                                 :dataset_query {:database (mt/id)
                                                                 :type     :query
                                                                 :query    {:source-table (mt/id :venues)}}}]
        (let [result      (entity-details/get-table-details {:entity-type :model :entity-id model-id})
              field-names (into #{} (map :name) (get-in result [:structured-output :fields]))]
          (is (= #{"ID" "NAME" "CATEGORY_ID"} field-names)))))))

(deftest sandboxed-model-fields-use-canonical-owner-test
  (testing "editable model metadata cannot move a sandbox-hidden Field onto an unrestricted table"
    (met/with-gtaps! {:gtaps {:venues {:query (sandbox.tu/restricted-column-query (mt/id))}}}
      (let [hidden-field-id (mt/id :venues :price)
            open-table-id   (mt/id :categories)]
        (mt/with-temp [:model/Card {model-id :id}
                       {:name            "Model with stale metadata"
                        :type            :model
                        :database_id     (mt/id)
                        :table_id        open-table-id
                        :dataset_query   {:database (mt/id)
                                          :type     :query
                                          :query    {:source-table open-table-id}}
                        :result_metadata [{:id             hidden-field-id
                                           :name           "SPOOF"
                                           :display_name   "Spoof"
                                           :base_type      :type/Integer
                                           :effective_type :type/Integer
                                           :table_id       open-table-id
                                           :field_ref      [:field hidden-field-id nil]}]}]
          (let [fields (-> (entity-details/get-table-details {:entity-type        :model
                                                              :entity-id          model-id
                                                              :with-field-values? false})
                           :structured-output
                           :fields)]
            (is (not (contains? (into #{} (map :field_id) fields) hidden-field-id)))
            (is (not (contains? (into #{} (map :name) fields) "SPOOF")))))))))

(deftest sandboxed-metric-dimensions-test
  (testing "metric details respect column-restricting sandboxes"
    (met/with-gtaps! {:gtaps {:venues {:query (sandbox.tu/restricted-column-query (mt/id))}}}
      (mt/with-temp [:model/Card {metric-id :id} {:name          "Sandboxed metric"
                                                  :type          :metric
                                                  :database_id   (mt/id)
                                                  :table_id      (mt/id :venues)
                                                  :dataset_query {:database (mt/id)
                                                                  :type     :query
                                                                  :query    {:source-table (mt/id :venues)
                                                                             :aggregation  [[:count]]}}}]
        (let [venue-name        (:name (lib.metadata/table (mt/metadata-provider) (mt/id :venues)))
              metric-dimensions (fn []
                                  (-> (entity-details/get-metric-details {:metric-id          metric-id
                                                                          :with-field-values? false})
                                      :structured-output
                                      :queryable-dimensions))
              source-names      (fn [dimensions]
                                  (into #{}
                                        (comp (filter #(= venue-name (get-in % [:portable_fk 2])))
                                              (map :name))
                                        dimensions))]
          (testing "only source-card columns are returned"
            (is (= #{"CATEGORY_ID" "ID" "NAME"}
                   (source-names (metric-dimensions)))))
          (testing "missing sandbox metadata fails closed"
            (let [sandbox (t2/select-one :model/Sandbox :table_id (mt/id :venues))]
              (mt/with-test-user :crowberto
                (t2/update! :model/Card :id (:card_id sandbox) {:result_metadata nil}))
              (is (empty? (metric-dimensions))))))))))

(deftest sandboxed-metric-dimension-through-one-visible-fk-test
  (testing "a card metric whose sandbox hides one of two FK columns to a table gives a Reference that builds"
    ;; PRICE becomes a second FK from VENUES to CATEGORIES. The sandbox returns CATEGORY_ID but not PRICE, so the
    ;; user sees CATEGORIES through one FK column, while the card still returns both.
    (mt/with-temp-vals-in-db :model/Field (mt/id :venues :price) {:semantic_type      :type/FK
                                                                  :fk_target_field_id (mt/id :categories :id)}
      (met/with-gtaps! {:gtaps {:venues {:query (sandbox.tu/restricted-column-query (mt/id))}}}
        (perms/set-table-permission! &group (mt/id :categories) :perms/create-queries :query-builder)
        (mt/with-temp [:model/Card {card-id :id, card-eid :entity_id}
                       {:name          "Venues"
                        :type          :question
                        :dataset_query (lib/query (mt/metadata-provider)
                                                  (lib.metadata/table (mt/metadata-provider) (mt/id :venues)))}
                       :model/Card {metric-id :id, metric-eid :entity_id}
                       {:name          "Venue count"
                        :type          :metric
                        :dataset_query (-> (lib/query (mt/metadata-provider)
                                                      (lib.metadata/card (mt/metadata-provider) card-id))
                                           (lib/aggregate (lib/count)))}]
          (let [db-name (t2/select-one-fn :name :model/Database :id (mt/id))
                dims    (->> (entity-details/get-metric-details {:metric-id          metric-id
                                                                 :with-field-values? false})
                             :structured-output
                             :queryable-dimensions
                             (filter #(= [db-name "PUBLIC" "CATEGORIES" "NAME"] (:portable_fk %))))
                build   (fn [dim]
                          (try
                            (-> (construct/execute-representations-query
                                 (walk/keywordize-keys
                                  {"lib/type" "mbql/query"
                                   "stages"   [{"lib/type"    "mbql.stage/mbql"
                                                "source-card" card-eid
                                                "breakout"    [(or (:reference dim)
                                                                   ["field" {} (:portable_fk dim)])]
                                                "aggregation" [["metric" {} metric-eid]]}]}))
                                (get-in [:structured-output :query]))
                            (catch clojure.lang.ExceptionInfo e
                              (ex-message e))))
                drill   (:structured-output (field-stats/field-values {:entity-type "metric"
                                                                       :entity-id   metric-id
                                                                       :field-id    (mt/id :categories :name)
                                                                       :limit       5}))]
            (testing "the dimensions list shows only the visible route"
              (is (= 1 (count dims))))
            (doseq [[label dim] {"dimensions list" (first dims), "drill-in" drill}]
              (testing label
                (testing "names the visible FK column in its Reference"
                  (is (= [db-name "PUBLIC" "VENUES" "CATEGORY_ID"]
                         (get-in dim [:reference 1 "source-field"]))))
                (testing "gives a Reference that builds, joins through the visible FK column and runs"
                  (let [result (build dim)]
                    (is (map? result) (str "query failed: " result))
                    (when (map? result)
                      (is (str/includes? (:query (qp.compile/compile result)) "\"__mb_source\".\"CATEGORY_ID\""))
                      (is (seq (mt/rows (qp/process-query result)))))))))))))))

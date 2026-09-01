(ns metabase-enterprise.metabot.tools.entity-details-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.test-util :as sandbox.tu]
   [metabase-enterprise.test :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- sandboxed-query []
  (let [mp       (mt/metadata-provider)
        table    (lib.metadata/table mp (mt/id :categories))
        id-field (lib.metadata/field mp (mt/id :categories :id))]
    (lib/filter (lib/query mp table) (lib/< id-field 3))))

(deftest sandboxed-field-values-test
  (met/with-gtaps! {:gtaps {:categories {:query (sandboxed-query)}}}
    (let [field-id (mt/id :categories :name)]
      (try
        (let [result     (entity-details/get-table-details {:entity-type :table :entity-id (mt/id :categories)})
              name-field (some #(when (= "NAME" (:name %)) %) (get-in result [:structured-output :fields]))]
          (testing "returns sandboxed field values"
            (is (= ["African" "American"] (:field_values name-field)))))
        (finally
          (t2/delete! :model/FieldValues :field_id field-id :type :advanced))))))

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
              (t2/update! :model/Card :id (:card_id sandbox) {:result_metadata nil})
              (is (empty? (metric-dimensions))))))))))

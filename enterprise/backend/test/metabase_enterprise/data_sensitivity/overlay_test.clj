(ns metabase-enterprise.data-sensitivity.overlay-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [toucan2.core :as t2]))

(def ^:private attributes
  "Per attribute: a deterministic, an AI, a human and a proposed value, as the Field reads them."
  {:semantic_type    {:deterministic :type/Category :ai :type/Name :human :type/Email :proposed :type/City}
   :description      {:deterministic "sync" :ai "ai" :human "human" :proposed "proposed"}
   :data_sensitivity {:deterministic :PUBLIC :ai :PII :human :PHI :proposed :FINANCIAL}})

(defn- stored [v]
  (cond-> v (keyword? v) u/qualified-name))

(defn- preview [field-id]
  (t2/select-one :model/Field :id field-id {:from [(warehouse-schema-overlay/field-query {:ai-proposals? true})]}))

(defn- propose! [table-id field-id attribute value & {:as more}]
  (t2/insert-returning-pk! :model/MetadataGenerationProposal
                           (merge {:table_id       table-id
                                   :field_id       field-id
                                   :attribute      attribute
                                   :proposed_value (stored value)
                                   :confidence     :high
                                   :reasoning      "because"}
                                  more)))

(deftest preview-merges-pending-proposals-per-attribute-test
  (doseq [[attribute {:keys [deterministic ai human proposed]}] attributes]
    (testing attribute
      (mt/with-temp [:model/Table {table-id :id}      {}
                     :model/Field {plain :id}         {:table_id table-id attribute deterministic}
                     :model/Field {ai-id :id}         {:table_id table-id attribute deterministic}
                     :model/Field {human-id :id :as human-field} {:table_id table-id attribute deterministic}
                     :model/Field {rejected :id}      {:table_id table-id attribute deterministic}
                     :model/Field {none :id}          {:table_id table-id attribute deterministic}]
        (field-user-settings/set-ai-values-for-fields! {ai-id {attribute ai}})
        (field-user-settings/upsert-user-settings human-field {attribute human})
        (doseq [field-id [plain ai-id human-id]]
          (propose! table-id field-id attribute proposed))
        (propose! table-id rejected attribute proposed :status :rejected)
        (testing "the default read never returns a pending value and keeps human > AI > deterministic"
          (is (= {plain deterministic ai-id ai human-id human rejected deterministic none deterministic}
                 (into {} (map (juxt identity #(get (warehouse-schema.db/field %) attribute)))
                       [plain ai-id human-id rejected none])))
          (is (not-any? #(contains? (warehouse-schema.db/field %) :ai_proposals) [plain human-id])))
        (testing "the preview reads the pending proposal as if accepted, also over AI and human values"
          (doseq [field-id [plain ai-id human-id]]
            (is (=? {attribute     proposed
                     :ai_proposals {attribute {:value (stored proposed) :reasoning "because" :confidence :high
                                               :conflict (= field-id human-id)}}}
                    (preview field-id)))))
        (testing "the preview ignores a rejected proposal and keeps the merged value of a Field with no proposal"
          (is (=? {attribute deterministic :ai_proposals {}} (preview rejected)))
          (is (=? {attribute deterministic :ai_proposals {}} (preview none))))))))

(deftest preview-leaves-other-attributes-test
  (testing "a proposal for one attribute leaves the other attributes at their merged values"
    (mt/with-temp [:model/Table {table-id :id} {}
                   :model/Field {field-id :id :as field} {:table_id table-id :description "sync" :semantic_type :type/Category}]
      (field-user-settings/upsert-user-settings field {:description "human"})
      (propose! table-id field-id :semantic_type :type/City)
      (is (=? {:description   "human"
               :semantic_type :type/City
               :ai_proposals  {:semantic_type {:value "type/City" :conflict false}}}
              (preview field-id)))
      (is (= #{:semantic_type} (set (keys (:ai_proposals (preview field-id)))))))))

(deftest default-read-has-one-join-test
  (testing "the default field-query joins only the user settings"
    (let [sql (first (mdb/compile (first (warehouse-schema-overlay/field-query))))]
      (is (not (str/includes? (u/lower-case-en sql) "metadata_generation_proposal")))
      (is (= 1 (count (re-seq #"(?i)\bjoin\b" sql))))))
  (testing "the preview adds one join per attribute"
    (let [sql (first (mdb/compile (first (warehouse-schema-overlay/field-query {:ai-proposals? true}))))]
      (is (= 4 (count (re-seq #"(?i)\bjoin\b" sql)))))))

(deftest preview-api-test
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {table-id :id} {:db_id db-id}
                 :model/Field    {field-id :id} {:table_id table-id :semantic_type :type/Category}]
    (propose! table-id field-id :semantic_type :type/City)
    (testing "GET /api/field/:id"
      (is (=? {:semantic_type "type/Category"}
              (mt/user-http-request :crowberto :get 200 (str "field/" field-id) :include_editable_data_model true)))
      (is (not (contains? (mt/user-http-request :crowberto :get 200 (str "field/" field-id)
                                                :include_editable_data_model true)
                          :ai_proposals)))
      (is (=? {:semantic_type "type/City"
               :ai_proposals  {:semantic_type {:value "type/City" :confidence "high" :conflict false}}}
              (mt/user-http-request :crowberto :get 200 (str "field/" field-id)
                                    :include_editable_data_model true :preview_ai_proposals true)))
      (testing "the preview needs include_editable_data_model"
        (mt/user-http-request :crowberto :get 400 (str "field/" field-id) :preview_ai_proposals true)))
    (testing "GET /api/table/:id/query_metadata"
      (let [fields-of (fn [& params]
                        (:fields (apply mt/user-http-request :crowberto :get 200
                                        (format "table/%d/query_metadata" table-id) params)))]
        (is (=? [{:id field-id :semantic_type "type/Category"}]
                (fields-of :include_editable_data_model true)))
        (is (=? [{:id field-id :semantic_type "type/City" :ai_proposals {:semantic_type {:value "type/City"}}}]
                (fields-of :include_editable_data_model true :preview_ai_proposals true)))
        (mt/user-http-request :crowberto :get 400 (format "table/%d/query_metadata" table-id)
                              :preview_ai_proposals true)))))

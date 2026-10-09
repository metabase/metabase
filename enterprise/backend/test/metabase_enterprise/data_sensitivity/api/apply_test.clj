(ns metabase-enterprise.data-sensitivity.api.apply-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-sensitivity.context :as context]
   [metabase-enterprise.data-sensitivity.review :as review]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- url [run-id & parts]
  (apply str "ee/data-sensitivity/runs/" run-id parts))

(defn- suggestion! [run-id table-id field-id & {:as overrides}]
  (t2/insert-returning-pk! :model/MetadataGenerationSuggestion
                           (merge {:run_id         run-id
                                   :table_id       table-id
                                   :field_id       field-id
                                   :attribute      :semantic_type
                                   :source         :deterministic
                                   :current_value  "type/Category"
                                   :proposed_value "type/Email"
                                   :status         :accepted}
                                  overrides)))

(defn- statuses [ids]
  (into {} (map (juxt :id :status)) (t2/select :model/MetadataGenerationSuggestion :id [:in ids])))

(defn- effective [field-id]
  (t2/select-one :model/Field :id field-id {:from [(warehouse-schema-overlay/field-query)]}))

(defn- settings [field-id]
  (t2/select-one :model/FieldUserSettings :field_id field-id))

(defn- apply! [run-id & [body]]
  (mt/user-http-request :crowberto :post 200 (url run-id "/apply") (or body {})))

(defn- do-with-run
  "Tables `A` and `B` of one database with a run over them. `f` gets the run id and a map of table and field ids: text
  fields `a-text` (deterministic `type/Category`), `a-plain` (no semantic type) and `b-text` (deterministic
  `type/Category`), integer field `a-int` (no semantic type) and `a-fk` (`type/FK`)."
  [f]
  (mt/with-temp [:model/Database {db-id :id}  {}
                 :model/Table    {a :id}      {:db_id db-id :schema "S" :name "A"}
                 :model/Table    {b :id}      {:db_id db-id :schema "S" :name "B"}
                 :model/Field    {a-text :id} {:table_id a :name "a_text" :base_type :type/Text
                                               :semantic_type :type/Category}
                 :model/Field    {a-plain :id} {:table_id a :name "a_plain" :base_type :type/Text}
                 :model/Field    {a-int :id}  {:table_id a :name "a_int" :base_type :type/Integer}
                 :model/Field    {a-fk :id}   {:table_id a :name "a_fk" :base_type :type/Integer
                                               :semantic_type :type/FK}
                 :model/Field    {b-text :id} {:table_id b :name "b_text" :base_type :type/Text
                                               :semantic_type :type/Category}
                 :model/MetadataGenerationRun {run-id :id} {:database_id db-id
                                                            :scope       {:type :database}
                                                            :attributes  [:data_sensitivity :semantic_type :description]
                                                            :status      :succeeded}]
    (f run-id {:a a :b b :a-text a-text :a-plain a-plain :a-int a-int :a-fk a-fk :b-text b-text})))

(deftest superuser-required-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id _]
       (mt/user-http-request :rasta :post 403 (url run-id "/apply") {})
       (mt/user-http-request :crowberto :post 404 (url Integer/MAX_VALUE "/apply") {})))))

(deftest apply-writes-accepted-ai-values-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a b a-text a-plain b-text]}]
       (let [sem     (suggestion! run-id a a-text)
             ds      (suggestion! run-id a a-plain :attribute :data_sensitivity :source :none :current_value nil
                                  :proposed_value "PII")
             desc    (suggestion! run-id a a-plain :attribute :description :source :none :current_value nil
                                  :proposed_value "The customer's email address.")
             pending (suggestion! run-id a a-plain :status :pending :source :none :current_value nil)
             other   (suggestion! run-id b b-text)]
         (is (= {:written 3 :stale 0 :failed 0 :failures []}
                (apply! run-id {:table_ids [a]})))
         (testing "only accepted suggestions of the selected tables are applied"
           (is (= {sem :applied ds :applied desc :applied pending :pending other :accepted}
                  (statuses [sem ds desc pending other]))))
         (testing "the values land in the AI columns and readers see them"
           (is (=? {:ai_semantic_type :type/Email :semantic_type nil :semantic_type_set false}
                   (settings a-text)))
           (is (=? {:ai_data_sensitivity :PII :ai_description "The customer's email address."
                    :data_sensitivity nil :description nil}
                   (settings a-plain)))
           (is (=? {:semantic_type :type/Email} (effective a-text)))
           (is (=? {:data_sensitivity :PII :description "The customer's email address."} (effective a-plain))))
         (testing "the deterministic layer does not change"
           (is (= :type/Category (t2/select-one-fn :semantic_type :model/Field :id a-text))))
         (testing "apply with no table_ids applies the remaining tables"
           (is (=? {:written 1} (apply! run-id)))
           (is (= :applied (get (statuses [other]) other))))
         (testing "a second apply has nothing to write"
           (is (= {:written 0 :stale 0 :failed 0 :failures []} (apply! run-id)))))))))

(deftest apply-skips-stale-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-text a-plain]}]
       (let [edited  (suggestion! run-id a a-text)
             ai-only (suggestion! run-id a a-plain :attribute :data_sensitivity :source :none :current_value nil
                                  :proposed_value "PII")]
         (field-user-settings/upsert-user-settings (t2/select-one :model/Field a-text) {:semantic_type :type/Name})
         (t2/insert! :model/FieldUserSettings {:field_id a-plain :ai_data_sensitivity :PHI})
         (is (= {:written 0 :stale 2 :failed 0 :failures []} (apply! run-id)))
         (testing "a field edited after the run, or given another AI value, is skipped and marked stale"
           (is (= {edited :stale ai-only :stale} (statuses [edited ai-only])))
           (is (=? {:semantic_type :type/Name} (effective a-text)))
           (is (=? {:data_sensitivity :PHI} (effective a-plain)))))))))

(deftest apply-over-human-value-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-text a-plain]}]
       (field-user-settings/upsert-user-settings (t2/select-one :model/Field a-text) {:semantic_type :type/Name})
       (field-user-settings/upsert-user-settings (t2/select-one :model/Field a-plain) {:description nil})
       (let [sem  (suggestion! run-id a a-text :source :human :current_value "type/Name")
             desc (suggestion! run-id a a-plain :attribute :description :source :human :current_value nil
                               :proposed_value "A plain text field.")]
         (is (=? {:written 2} (apply! run-id)))
         (is (= {sem :applied desc :applied} (statuses [sem desc])))
         (testing "the person's value is cleared and readers see the AI value"
           (is (=? {:semantic_type nil :semantic_type_set false :ai_semantic_type :type/Email} (settings a-text)))
           (is (=? {:description nil :description_set false :ai_description "A plain text field."}
                   (settings a-plain)))
           (is (=? {:semantic_type :type/Email} (effective a-text)))
           (is (=? {:description "A plain text field."} (effective a-plain)))))))))

(deftest apply-category-leaves-has-field-values-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-plain]}]
       (suggestion! run-id a a-plain :source :none :current_value nil :proposed_value "type/Category")
       (is (=? {:written 1} (apply! run-id)))
       (is (=? {:semantic_type :type/Category :has_field_values nil} (effective a-plain)))
       (is (nil? (t2/select-one-fn :has_field_values :model/Field :id a-plain)))))))

(deftest apply-failures-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-plain a-int a-fk]}]
       (let [key-field (suggestion! run-id a a-fk :current_value "type/FK" :proposed_value "type/Category")
             misfit    (suggestion! run-id a a-int :source :none :current_value nil :proposed_value "type/Email")
             missing   (suggestion! run-id a a-plain :attribute :description :source :none :current_value nil
                                    :proposed_value "Gone.")]
         (t2/update! :model/Field a-plain {:active false})
         (is (= {:written 0 :stale 0 :failed 3
                 :failures [{:suggestion_id key-field :field_id a-fk :attribute "semantic_type" :reason "key_field"}
                            {:suggestion_id misfit :field_id a-int :attribute "semantic_type" :reason "type_mismatch"}
                            {:suggestion_id missing :field_id a-plain :attribute "description"
                             :reason "field_not_found"}]}
                (apply! run-id)))
         (testing "failed suggestions stay accepted and write nothing"
           (is (= #{:accepted} (set (vals (statuses [key-field misfit missing])))))
           (is (nil? (settings a-fk)))))))))

(deftest apply-side-effects-test
  (mt/with-premium-features #{:data-sensitivity}
    (do-with-run
     (fn [run-id {:keys [a a-text a-int]}]
       (mt/with-temp [:model/Dimension {dim :id} {:field_id a-int :type :internal :name "Remapped"}]
         (suggestion! run-id a a-int :source :none :current_value nil :proposed_value "type/Quantity")
         (suggestion! run-id a a-int :attribute :data_sensitivity :source :none :current_value nil
                      :proposed_value "BIZ_CONF")
         (suggestion! run-id a a-text)
         (let [published (atom [])]
           (with-redefs [events/publish-event! (fn [topic event] (swap! published conj [topic event]))]
             (mt/with-current-user (mt/user->id :crowberto)
               (is (=? {:written 3} (review/apply! run-id {} (mt/user->id :crowberto))))))
           (testing "one :event/field-update per written field, with the value readers see"
             (is (= #{[:event/field-update a-int] [:event/field-update a-text]}
                    (set (map (fn [[topic {:keys [object]}]] [topic (:id object)]) @published))))
             (is (= 2 (count @published)))
             (is (=? {:semantic_type :type/Quantity}
                     (some (fn [[_ {:keys [object]}]] (when (= a-int (:id object)) object)) @published)))))
         (testing "an internal remapping the new semantic type does not allow is removed"
           (is (not (t2/exists? :model/Dimension :id dim)))))))))

(deftest value-source-test
  (testing "the layer readers see, in the order of field-query"
    (is (= :none (context/value-source nil :semantic_type nil)))
    (is (= :deterministic (context/value-source nil :semantic_type :type/Category)))
    (is (= :ai (context/value-source {:ai_semantic_type :type/Email} :semantic_type :type/Email)))
    (is (= :human (context/value-source {:semantic_type_set true :ai_semantic_type :type/Email} :semantic_type nil)))
    (is (= :human (context/value-source {:display_name "X"} :display_name "X")))))

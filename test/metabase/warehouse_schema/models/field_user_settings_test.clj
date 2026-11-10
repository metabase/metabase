(ns metabase.warehouse-schema.models.field-user-settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [metabase.warehouse-schema.user-settings :as user-settings]
   [toucan2.core :as t2]))

(defn- read-column
  "The value of `column` that `metabase_field` holds for the Field `field-id`."
  [field-id column]
  (get (t2/select-one :model/Field :id field-id) column))

(def ^:private layer-values
  "Per attribute: the raw value, the AI value, the human value."
  {:semantic_type    [:type/Category :type/Name :type/Email]
   :description      ["raw description" "ai description" "human description"]
   :data_sensitivity [:PUBLIC :PII :PHI]})

(deftest layer-precedence-test
  (doseq [[column [raw-value ai-value human-value]] layer-values]
    (testing column
      (mt/with-temp [:model/Field {field-id :id :as field} {column raw-value}]
        (testing "raw only reads the raw value"
          (is (= raw-value (read-column field-id column))))
        (testing "an AI value wins over the raw value"
          (field-user-settings/set-ai-values! field {column ai-value})
          (is (= ai-value (read-column field-id column))))
        (testing "sync does not overwrite an AI value"
          (sync-util/update-field-unless-user-set! field-id {column raw-value})
          (is (= ai-value (read-column field-id column))))
        (testing "a human value wins over the AI value"
          (field-user-settings/upsert-field-user-settings! field {column human-value})
          (is (= human-value (read-column field-id column))))
        (testing "a human NULL wins over the AI value"
          (field-user-settings/upsert-field-user-settings! field {column nil})
          (is (nil? (read-column field-id column))))
        (testing "unset-field-user-settings! gives the AI value back"
          (field-user-settings/unset-field-user-settings! field [column])
          (is (= ai-value (read-column field-id column))))
        (testing "clearing the AI value drops the emptied row and leaves the Field's value for sync"
          (field-user-settings/unset-ai-values! field [column])
          (is (= ai-value (read-column field-id column)))
          (is (not (t2/exists? :model/FieldUserSettings :field_id field-id))))
        (testing "sync writes the column again once no human or AI value protects it"
          (sync-util/update-field-unless-user-set! field-id {column raw-value})
          (is (= raw-value (read-column field-id column))))
        (testing "a NULL AI value leaves the Field's value as it is"
          (field-user-settings/set-ai-values! field {column nil})
          (is (= raw-value (read-column field-id column))))))))

(deftest ai-value-under-a-human-value-test
  (mt/with-temp [:model/Field {field-id :id :as field} {:semantic_type :type/Category}]
    (field-user-settings/upsert-field-user-settings! field {:semantic_type :type/Email})
    (testing "an AI value for a human-set column is kept in the settings but not written to the Field"
      (field-user-settings/set-ai-values! field {:semantic_type :type/Name})
      (is (= :type/Email (read-column field-id :semantic_type)))
      (is (=? {:ai_semantic_type :type/Name} (t2/select-one :model/FieldUserSettings :field_id field-id))))
    (testing "unset-field-user-settings! writes the AI value to the Field"
      (field-user-settings/unset-field-user-settings! field [:semantic_type])
      (is (= :type/Name (read-column field-id :semantic_type))))))

(deftest data-sensitivity-is-flagged-test
  (mt/with-temp [:model/Field {field-id :id :as field} {:data_sensitivity :PII}]
    (testing "setting data_sensitivity sets its flag"
      (field-user-settings/upsert-field-user-settings! field {:data_sensitivity :PUBLIC})
      (is (=? {:data_sensitivity :PUBLIC :data_sensitivity_set true}
              (t2/select-one :model/FieldUserSettings :field_id field-id))))
    (testing "unset-field-user-settings! clears the flag"
      (field-user-settings/unset-field-user-settings! field [:data_sensitivity])
      (is (not (t2/exists? :model/FieldUserSettings :field_id field-id))))))

(deftest set-ai-values-for-fields-test
  (mt/with-temp [:model/Field {human-id :id :as human} {}
                 :model/Field {new-id :id} {}
                 :model/Field {nil-id :id} {}]
    (field-user-settings/upsert-field-user-settings! human {:semantic_type :type/Email :display_name "Human"})
    (field-user-settings/set-ai-values-for-fields!
     {human-id {:semantic_type :type/Name :description "ai"}
      new-id   {:data_sensitivity :PII}
      nil-id   {:description nil}})
    (testing "an existing row gets the AI values and keeps the human values and flags"
      (is (=? {:semantic_type :type/Email :semantic_type_set true :display_name "Human"
               :ai_semantic_type :type/Name :ai_description "ai" :description_set false}
              (t2/select-one :model/FieldUserSettings :field_id human-id))))
    (testing "a Field with no row gets one holding only the AI value, with no flag set"
      (is (=? {:ai_data_sensitivity :PII :data_sensitivity nil :data_sensitivity_set false}
              (t2/select-one :model/FieldUserSettings :field_id new-id))))
    (testing "only NULL AI values make no row"
      (is (not (t2/exists? :model/FieldUserSettings :field_id nil-id))))
    (testing "keys outside the AI columns are refused"
      (is (thrown? Exception (field-user-settings/set-ai-values-for-fields! {new-id {:display_name "x"}}))))))

(deftest ai-values-are-not-user-settable-test
  (mt/with-temp [:model/Field {field-id :id :as field} {}]
    (testing "upsert-field-user-settings! refuses the AI columns"
      (is (thrown? Exception (field-user-settings/upsert-field-user-settings! field {:ai_semantic_type :type/Name})))
      (is (not (t2/exists? :model/FieldUserSettings :field_id field-id))))
    (testing "the field API does not write the AI columns"
      (mt/user-http-request :crowberto :put (format "field/%d" field-id) {:ai_description "x"})
      (is (nil? (t2/select-one-fn :ai_description :model/FieldUserSettings :field_id field-id))))))

(deftest unset-user-settings-clears-an-unflagged-data-sensitivity-test
  (mt/with-temp [:model/Field {field-id :id :as field} {:data_sensitivity :PUBLIC}]
    (t2/insert! :model/FieldUserSettings {:field_id             field-id
                                          :data_sensitivity     :PII
                                          :data_sensitivity_set false
                                          :ai_data_sensitivity  :PHI})
    (testing "a human data_sensitivity without its flag counts as user-set, over the AI value"
      (let [settings (t2/select-one :model/FieldUserSettings :field_id field-id)]
        (is (contains? (user-settings/user-set-field-columns settings) :data_sensitivity))
        (is (= :human (user-settings/field-value-source settings :data_sensitivity :PII)))))
    (testing "unset-field-user-settings! of a human data_sensitivity without its flag gives the AI value back"
      (field-user-settings/unset-field-user-settings! field [:data_sensitivity])
      (is (= :PHI (read-column field-id :data_sensitivity)))
      (is (=? {:data_sensitivity nil :data_sensitivity_set false}
              (t2/select-one :model/FieldUserSettings :field_id field-id))))))

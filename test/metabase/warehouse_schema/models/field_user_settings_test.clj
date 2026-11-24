(ns metabase.warehouse-schema.models.field-user-settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [metabase.warehouse-schema.serialization :as warehouse-schema.serialization]
   [toucan2.core :as t2]))

(def ^:private structural-metadata
  {:is_grain           false
   :attribute_scd_type 1
   :facets             {:time :type/EventTimestamp}})

(deftest structural-metadata-round-trip-test
  (mt/with-temp [:model/Field             {field-id :id} {}
                 :model/FieldUserSettings _              (assoc structural-metadata
                                                                :field_id field-id
                                                                :display_name "User Name")]
    (is (= structural-metadata
           (select-keys (t2/select-one :model/FieldUserSettings :field_id field-id) (keys structural-metadata))))))

(deftest invalid-structural-metadata-test
  (mt/with-temp [:model/Field {field-id :id} {}]
    (doseq [[column value] [[:attribute_scd_type 4]
                            [:facets {:time :type/NotAType}]
                            [:facets {:color :type/Category}]]]
      (testing (pr-str column value)
        (is (=? {:status-code 400, :errors {column some?}}
                (try
                  (t2/insert! :model/FieldUserSettings {:field_id field-id, :display_name "User Name", column value})
                  nil
                  (catch clojure.lang.ExceptionInfo e
                    (ex-data e)))))))))

(deftest invalid-attribute-scd-type-update-test
  (mt/with-temp [:model/Field             {field-id :id} {}
                 :model/FieldUserSettings _              {:field_id field-id, :display_name "User Name"
                                                          :attribute_scd_type 1}]
    (is (=? {:status-code 400, :errors {:attribute_scd_type some?}}
            (try
              (t2/update! :model/FieldUserSettings :field_id field-id {:attribute_scd_type 4})
              nil
              (catch clojure.lang.ExceptionInfo e
                (ex-data e)))))
    (is (= 1 (t2/select-one-fn :attribute_scd_type :model/FieldUserSettings :field_id field-id)))))

(deftest bad-stored-facet-is-dropped-test
  (mt/with-temp [:model/Field             {field-id :id} {}
                 :model/FieldUserSettings _              {:field_id field-id, :display_name "User Name"}]
    (t2/update! :metabase_field_user_settings :field_id field-id {:facets "{\"time\":\"type/NotAType\"}"})
    (is (= {} (t2/select-one-fn :facets :model/FieldUserSettings :field_id field-id)))))

(deftest bad-stored-facets-read-as-nil-test
  (mt/with-temp [:model/Field             {field-id :id} {}
                 :model/FieldUserSettings _              {:field_id field-id, :display_name "User Name"}]
    (doseq [stored ["not json" "[\"type/Category\"]"]]
      (testing stored
        (t2/update! :metabase_field_user_settings :field_id field-id {:facets stored})
        (is (nil? (t2/select-one-fn :facets :model/FieldUserSettings :field_id field-id)))))))

(def ^:private synced-structural-metadata
  {:is_grain           true
   :attribute_scd_type 2
   :facets             {:key :type/DurableKey}})

(def ^:private structural-metadata-flags
  {:is_grain_set true, :attribute_scd_type_set true, :facets_set true})

(defn- field-row
  "The Field row."
  [field-id]
  (t2/select-one :model/Field :id field-id))

(deftest user-structural-metadata-sets-flags-test
  (mt/with-temp [:model/Field {field-id :id} {}]
    (field-user-settings/upsert-field-user-settings! (field-row field-id) structural-metadata)
    (is (=? structural-metadata (field-row field-id)))
    (is (=? (merge structural-metadata structural-metadata-flags)
            (t2/select-one :model/FieldUserSettings :field_id field-id)))))

(deftest sync-skips-user-structural-metadata-test
  (mt/with-temp [:model/Field {field-id :id} {}]
    (field-user-settings/upsert-field-user-settings! (field-row field-id) structural-metadata)
    (sync-util/update-field-unless-user-set! field-id synced-structural-metadata)
    (is (=? structural-metadata (field-row field-id)))))

(deftest user-null-structural-metadata-is-kept-test
  (let [nulls (update-vals structural-metadata (constantly nil))]
    (mt/with-temp [:model/Field {field-id :id} synced-structural-metadata]
      (field-user-settings/upsert-field-user-settings! (field-row field-id) nulls)
      (is (=? (merge nulls structural-metadata-flags) (t2/select-one :model/FieldUserSettings :field_id field-id)))
      (sync-util/update-field-unless-user-set! field-id synced-structural-metadata)
      (is (= nulls (select-keys (field-row field-id) (keys nulls)))))))

(deftest unset-structural-metadata-clears-flags-test
  (mt/with-temp [:model/Field {field-id :id} {}]
    (field-user-settings/upsert-field-user-settings! (field-row field-id)
                                                     (assoc structural-metadata :display_name "User Name"))
    (field-user-settings/unset-field-user-settings! (field-row field-id) (vec (keys structural-metadata)))
    (is (=? (merge (update-vals structural-metadata (constantly nil))
                   (update-vals structural-metadata-flags (constantly false)))
            (t2/select-one :model/FieldUserSettings :field_id field-id)))
    (sync-util/update-field-unless-user-set! field-id synced-structural-metadata)
    (is (=? synced-structural-metadata (field-row field-id)))))

(deftest serdes-load-keeps-structural-metadata-test
  (testing "a SerDes load clears the user values its export lacks, but not the structural metadata it never carries"
    (let [[{:keys [row]}] (warehouse-schema.serialization/field-user-settings-before-load
                           [{:local {:field_id 1}, :row {:description "d"}}])]
      (is (= {:description "d", :display_name nil} (select-keys row [:description :display_name])))
      (is (not-any? #(contains? row %) (keys structural-metadata))))))

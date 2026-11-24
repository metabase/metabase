(ns metabase.warehouse-schema.models.field-user-settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.core :as serialization]
   [metabase.sync.updates :as sync.updates]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [toucan2.core :as t2]))

(def ^:private structural-metadata
  {:is_grain           false
   :attribute_scd_type 1
   :facets             [:type/EventTimestamp]})

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
                            [:facets [:type/NotAType]]
                            [:facets {:time :type/EventTimestamp}]]]
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
    (t2/update! :metabase_field_user_settings :field_id field-id {:facets "[\"type/NotAType\"]"})
    (testing "stored facets that are all dropped read as nil"
      (is (nil? (t2/select-one-fn :facets :model/FieldUserSettings :field_id field-id))))))

(deftest bad-stored-facets-read-as-nil-test
  (mt/with-temp [:model/Field             {field-id :id} {}
                 :model/FieldUserSettings _              {:field_id field-id, :display_name "User Name"}]
    (doseq [stored ["not json" "{\"time\":\"type/EventTimestamp\"}"]]
      (testing stored
        (t2/update! :metabase_field_user_settings :field_id field-id {:facets stored})
        (is (nil? (t2/select-one-fn :facets :model/FieldUserSettings :field_id field-id)))))))

(def ^:private synced-structural-metadata
  {:is_grain           true
   :attribute_scd_type 2
   :facets             [:type/DurableKey]})

(def ^:private structural-metadata-flags
  {:is_grain_set true, :attribute_scd_type_set true, :facets_set true})

(defn- field-row
  "The Field with `field-id`, read through the model so its columns come back decoded."
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
    (sync.updates/update-field-unless-user-set! field-id synced-structural-metadata)
    (is (=? structural-metadata (field-row field-id)))))

(deftest user-null-structural-metadata-is-kept-test
  (let [nulls (update-vals structural-metadata (constantly nil))]
    (mt/with-temp [:model/Field {field-id :id} synced-structural-metadata]
      (field-user-settings/upsert-field-user-settings! (field-row field-id) nulls)
      (is (=? (merge nulls structural-metadata-flags) (t2/select-one :model/FieldUserSettings :field_id field-id)))
      (sync.updates/update-field-unless-user-set! field-id synced-structural-metadata)
      (is (= nulls (select-keys (field-row field-id) (keys nulls)))))))

(deftest unset-structural-metadata-clears-flags-test
  (mt/with-temp [:model/Field {field-id :id} {}]
    (field-user-settings/upsert-field-user-settings! (field-row field-id)
                                                     (assoc structural-metadata :display_name "User Name"))
    (field-user-settings/unset-field-user-settings! (field-row field-id) (vec (keys structural-metadata)))
    (is (=? (merge (update-vals structural-metadata (constantly nil))
                   (update-vals structural-metadata-flags (constantly false)))
            (t2/select-one :model/FieldUserSettings :field_id field-id)))
    (sync.updates/update-field-unless-user-set! field-id synced-structural-metadata)
    (is (=? synced-structural-metadata (field-row field-id)))))

(deftest serdes-update-keeps-structural-metadata-test
  (testing "a SerDes update sets every column its spec copies and none it skips, so the structural metadata stays"
    (mt/with-temp [:model/Field {field-id :id} {}]
      (field-user-settings/upsert-field-user-settings! (field-row field-id) structural-metadata)
      (let [{:keys [copy defaults update!]} (serialization/spec :model/FieldUserSettings)
            settings-id                     (t2/select-one-pk :model/FieldUserSettings :field_id field-id)]
        (update! [(merge (zipmap copy (repeat nil)) defaults {:id settings-id :description "d"})])
        (is (=? (assoc structural-metadata :description "d")
                (t2/select-one :model/FieldUserSettings :id settings-id)))
        (is (=? structural-metadata (field-row field-id)))))))

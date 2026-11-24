(ns metabase.warehouse-schema.models.field-user-settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
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

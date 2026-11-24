(ns metabase.warehouse-schema.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]))

(deftest dimension-type-test
  (testing "a Dimension is internal or external, as a keyword or a string"
    (is (= {:type :internal} (lib/normalize ::warehouse-schema.schema/dimension.update {:type "internal"})))
    (is (not (mr/validate ::warehouse-schema.schema/dimension.update {:type :http})))))

(deftest external-dimension-needs-field-test
  (let [bad {:type "external", :name "Remapped", :human_readable_field_id nil}]
    (testing "an external Dimension without a human-readable Field is a 400"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"require a human readable field id"
                            (lib/normalize ::warehouse-schema.schema/dimension bad {:throw? true}))))
    (testing "so is a serialized one"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"require a human readable field id"
                            (lib/normalize ::warehouse-schema.schema/external-dimension bad {:throw? true}))))
    (testing "an external Dimension with its Field, or a body without one of the two columns, passes"
      (is (= {:type :external, :human_readable_field_id 1}
             (lib/normalize ::warehouse-schema.schema/dimension.update
                            {:type "external", :human_readable_field_id 1} {:throw? true})))
      (is (= {:human_readable_field_id nil}
             (lib/normalize ::warehouse-schema.schema/dimension.update
                            {:human_readable_field_id nil} {:throw? true})))
      (is (= {:type :external}
             (lib/normalize ::warehouse-schema.schema/dimension.update {:type "external"} {:throw? true}))))))

(deftest ^:parallel table-role-schema-test
  (testing "a table role is a keyword in the table role hierarchy"
    (is (mr/validate ::warehouse-schema.schema/table-role :role/Fact))
    (is (mr/validate ::warehouse-schema.schema/table-role :role/HistoryDimension))
    (doseq [bad [:role/NotARole :entity/UserTable :type/PK "role/Fact" nil]]
      (testing (pr-str bad)
        (is (not (mr/validate ::warehouse-schema.schema/table-role bad))))))
  (testing "a string normalizes to the keyword"
    (is (= :role/Fact (lib/normalize ::warehouse-schema.schema/table-role "role/Fact")))))

(deftest ^:parallel period-granularity-schema-test
  (is (mr/validate ::warehouse-schema.schema/period-granularity :quarter))
  (is (not (mr/validate ::warehouse-schema.schema/period-granularity :fortnight)))
  (is (not (mr/validate ::warehouse-schema.schema/period-granularity "day")))
  (is (= :day (lib/normalize ::warehouse-schema.schema/period-granularity "day"))))

(deftest ^:parallel mutability-schema-test
  (is (mr/validate ::warehouse-schema.schema/mutability :append_only))
  (is (mr/validate ::warehouse-schema.schema/mutability :rebuilt_each_load))
  (is (not (mr/validate ::warehouse-schema.schema/mutability :append-only)))
  (is (= :versioned (lib/normalize ::warehouse-schema.schema/mutability "versioned"))))

(deftest ^:parallel load-strategy-schema-test
  (is (mr/validate ::warehouse-schema.schema/load-strategy :cdc))
  (is (mr/validate ::warehouse-schema.schema/load-strategy :insert_only))
  (is (not (mr/validate ::warehouse-schema.schema/load-strategy :upsert)))
  (is (= :merge (lib/normalize ::warehouse-schema.schema/load-strategy "merge"))))

(deftest ^:parallel scd-type-schema-test
  (doseq [n (range 8)]
    (is (mr/validate ::warehouse-schema.schema/scd-type n)))
  (doseq [bad [-1 8 1.5 "2"]]
    (testing (pr-str bad)
      (is (not (mr/validate ::warehouse-schema.schema/scd-type bad))))))

(deftest ^:parallel attribute-scd-type-schema-test
  (doseq [n (range 4)]
    (is (mr/validate ::warehouse-schema.schema/attribute-scd-type n)))
  (doseq [bad [-1 4 "1"]]
    (testing (pr-str bad)
      (is (not (mr/validate ::warehouse-schema.schema/attribute-scd-type bad))))))

(deftest ^:parallel history-definition-schema-test
  (is (mr/validate ::warehouse-schema.schema/history-definition
                   {:durable_key 12, :valid_from 15, :valid_to 16, :current_flag 17, :version nil}))
  (is (mr/validate ::warehouse-schema.schema/history-definition {}))
  (testing "the map is closed and holds Field ids"
    (is (not (mr/validate ::warehouse-schema.schema/history-definition {:durable_key 12, :surrogate_key 13})))
    (is (not (mr/validate ::warehouse-schema.schema/history-definition {:durable_key "12"})))
    (is (not (mr/validate ::warehouse-schema.schema/history-definition {:valid_from 0})))))

(deftest ^:parallel eav-definition-schema-test
  (is (mr/validate ::warehouse-schema.schema/eav-definition
                   {:entity_key 31, :property_name 32, :property_value 33, :definition_table 9, :label 41, :type 42}))
  (is (mr/validate ::warehouse-schema.schema/eav-definition {:entity_key 31, :definition_table nil}))
  (testing "the map is closed and holds ids"
    (is (not (mr/validate ::warehouse-schema.schema/eav-definition {:entity_key 31, :value 32})))
    (is (not (mr/validate ::warehouse-schema.schema/eav-definition {:definition_table -9})))))

(deftest ^:parallel facets-schema-test
  (is (mr/validate ::warehouse-schema.schema/facets
                   {:time :type/EventTimestamp, :key :type/DurableKey, :structure :type/CustomProperty
                    :lifecycle :type/SoftDeleteFlag}))
  (is (mr/validate ::warehouse-schema.schema/facets {}))
  (testing "a facet holds a known type under a known key"
    (is (not (mr/validate ::warehouse-schema.schema/facets {:time :type/NotAType})))
    (is (not (mr/validate ::warehouse-schema.schema/facets {:time :role/Fact})))
    (is (not (mr/validate ::warehouse-schema.schema/facets {:color :type/Category})))
    (is (not (mr/validate ::warehouse-schema.schema/facets {:time nil}))))
  (testing "string types normalize to keywords"
    (is (= {:time :type/EventTimestamp}
           (lib/normalize ::warehouse-schema.schema/facets {:time "type/EventTimestamp"})))))

(deftest ^:parallel table-structural-metadata-schema-test
  (let [table {:id                 1
               :table_role         :role/HistoryDimension
               :grain              "user version"
               :grain_description  "One row for each version of a user"
               :period_granularity :day
               :mutability         :versioned
               :load_strategy      :merge
               :scd_type           2
               :history_definition {:durable_key 12, :valid_from 15}
               :eav_definition     nil}]
    (is (mr/validate ::warehouse-schema.schema/table table))
    (is (mr/validate ::warehouse-schema.schema/table-user-settings (dissoc table :id)))
    (testing "values as stored are not decoded values"
      (is (not (mr/validate ::warehouse-schema.schema/table (assoc table :table_role "role/HistoryDimension"))))
      (is (not (mr/validate ::warehouse-schema.schema/table (assoc table :history_definition "{}"))))
      (is (not (mr/validate ::warehouse-schema.schema/table-user-settings {:mutability "versioned"}))))
    (testing "a grain is at most 254 characters"
      (is (not (mr/validate ::warehouse-schema.schema/table.update {:grain (apply str (repeat 255 "x"))}))))))

(deftest ^:parallel field-structural-metadata-schema-test
  (let [field {:id 1, :is_grain true, :attribute_scd_type 2, :facets {:time :type/EventTimestamp}}]
    (is (mr/validate ::warehouse-schema.schema/field field))
    (is (mr/validate ::warehouse-schema.schema/field-user-settings (dissoc field :id)))
    (is (not (mr/validate ::warehouse-schema.schema/field (assoc field :facets "{\"time\":\"type/EventTimestamp\"}"))))
    (is (not (mr/validate ::warehouse-schema.schema/field-user-settings {:attribute_scd_type 4})))))

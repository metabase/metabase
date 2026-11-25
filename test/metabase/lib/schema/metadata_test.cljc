(ns metabase.lib.schema.metadata-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.match :as match]))

(deftest ^:parallel normalize-column-metadata-test
  (let [col {"active"                                          true
             "base-type"                                       "type/Text"
             "database-type"                                   "CHARACTER VARYING"
             "display-name"                                    "Category"
             "effective-type"                                  "type/Text"
             ;; `:field-ref` should get removed, but the result-metadata key should get normalized
             "field-ref"                                       ["field" 61339 nil]
             "metabase.lib.metadata.result-metadata/field-ref" ["field" 61339 nil]
             "fingerprint"                                     {"global" {"distinct-count" 4, "nil%" 0.0}
                                                                "type"   {"type/Text"   {"average-length" 6.375
                                                                                         "percent-email"  0.0
                                                                                         "percent-json"   0.0
                                                                                         "percent-state"  0.0
                                                                                         "percent-url"    0.0}
                                                                          "type/Number" {"q1" 1.459}}}
             "id"                                              61339
             "lib/breakout?"                                   true
             "lib/deduplicated-name"                           "CATEGORY"
             "lib/desired-column-alias"                        "CATEGORY"
             "lib/original-display-name"                       "Category"
             "lib/original-name"                               "CATEGORY"
             "lib/source"                                      "source/table-defaults"
             "lib/source-column-alias"                         "CATEGORY"
             "lib/type"                                        "metadata/column"
             "name"                                            "CATEGORY"
             "position"                                        3
             "semantic-type"                                   "type/Category"
             "settings"                                        {"is_priceless" true}
             ;; `:source` should get removed, but the result-metadata version should get normalized.
             "source"                                          "breakout"
             "metabase.lib.metadata.result-metadata/source"    "breakout"
             "table-id"                                        10808
             "visibility-type"                                 "normal"}]
    (is (= {:active                                          true
            :base-type                                       :type/Text
            :database-type                                   "CHARACTER VARYING"
            :display-name                                    "Category"
            :effective-type                                  :type/Text
            :metabase.lib.metadata.result-metadata/field-ref [:field 61339 nil]
            :fingerprint                                     {:global {:distinct-count 4, :nil% 0.0}
                                                              :type   {:type/Text   {:average-length 6.375
                                                                                     :percent-email  0.0
                                                                                     :percent-json   0.0
                                                                                     :percent-state  0.0
                                                                                     :percent-url    0.0}
                                                                       :type/Number {:q1 1.459}}}
            :id                                              61339
            :name                                            "CATEGORY"
            :position                                        3
            :semantic-type                                   :type/Category
            :settings                                        {:is_priceless true}
            :metabase.lib.metadata.result-metadata/source    :breakout
            :table-id                                        10808
            :visibility-type                                 :normal
            :lib/breakout?                                   true
            :lib/deduplicated-name                           "CATEGORY"
            :lib/desired-column-alias                        "CATEGORY"
            :lib/original-display-name                       "Category"
            :lib/original-name                               "CATEGORY"
            :lib/source                                      :source/table-defaults
            :lib/source-column-alias                         "CATEGORY"
            :lib/type                                        :metadata/column}
           (lib/normalize ::lib.schema.metadata/column col)
           ;; should be able to detect that this is Lib metadata based on the use of `:base-type`
           (lib/normalize ::lib.schema.metadata/lib-or-legacy-column (dissoc col "lib/type"))))))

(deftest ^:parallel normalize-column-metadata-from-json-test
  (let [cols      (for [field (meta/fields :venues)]
                    (meta/field-metadata :venues field))
        json-cols (match/replace-all cols #'keyword? (u/qualified-name &match))]
    (is (= cols
           (lib/normalize [:sequential ::lib.schema.metadata/column] json-cols)))))

(deftest ^:parallel normalize-legacy-column-metadata-test
  (are [schema] (= {:base_type          :type/Integer
                    :coercion_strategy  nil
                    :description        nil
                    :display_name       "Entity ID"
                    :effective_type     :type/Integer
                    :field_ref          [:field 4335 nil]
                    :fk_target_field_id nil
                    :id                 4335
                    :name               "entity_id"
                    :semantic_type      :type/PK
                    :fingerprint        {:global {:distinct-count 4, :nil% 0.0}
                                         :type   {:type/Text   {:average-length 6.375
                                                                :percent-email  0.0
                                                                :percent-json   0.0
                                                                :percent-state  0.0
                                                                :percent-url    0.0}
                                                  :type/Number {:q1 1.459}}}}
                   (lib/normalize
                    schema
                    {"base_type"        "type/Integer"
                     :coercion_strategy  nil
                     :description        nil
                     :display_name       "Entity ID"
                     :effective_type     "type/Integer"
                     :field_ref          ["field" 4335 {}]
                     :fk_target_field_id nil
                     :id                 4335
                     :name               "entity_id"
                     :semantic_type      "type/PK"
                     :fingerprint        {:global {:distinct-count 4, :nil% 0.0}
                                          :type   {:type/Text   {:average-length 6.375
                                                                 :percent-email  0.0
                                                                 :percent-json   0.0
                                                                 :percent-state  0.0
                                                                 :percent-url    0.0}
                                                   :type/Number {:q1 1.459}}}}))
    ::mbql.s/legacy-column-metadata
    ::lib.schema.metadata/lib-or-legacy-column))

(deftest ^:parallel remove-inner-ident-test
  (testing "Remove deprecated keys like :model/inner_ident automatically (GIT-8399)"
    (is (= {:lib/type :metadata/column, :base-type :type/*, :name "X"}
           (lib/normalize ::lib.schema.metadata/column {:name "X", :model/inner_ident "wow"})))))

(deftest ^:parallel rename-source-alias-to-lib-original-join-alias-test
  (testing "Rename deprecated :source-alias to :lib/original-join-alias if it is not present (QUE2-278, QUE2-280)"
    (are [col expected] (= expected
                           (lib/normalize ::lib.schema.metadata/column col))
      {:name "X", :source-alias "alias"}
      {:name "X", :lib/type :metadata/column, :base-type :type/*, :lib/original-join-alias "alias"}

      {:name "X", :source-alias "alias", :lib/original-join-alias "existing alias"}
      {:name "X", :lib/type :metadata/column, :base-type :type/*, :lib/original-join-alias "existing alias"})))

(deftest ^:parallel rename-old-long-namespaced-keys-test
  (testing "Old long-namespaced keys in stored result_metadata should be renamed to :lib/* equivalents"
    (let [base    {:name "X", :lib/type :metadata/column, :base-type :type/*}
          renames @#'lib.schema.common/deprecated-lib-key-renames]
      (are [old-key value] (let [normalized (lib/normalize ::lib.schema.metadata/column {old-key value, :name "X"})]
                             (is (= (assoc base (renames old-key) value)
                                    normalized))
                             (is (mr/validate ::lib.schema.metadata/column normalized)))
        :metabase.lib.join/join-alias                      "Products"
        :metabase.lib.field/temporal-unit                  :month
        :metabase.lib.field/binning                        {:strategy :default, :num-bins 10}
        :metabase.lib.field/original-effective-type        :type/Text
        :metabase.lib.field/simple-display-name            "Category: Name"
        :metabase.lib.query/transformation-added-base-type true)
      (testing "new key already present takes precedence"
        (is (= (assoc base :lib/temporal-unit :year)
               (lib/normalize ::lib.schema.metadata/column
                              {:name "X", :metabase.lib.field/temporal-unit :month, :lib/temporal-unit :year}))))
      (testing "old keys are disallowed by the schema"
        (are [old-key value] (not (mr/validate ::lib.schema.metadata/column
                                               (assoc base old-key value)))
          :metabase.lib.join/join-alias                      "Products"
          :metabase.lib.field/temporal-unit                  :month
          :metabase.lib.field/binning                        {:strategy :default, :num-bins 10}
          :metabase.lib.field/original-effective-type        :type/Text
          :metabase.lib.field/simple-display-name            "Category: Name"
          :metabase.lib.query/transformation-added-base-type true)))))

(deftest ^:parallel column-data-sensitivity-test
  (testing "every member of the severity-ordered vector validates and the vector has no duplicates"
    (is (= 10 (count lib.schema.metadata/column-data-sensitivity-types)))
    (is (apply distinct? lib.schema.metadata/column-data-sensitivity-types))
    (doseq [member lib.schema.metadata/column-data-sensitivity-types]
      (is (mr/validate ::lib.schema.metadata/column.data-sensitivity member))))
  (testing "the most severe member comes first and PUBLIC comes last"
    (is (= :SEC_KEY (first lib.schema.metadata/column-data-sensitivity-types)))
    (is (= :PUBLIC (last lib.schema.metadata/column-data-sensitivity-types))))
  (testing "normalization keywordizes a string member"
    (is (= :PII (lib/normalize ::lib.schema.metadata/column.data-sensitivity "PII"))))
  (testing "values outside the enum are rejected"
    (are [value] (not (mr/validate ::lib.schema.metadata/column.data-sensitivity value))
      :pii
      :NOT_A_MEMBER
      "PII"
      nil)))

(deftest ^:parallel normalize-column-remapping-test
  (is (= {:lib/type :metadata.column.remapping/external
          :id       72
          :name     "Category ID"
          :field-id 67}
         (lib/normalize ::lib.schema.metadata/column.remapping.external
                        {"lib/type" "metadata.column.remapping/external"
                         "id"       72
                         "name"     "Category ID"
                         "field-id" 67})))
  (is (= {:lib/type              :metadata.column.remapping/internal
          :id                    66
          :name                  "ID"
          :values                [1 2]
          :human-readable-values ["One" "Two"]}
         (lib/normalize ::lib.schema.metadata/column.remapping.internal
                        {"lib/type"              "metadata.column.remapping/internal"
                         "id"                    66
                         "name"                  "ID"
                         "values"                [1 2]
                         "human_readable_values" ["One" "Two"]}))))

(deftest ^:parallel column-attribute-scd-type-test
  (let [column {:lib/type :metadata/column, :name "X", :base-type :type/Integer}]
    (doseq [n (range 4)]
      (is (mr/validate ::lib.schema.metadata/column (assoc column :attribute-scd-type n))))
    (is (mr/validate ::lib.schema.metadata/column (assoc column :attribute-scd-type nil)))
    (doseq [bad [-1 4 "1"]]
      (testing (pr-str bad)
        (is (not (mr/validate ::lib.schema.metadata/column (assoc column :attribute-scd-type bad))))))))

(def ^:private table-with-structural-metadata
  {:lib/type           :metadata/table
   :id                 1
   :name               "USERS_HISTORY"
   :table-role         :role/HistoryDimension
   :grain              "user version"
   :grain-description  "One row for each version of a user"
   :period-granularity :day
   :mutability         :versioned
   :load-strategy      :merge
   :scd-type           2
   :history-definition {:durable-key 12, :valid-from 15, :valid-to 16, :current-flag 17, :version nil}
   :eav-definition     {:entity-key 31, :property-name 32, :property-value 33, :definition-table 9, :label 41, :type 42}})

(deftest ^:parallel table-structural-metadata-test
  (is (mr/validate ::lib.schema.metadata/table table-with-structural-metadata))
  (is (mr/validate ::lib.schema.metadata/table
                   (merge table-with-structural-metadata
                          (zipmap [:table-role :grain :grain-description :period-granularity :mutability :load-strategy
                                   :scd-type :history-definition :eav-definition]
                                  (repeat nil)))))
  (doseq [[k bad] [[:table-role :role/NotARole]
                   [:table-role :entity/UserTable]
                   [:period-granularity :fortnight]
                   [:mutability :append-only]
                   [:load-strategy :upsert]
                   [:scd-type 8]
                   [:history-definition {:durable_key 12}]
                   [:history-definition {:surrogate-key 12}]
                   [:eav-definition {:definition-table "9"}]]]
    (testing (pr-str k bad)
      (is (not (mr/validate ::lib.schema.metadata/table (assoc table-with-structural-metadata k bad)))))))

(deftest ^:parallel normalize-table-structural-metadata-test
  (testing "normalizing kebab-cases the definitions' snake_case keys and keywordizes the values"
    (is (= table-with-structural-metadata
           (lib/normalize ::lib.schema.metadata/table
                          (assoc table-with-structural-metadata
                                 :table-role         "role/HistoryDimension"
                                 :period-granularity "day"
                                 :mutability         "versioned"
                                 :load-strategy      "merge"
                                 :history-definition {"durable_key" 12, "valid_from" 15, "valid_to" 16, "current_flag" 17, "version" nil}
                                 :eav-definition     {:entity_key 31, :property_name 32, :property_value 33, :definition_table 9, :label 41, :type 42}))))))

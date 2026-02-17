(ns metabase.lib.schema.metadata-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [clojure.walk :as walk]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.util :as u]))

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
        json-cols (walk/postwalk
                   (fn [x]
                     (cond-> x
                       (keyword? x) u/qualified-name))
                   cols)]
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

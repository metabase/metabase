(ns metabase.lib.schema.metadata-test
  (:require
   [clojure.test :refer [are deftest is]]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema.metadata :as lib.schema.metadata]))

(deftest ^:parallel normalize-column-metadata-test
  (let [col {"active"                    true
             "base-type"                 "type/Text"
             "database-type"             "CHARACTER VARYING"
             "display-name"              "Category"
             "effective-type"            "type/Text"
             "field-ref"                 ["field" 61339 nil]
             "fingerprint"               {"global" {"distinct-count" 4, "nil%" 0.0}
                                          "type"   {"type/Text"   {"average-length" 6.375
                                                                   "percent-email"  0.0
                                                                   "percent-json"   0.0
                                                                   "percent-state"  0.0
                                                                   "percent-url"    0.0}
                                                    "type/Number" {"q1" 1.459}}}
             "id"                        61339
             "lib/breakout?"             true
             "lib/deduplicated-name"     "CATEGORY"
             "lib/desired-column-alias"  "CATEGORY"
             "lib/original-display-name" "Category"
             "lib/original-name"         "CATEGORY"
             "lib/source"                "source/table-defaults"
             "lib/source-column-alias"   "CATEGORY"
             "lib/type"                  "metadata/column"
             "name"                      "CATEGORY"
             "position"                  3
             "semantic-type"             "type/Category"
             "source"                    "breakout"
             "table-id"                  10808
             "visibility-type"           "normal"}]
    (is (= {:active                    true
            :base-type                 :type/Text
            :database-type             "CHARACTER VARYING"
            :display-name              "Category"
            :effective-type            :type/Text
            :field-ref                 [:field 61339 nil]
            :fingerprint               {:global {:distinct-count 4, :nil% 0.0}
                                        :type   {:type/Text   {:average-length 6.375
                                                               :percent-email  0.0
                                                               :percent-json   0.0
                                                               :percent-state  0.0
                                                               :percent-url    0.0}
                                                 :type/Number {:q1 1.459}}}
            :id                        61339
            :name                      "CATEGORY"
            :position                  3
            :semantic-type             :type/Category
            :source                    :breakout
            :table-id                  10808
            :visibility-type           :normal
            :lib/breakout?             true
            :lib/deduplicated-name     "CATEGORY"
            :lib/desired-column-alias  "CATEGORY"
            :lib/original-display-name "Category"
            :lib/original-name         "CATEGORY"
            :lib/source                :source/table-defaults
            :lib/source-column-alias   "CATEGORY"
            :lib/type                  :metadata/column}
           (lib.normalize/normalize ::lib.schema.metadata/column col)
           ;; should be able to detect that this is Lib metadata based on the use of `:base-type`
           (lib.normalize/normalize ::lib.schema.metadata/lib-or-legacy-column (dissoc col "lib/type"))))))

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
                   (lib.normalize/normalize
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

(ns metabase.sync.analyze.classifiers.no-preview-display-test
  "Tests for the category classifier."
  (:require [clojure.test :refer :all]
            [metabase.models.field :as field]
            [metabase.sync.analyze.classifiers.no-preview-display :as no-preview-display]))

(def ^:private long-text-field
  (field/map->FieldInstance
   {:database_type       "VARCHAR"
    :semantic_type       nil
    :name                "longfield"
    :fingerprint_version 1
    :has_field_values    nil
    :active              true
    :visibility_type     :normal
    :preview_display     true
    :display_name        "Mr. Long"
    :fingerprint         {:global {:distinct-count 42}
                          :type
                          {:type/Text
                           {:percent-json   0.0
                            :percent-url    0.0
                            :percent-email  0.0
                            :average-length 130.516}}}
    :base_type           :type/Text}))

(deftest short-fields-test
  (testing "Leave short text fields intact"
    (is (= nil
           (:preview_display
            (no-preview-display/infer-no-preview-display
             long-text-field
             (-> long-text-field
                 :fingerprint
                 (assoc-in [:type :type/Text :average-length] 2))))))))

(deftest generic-long-text-fields-test
  (testing "Don't preview generic long text fields"
    (is (= false
           (:preview_display
            (no-preview-display/infer-no-preview-display
             long-text-field (:fingerprint long-text-field)))))))

(deftest semantic-type-test
  (testing "If the field has a semantic type, show it regardless of it's length"
    (is (= nil
           (:preview_display
            (no-preview-display/infer-no-preview-display
             (assoc long-text-field :semantic_type :type/Name)
             (:fingerprint long-text-field)))))))

(ns metabase.sync.analyze.classifiers.no-preview-display-test
  "Tests for the category classifier."
  (:require [expectations :refer :all]
            [metabase.models.field :as field]
            [metabase.sync.analyze.classifiers.no-preview-display :refer :all]))

(def ^:private long-text-field
  (field/map->FieldInstance
   {:database_type       "VARCHAR"
    :special_type        nil
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

;; Leave short text fields intact
(expect
  nil
  (:preview_display (infer-no-preview-display long-text-field
                                              (-> long-text-field
                                                  :fingerprint
                                                  (assoc-in [:type :type/Text :average-length] 2)))))

;; Don't preview generic long text fields
(expect
  false
  (:preview_display (infer-no-preview-display long-text-field (:fingerprint long-text-field))))

;; If the field has a special type, show it regardless of it's length
(expect
  nil
  (:preview_display (infer-no-preview-display (assoc long-text-field :special_type :type/Name)
                                              (:fingerprint long-text-field))))

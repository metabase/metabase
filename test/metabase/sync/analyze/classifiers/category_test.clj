(ns metabase.sync.analyze.classifiers.category-test
  "Tests for the category classifier."
  (:require [expectations :refer :all]
            [metabase.sync.analyze.classifiers.category :as category-classifier]))

;; make sure the logic for deciding whether a Field should be a list works as expected
(expect
  nil
  (#'category-classifier/field-should-be-list?
   2500
   {:database_type       "VARCHAR"
    :special_type        :type/Name
    :name                "NAME"
    :fingerprint_version 1
    :has_field_values    nil
    :active              true
    :visibility_type     :normal
    :preview_display     true
    :display_name        "Name"
    :fingerprint         {:global {:distinct-count 2500}
                          :type
                          {:type/Text
                           {:percent-json   0.0
                            :percent-url    0.0
                            :percent-email  0.0
                            :average-length 13.516}}}
    :base_type           :type/Text}))

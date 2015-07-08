(ns metabase.models.field-values-test
  (:require [expectations :refer :all]
            [metabase.models.field-values :refer :all]))

;; ## TESTS FOR FIELD-SHOULD-HAVE-FIELD-VALUES?

(expect true
  (field-should-have-field-values? {:special_type :category
                                    :field_type :info
                                    :base_type :TextField}))

(expect false
  (field-should-have-field-values? {:special_type :category
                                    :field_type :sensitive
                                    :base_type :TextField}))

(expect false
  (field-should-have-field-values? {:special_type nil
                                    :field_type :info
                                    :base_type :TextField}))

(expect true
  (field-should-have-field-values? {:special_type "country"
                                    :field_type :info
                                    :base_type :TextField}))

(expect true
  (field-should-have-field-values? {:special_type nil
                                    :field_type :info
                                    :base_type "BooleanField"}))

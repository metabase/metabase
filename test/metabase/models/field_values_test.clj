(ns metabase.models.field-values-test
  (:require [expectations :refer :all]
            [metabase.models.field-values :refer :all]))

;; ## TESTS FOR FIELD-SHOULD-HAVE-FIELD-VALUES?

(expect true
  (field-should-have-field-values? {:special_type :category
                                    :base_type :TextField}))

(expect false
  (field-should-have-field-values? {:special_type nil
                                    :base_type :TextField}))

(expect true
  (field-should-have-field-values? {:special_type "country"
                                    :base_type :TextField}))

(expect true
  (field-should-have-field-values? {:special_type nil
                                    :base_type "BooleanField"}))

(ns metabase.models.field-values-test
  (:require [expectations :refer :all]
            [metabase.models.field-values :refer :all]))

;; ## TESTS FOR FIELD-SHOULD-HAVE-FIELD-VALUES?

(expect true
  (field-should-have-field-values? {:special_type :type/special.category
                                    :field_type :info
                                    :base_type :type/text}))

(expect false
  (field-should-have-field-values? {:special_type :type/special.category
                                    :field_type :sensitive
                                    :base_type :type/text}))

(expect false
  (field-should-have-field-values? {:special_type nil
                                    :field_type :info
                                    :base_type :type/text}))

(expect true
  (field-should-have-field-values? {:special_type "type/text.geo.country"
                                    :field_type :info
                                    :base_type :type/text}))

(expect true
  (field-should-have-field-values? {:special_type nil
                                    :field_type :info
                                    :base_type "type/boolean"}))

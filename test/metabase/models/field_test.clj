(ns metabase.models.field-test
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            (metabase.models [field :refer :all]
                             [field-values :refer :all])
            [metabase.test.data :refer :all]))


;; field-should-have-field-values?

;; sensitive fields should always be excluded
(expect false (field-should-have-field-values? {:base_type    :type/boolean
                                                :special_type :type/special.category
                                                :field_type   :sensitive}))
;; date/time based fields should always be excluded
(expect false (field-should-have-field-values? {:base_type    :type/datetime.date
                                                :special_type :type/special.category
                                                :field_type   :dimension}))
(expect false (field-should-have-field-values? {:base_type    :type/datetime
                                                :special_type :type/special.category
                                                :field_type   :dimension}))
(expect false (field-should-have-field-values? {:base_type    :type/datetime.time
                                                :special_type :type/special.category
                                                :field_type   :dimension}))
;; most special types should be excluded
(expect false (field-should-have-field-values? {:base_type    :type/text
                                                :special_type :type/text.url.image
                                                :field_type   :dimension}))
(expect false (field-should-have-field-values? {:base_type    :type/text
                                                :special_type :type/special.pk
                                                :field_type   :dimension}))
(expect false (field-should-have-field-values? {:base_type    :type/text
                                                :special_type :type/special.fk
                                                :field_type   :dimension}))
(expect false (field-should-have-field-values? {:base_type    :type/text
                                                :special_type :type/number.float.coordinate.latitude
                                                :field_type   :dimension}))
(expect false (field-should-have-field-values? {:base_type    :type/text
                                                :special_type :type/number
                                                :field_type   :dimension}))
(expect false (field-should-have-field-values? {:base_type    :type/text
                                                :special_type :type/datetime.unix.milliseconds
                                                :field_type   :dimension}))
;; boolean fields + category/city/state/country fields are g2g
(expect true (field-should-have-field-values? {:base_type    :type/boolean
                                               :special_type :type/number
                                               :field_type   :dimension}))
(expect true (field-should-have-field-values? {:base_type    :type/text
                                               :special_type :type/special.category
                                               :field_type   :dimension}))
(expect true (field-should-have-field-values? {:base_type    :type/text
                                               :special_type :type/text.geo.city
                                               :field_type   :dimension}))
(expect true (field-should-have-field-values? {:base_type    :type/text
                                               :special_type :type/text.geo.state
                                               :field_type   :dimension}))
(expect true (field-should-have-field-values? {:base_type    :type/text
                                               :special_type :type/text.geo.country
                                               :field_type   :dimension}))
(expect true (field-should-have-field-values? {:base_type    :type/text
                                               :special_type :type/text.name
                                               :field_type   :dimension}))

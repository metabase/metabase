(ns metabase.models.field-test
  (:require [expectations :refer :all]
            [metabase.models.field-values :refer :all]
            [metabase.sync.analyze.special-types :as special-types]
            [metabase.sync.analyze.special-types.name :as name]))

;; field-should-have-field-values?

;; retired/sensitive/hidden/details-only fields should always be excluded
(expect false (field-should-have-field-values? {:base_type       :type/Boolean
                                                :special_type    :type/Category
                                                :visibility_type :retired}))
(expect false (field-should-have-field-values? {:base_type       :type/Boolean
                                                :special_type    :type/Category
                                                :visibility_type :sensitive}))
(expect false (field-should-have-field-values? {:base_type       :type/Boolean
                                                :special_type    :type/Category
                                                :visibility_type :hidden}))
(expect false (field-should-have-field-values? {:base_type       :type/Boolean
                                                :special_type    :type/Category
                                                :visibility_type :details-only}))
;; date/time based fields should always be excluded
(expect false (field-should-have-field-values? {:base_type       :type/Date
                                                :special_type    :type/Category
                                                :visibility_type :normal}))
(expect false (field-should-have-field-values? {:base_type       :type/DateTime
                                                :special_type    :type/Category
                                                :visibility_type :normal}))
(expect false (field-should-have-field-values? {:base_type       :type/Time
                                                :special_type    :type/Category
                                                :visibility_type :normal}))
;; most special types should be excluded
(expect false (field-should-have-field-values? {:base_type       :type/Text
                                                :special_type    :type/ImageURL
                                                :visibility_type :normal}))
(expect false (field-should-have-field-values? {:base_type       :type/Text
                                                :special_type    :id
                                                :visibility_type :normal}))
(expect false (field-should-have-field-values? {:base_type       :type/Text
                                                :special_type    :type/FK
                                                :visibility_type :normal}))
(expect false (field-should-have-field-values? {:base_type       :type/Text
                                                :special_type    :type/Latitude
                                                :visibility_type :normal}))
(expect false (field-should-have-field-values? {:base_type       :type/Text
                                                :special_type    :type/Number
                                                :visibility_type :normal}))
(expect false (field-should-have-field-values? {:base_type       :type/Text
                                                :special_type    :type/UNIXTimestampMilliseconds
                                                :visibility_type :normal}))
;; boolean fields + category/city/state/country fields are g2g
(expect true (field-should-have-field-values? {:base_type       :type/Boolean
                                               :special_type    :type/Number
                                               :visibility_type :normal}))
(expect true (field-should-have-field-values? {:base_type       :type/Text
                                               :special_type    :type/Category
                                               :visibility_type :normal}))
(expect true (field-should-have-field-values? {:base_type       :type/Text
                                               :special_type    :type/City
                                               :visibility_type :normal}))
(expect true (field-should-have-field-values? {:base_type       :type/Text
                                               :special_type    :type/State
                                               :visibility_type :normal}))
(expect true (field-should-have-field-values? {:base_type       :type/Text
                                               :special_type    :type/Country
                                               :visibility_type :normal}))
(expect true (field-should-have-field-values? {:base_type       :type/Text
                                               :special_type    :type/Name
                                               :visibility_type :normal}))


;;; infer-field-special-type
(expect :type/PK       (#'name/infer-special-type-by-name "id"      :type/Integer))
;; other pattern matches based on type/regex (remember, base_type matters in matching!)
(expect :type/Category (#'name/infer-special-type-by-name "rating"  :type/Integer))
(expect nil            (#'name/infer-special-type-by-name "rating"  :type/Boolean))
(expect :type/Country  (#'name/infer-special-type-by-name "country" :type/Text))
(expect nil            (#'name/infer-special-type-by-name "country" :type/Integer))

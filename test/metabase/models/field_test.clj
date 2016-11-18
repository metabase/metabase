(ns metabase.models.field-test
  (:require [expectations :refer :all]
            (metabase.models [field :refer :all]
                             [field-values :refer :all])
            [metabase.test.data :refer :all]
            [metabase.test.util :as tu]))


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

(tu/resolve-private-vars metabase.models.field infer-field-special-type)

(expect nil            (infer-field-special-type nil       nil))
(expect nil            (infer-field-special-type "id"      nil))
(expect nil            (infer-field-special-type nil       :type/Integer))
(expect :type/PK       (infer-field-special-type "id"      :type/Integer))
;; other pattern matches based on type/regex (remember, base_type matters in matching!)
(expect :type/Category (infer-field-special-type "rating"  :type/Integer))
(expect nil            (infer-field-special-type "rating"  :type/Boolean))
(expect :type/Country  (infer-field-special-type "country" :type/Text))
(expect nil            (infer-field-special-type "country" :type/Integer))

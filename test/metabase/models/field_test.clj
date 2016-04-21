(ns metabase.models.field-test
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            (metabase.models [field :refer :all]
                             [field-values :refer :all])
            [metabase.test.data :refer :all]))


;; valid-metadata?
(expect false (valid-metadata? nil nil nil nil))
(expect false (valid-metadata? :IntegerField nil nil nil))
(expect false (valid-metadata? :IntegerField :metric nil nil))
(expect true (valid-metadata? :IntegerField :metric nil :normal))
(expect false (valid-metadata? :foo :metric nil :normal))
(expect false (valid-metadata? :IntegerField :foo nil :normal))
(expect false (valid-metadata? :IntegerField :metric nil :foo))
(expect true (valid-metadata? :IntegerField :metric :timestamp_seconds :normal))
(expect true (valid-metadata? :IntegerField :metric :timestamp_milliseconds :normal))
(expect false (valid-metadata? :DateTimeField :metric :timestamp_seconds :normal))
(expect false (valid-metadata? :DateTimeField :metric :timestamp_milliseconds :normal))


;; field-should-have-field-values?

;; retired/sensitive/hidden/details-only fields should always be excluded
(expect false (field-should-have-field-values? {:base_type       :BooleanField
                                                :special_type    :category
                                                :visibility_type :retired}))
(expect false (field-should-have-field-values? {:base_type       :BooleanField
                                                :special_type    :category
                                                :visibility_type :sensitive}))
(expect false (field-should-have-field-values? {:base_type       :BooleanField
                                                :special_type    :category
                                                :visibility_type :hidden}))
(expect false (field-should-have-field-values? {:base_type       :BooleanField
                                                :special_type    :category
                                                :visibility_type :details-only}))
;; date/time based fields should always be excluded
(expect false (field-should-have-field-values? {:base_type    :DateField
                                                :special_type :category
                                                :visibility_type :normal}))
(expect false (field-should-have-field-values? {:base_type    :DateTimeField
                                                :special_type :category
                                                :visibility_type :normal}))
(expect false (field-should-have-field-values? {:base_type    :TimeField
                                                :special_type :category
                                                :visibility_type :normal}))
;; most special types should be excluded
(expect false (field-should-have-field-values? {:base_type    :CharField
                                                :special_type :image
                                                :visibility_type :normal}))
(expect false (field-should-have-field-values? {:base_type    :CharField
                                                :special_type :id
                                                :visibility_type :normal}))
(expect false (field-should-have-field-values? {:base_type    :CharField
                                                :special_type :fk
                                                :visibility_type :normal}))
(expect false (field-should-have-field-values? {:base_type    :CharField
                                                :special_type :latitude
                                                :visibility_type :normal}))
(expect false (field-should-have-field-values? {:base_type    :CharField
                                                :special_type :number
                                                :visibility_type :normal}))
(expect false (field-should-have-field-values? {:base_type    :CharField
                                                :special_type :timestamp_milliseconds
                                                :visibility_type :normal}))
;; boolean fields + category/city/state/country fields are g2g
(expect true (field-should-have-field-values? {:base_type    :BooleanField
                                               :special_type :number
                                               :visibility_type :normal}))
(expect true (field-should-have-field-values? {:base_type    :CharField
                                               :special_type :category
                                               :visibility_type :normal}))
(expect true (field-should-have-field-values? {:base_type    :TextField
                                               :special_type :city
                                               :visibility_type :normal}))
(expect true (field-should-have-field-values? {:base_type    :TextField
                                               :special_type :state
                                               :visibility_type :normal}))
(expect true (field-should-have-field-values? {:base_type    :TextField
                                               :special_type :country
                                               :visibility_type :normal}))
(expect true (field-should-have-field-values? {:base_type    :TextField
                                               :special_type :name
                                               :visibility_type :normal}))


;; infer-field-special-type
(expect nil (infer-field-special-type nil nil))
(expect nil (infer-field-special-type "id" nil))
(expect nil (infer-field-special-type nil :IntegerField))
;; name of "id" should be :id
(expect :id (infer-field-special-type "id" :IntegerField))
;; other pattern matches based on type/regex (remember, base_type matters in matching!)
(expect :category (infer-field-special-type "rating" :IntegerField))
(expect nil (infer-field-special-type "rating" :BooleanField))
(expect :country (infer-field-special-type "country" :TextField))
(expect nil (infer-field-special-type "country" :IntegerField))


;; TODO: update-field
;; TODO: create-field

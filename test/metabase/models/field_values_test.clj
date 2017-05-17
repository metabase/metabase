(ns metabase.models.field-values-test
  (:require [expectations :refer :all]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [field-values :refer :all]
             [table :refer [Table]]]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; ## TESTS FOR FIELD-SHOULD-HAVE-FIELD-VALUES?

(expect (field-should-have-field-values? {:special_type    :type/Category
                                          :visibility_type :normal
                                          :base_type       :type/Text}))

(expect false (field-should-have-field-values? {:special_type    :type/Category
                                                :visibility_type :sensitive
                                                :base_type       :type/Text}))

(expect false (field-should-have-field-values? {:special_type    :type/Category
                                                :visibility_type :hidden
                                                :base_type       :type/Text}))

(expect false (field-should-have-field-values? {:special_type :type/Category
                                                :visibility_type          :details-only
                                                :base_type                :type/Text}))

(expect false (field-should-have-field-values? {:special_type    nil
                                                :visibility_type :normal
                                                :base_type       :type/Text}))

(expect (field-should-have-field-values? {:special_type    "type/Country"
                                          :visibility_type :normal
                                          :base_type       :type/Text}))

(expect (field-should-have-field-values? {:special_type    nil
                                          :visibility_type :normal
                                          :base_type       "type/Boolean"}))
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


(expect
  [[1 2 3]
   nil]
  (tt/with-temp* [Database    [{database-id :id}]
                  Table       [{table-id :id} {:db_id database-id}]
                  Field       [{field-id :id} {:table_id table-id}]
                  FieldValues [_              {:field_id field-id, :values "[1,2,3]"}]]
    [(db/select-one-field :values FieldValues, :field_id field-id)
     (do
       (clear-field-values! field-id)
       (db/select-one-field :values FieldValues, :field_id field-id))]))

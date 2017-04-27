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

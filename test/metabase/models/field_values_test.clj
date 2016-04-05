(ns metabase.models.field-values-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.models.database :refer [Database]]
            [metabase.models.field :refer [Field]]
            [metabase.models.field-values :refer :all]
            [metabase.models.table :refer [Table]]
            [metabase.test.util :as tu]))

;; ## TESTS FOR FIELD-SHOULD-HAVE-FIELD-VALUES?

(expect true
  (field-should-have-field-values? {:special_type :category
                                    :visibility_type :normal
                                    :base_type :TextField}))

(expect false
  (field-should-have-field-values? {:special_type :category
                                    :visibility_type :sensitive
                                    :base_type :TextField}))
(expect false
  (field-should-have-field-values? {:special_type :category
                                    :visibility_type :hidden
                                    :base_type :TextField}))
(expect false
  (field-should-have-field-values? {:special_type :category
                                    :visibility_type :details-only
                                    :base_type :TextField}))

(expect false
  (field-should-have-field-values? {:special_type nil
                                    :visibility_type :normal
                                    :base_type :TextField}))

(expect true
  (field-should-have-field-values? {:special_type "country"
                                    :visibility_type :normal
                                    :base_type :TextField}))

(expect true
  (field-should-have-field-values? {:special_type nil
                                    :visibility_type :normal
                                    :base_type "BooleanField"}))


(expect
  [[1,2,3]
   {:status 204, :body nil}
   nil]
  (tu/with-temp* [Database    [{database-id :id}]
                  Table       [{table-id :id} {:db_id database-id}]
                  Field       [{field-id :id} {:table_id table-id}]
                  FieldValues [_              {:field_id field-id, :values "[1,2,3]"}]]
    [(db/sel :one :field [FieldValues :values] :field_id field-id)
     (clear-field-values field-id)
     (db/sel :one :field [FieldValues :values] :field_id field-id)]))

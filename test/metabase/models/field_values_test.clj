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


(expect
  [[1,2,3]
   {:status 204, :body nil}
   nil]
  (tu/with-temp Database [{database-id :id} {:name      "FieldValues Test"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{table-id :id} {:name   "FieldValues Test"
                                         :db_id  database-id
                                         :active true}]
      (tu/with-temp Field [{field-id :id} {:table_id    table-id
                                           :name        "FieldValues Test"
                                           :base_type   :TextField
                                           :field_type  :info
                                           :active      true
                                           :preview_display true
                                           :position    1}]
        (tu/with-temp FieldValues [_ {:field_id field-id
                                      :values   "[1,2,3]"}]
          [(db/sel :one :field [FieldValues :values] :field_id field-id)
           (clear-field-values field-id)
           (db/sel :one :field [FieldValues :values] :field_id field-id)])))))

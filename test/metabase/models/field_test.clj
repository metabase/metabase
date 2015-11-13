(ns metabase.models.field-test
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            (metabase.models [field :refer :all]
                             [field-values :refer :all])
            [metabase.test.data :refer :all]))

;; Check that setting a Field's special_type to :category will cause a corresponding FieldValues to be created asynchronously
(expect
    [nil
     40
     :done]
  (let [orig-special-type      (sel :one :field [Field :special_type] :id (id :categories :name))
        set-field-special-type (fn [special-type]
                                 (upd Field (id :categories :name) :special_type special-type))
        sel-field-values-count (fn []
                                 (some-> (sel :one FieldValues :field_id (id :categories :name))
                                         :values
                                         count))
        del-field-values       (fn []
                                 (del FieldValues :field_id (id :categories :name)))]
    [(do (del-field-values)                 ; make sure there's nothing at first
         (set-field-special-type nil)
         (sel-field-values-count))
     (do (set-field-special-type :category)
         (Thread/sleep 250)                 ; wait 250ms for the FieldValues object to get asynchronously created
         (sel-field-values-count))
     (do (del-field-values)                 ; put things back how we found them
         (set-field-special-type orig-special-type)
         :done)]))

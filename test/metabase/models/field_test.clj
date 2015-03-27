(ns metabase.models.field-test
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            (metabase.models [field :refer :all]
                             [field-values :refer :all])
            [metabase.test-data :refer :all]
            metabase.test-setup))

;; Check that setting a Field's special_type to :category will cause a corresponding FieldValues to be created asynchronously
(expect
    [nil
     75
     :done]
  (let [set-field-special-type (fn [special-type]
                                 (upd Field (field->id :categories :name) :special_type special-type))
        sel-field-values-count (fn []
                                 (some-> (sel :one FieldValues :field_id (field->id :categories :name))
                                         :values
                                         count))
        del-field-values       (fn []
                                 (del FieldValues :field_id (field->id :categories :name)))]
    [(do (del-field-values)                 ; make sure there's nothing at first
         (set-field-special-type nil)
         (sel-field-values-count))
     (do (set-field-special-type :category)
         (Thread/sleep 200)                 ; wait 200ms for the FieldValues object to get asynchronously created
         (sel-field-values-count))
     (do (del-field-values)                 ; put things back how we found them
         (set-field-special-type nil)
         :done)]))

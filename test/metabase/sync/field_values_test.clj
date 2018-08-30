(ns metabase.sync.field-values-test
  "Tests around the way Metabase syncs FieldValues, and sets the values of `field.has_field_values`."
  (:require [expectations :refer :all]
            [metabase
             [sync :as sync]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [field-values :as field-values :refer [FieldValues]]
             [table :refer [Table]]]
            [metabase.sync.util-test :as sut]
            [metabase.test.data :as data]
            [metabase.test.data.one-off-dbs :as one-off-dbs]
            [toucan.db :as db]))

;; Test that when we delete FieldValues syncing the Table again will cause them to be re-created
(defn- venues-price-field-values []
  (db/select-one-field :values FieldValues, :field_id (data/id :venues :price)))

(expect
  {1 [1 2 3 4]
   2 nil
   3 {:errors 0, :created 1, :updated 5, :deleted 0}
   4 [1 2 3 4]}
  (array-map
   ;; 1. Check that we have expected field values to start with
   1 (venues-price-field-values)
   ;; 2. Delete the Field values, make sure they're gone
   2 (do (db/delete! FieldValues :field_id (data/id :venues :price))
         (venues-price-field-values))
   ;; 3. After the delete, a field values should be created, the rest updated
   3 (sut/only-step-keys (sut/sync-database! "update-field-values" (Database (data/id))))
   ;; 4. Now re-sync the table and make sure they're back
   4 (do (sync/sync-table! (Table (data/id :venues)))
         (venues-price-field-values))))

;; Test that syncing will cause FieldValues to be updated
(expect
  {1 [1 2 3 4]
   2 [1 2 3]
   3 {:errors 0, :created 0, :updated 6, :deleted 0}
   4 [1 2 3 4]}
  (array-map
   ;; 1. Check that we have expected field values to start with
   1 (venues-price-field-values)
   ;; 2. Update the FieldValues, remove one of the values that should be there
   2 (do (db/update! FieldValues (db/select-one-id FieldValues :field_id (data/id :venues :price))
           :values [1 2 3])
         (venues-price-field-values))
   ;; 3. Now re-sync the table and validate the field values updated
   3 (sut/only-step-keys (sut/sync-database! "update-field-values" (Database (data/id))))
   ;; 4. Make sure the value is back
   4 (venues-price-field-values)))


;; A Field with 50 values should get marked as `auto-list` on initial sync, because it should be 'list', but was
;; marked automatically, as opposed to explicitly (`list`)
(expect
  :auto-list
  (one-off-dbs/with-blueberries-db
    ;; insert 50 rows & sync
    (one-off-dbs/insert-rows-and-sync! (range 50))
    ;; has_field_values should be auto-list
    (db/select-one-field :has_field_values Field :id (data/id :blueberries_consumed :num))))

;; ... and it should also have some FieldValues
(expect
  #metabase.models.field_values.FieldValuesInstance
  {:values                [0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33
                           34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49]
   :human_readable_values {}}
  (one-off-dbs/with-blueberries-db
    (one-off-dbs/insert-rows-and-sync! (range 50))
    (db/select-one [FieldValues :values :human_readable_values], :field_id (data/id :blueberries_consumed :num))))

;; ok, but if the number grows past the threshold & we sync again it should get unmarked as auto-list and set back to
;; `nil` (#3215)
(expect
  nil
  (one-off-dbs/with-blueberries-db
    ;; insert 50 bloobs & sync. has_field_values should be auto-list
    (one-off-dbs/insert-rows-and-sync! (range 50))
    (assert (= (db/select-one-field :has_field_values Field :id (data/id :blueberries_consumed :num))
               :auto-list))
    ;; now insert enough bloobs to put us over the limit and re-sync.
    (one-off-dbs/insert-rows-and-sync! (range 50 (+ 100 field-values/auto-list-cardinality-threshold)))
    ;; has_field_values should have been set to nil.
    (db/select-one-field :has_field_values Field :id (data/id :blueberries_consumed :num))))

;; ...its FieldValues should also get deleted.
(expect
  nil
  (one-off-dbs/with-blueberries-db
    ;; do the same steps as the test above...
    (one-off-dbs/insert-rows-and-sync! (range 50))
    (one-off-dbs/insert-rows-and-sync! (range 50 (+ 100 field-values/auto-list-cardinality-threshold)))
    ;; ///and FieldValues should also have been deleted.
    (db/select-one [FieldValues :values :human_readable_values], :field_id (data/id :blueberries_consumed :num))))

;; If we had explicitly marked the Field as `list` (instead of `auto-list`), adding extra values shouldn't change
;; anything!
(expect
  :list
  (one-off-dbs/with-blueberries-db
    ;; insert 50 bloobs & sync
    (one-off-dbs/insert-rows-and-sync! (range 50))
    ;; change has_field_values to list
    (db/update! Field (data/id :blueberries_consumed :num) :has_field_values "list")
    ;; insert more bloobs & re-sync
    (one-off-dbs/insert-rows-and-sync! (range 50 (+ 100 field-values/auto-list-cardinality-threshold)))
    ;; has_field_values shouldn't change
    (db/select-one-field :has_field_values Field :id (data/id :blueberries_consumed :num))))

;; it should still have FieldValues, and have new ones for the new Values. It should have 200 values even though this
;; is past the normal limit of 100 values!
(expect
  #metabase.models.field_values.FieldValuesInstance
  {:values                [0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33
                           34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64
                           65 66 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91 92 93 94 95
                           96 97 98 99 100 101 102 103 104 105 106 107 108 109 110 111 112 113 114 115 116 117 118 119
                           120 121 122 123 124 125 126 127 128 129 130 131 132 133 134 135 136 137 138 139 140 141 142
                           143 144 145 146 147 148 149 150 151 152 153 154 155 156 157 158 159 160 161 162 163 164 165
                           166 167 168 169 170 171 172 173 174 175 176 177 178 179 180 181 182 183 184 185 186 187 188
                           189 190 191 192 193 194 195 196 197 198 199]
   :human_readable_values {}}
  (one-off-dbs/with-blueberries-db
    ;; follow the same steps as the test above...
    (one-off-dbs/insert-rows-and-sync! (range 50))
    (db/update! Field (data/id :blueberries_consumed :num) :has_field_values "list")
    (one-off-dbs/insert-rows-and-sync! (range 50 (+ 100 field-values/auto-list-cardinality-threshold)))
    ;; ... and FieldValues should still be there, but this time updated to include the new values!
    (db/select-one [FieldValues :values :human_readable_values], :field_id (data/id :blueberries_consumed :num))))

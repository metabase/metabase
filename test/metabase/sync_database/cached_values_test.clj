(ns metabase.sync-database.cached-values-test
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [expectations :refer :all]
            [metabase
             [driver :as driver]
             [sync-database :as sync-database]
             [util :as u]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.models
             [field-values :refer [FieldValues]]
             [table :as table :refer [Table]]]
            [metabase.sync-database.cached-values :refer :all]
            [metabase.test.data :refer :all]
            [toucan.db :as db]))

;; fields with detected names should get values cached
(expect
  {:values       [1 2 3 4]}
  (with-redefs-fn {#'metadata-queries/field-distinct-values (constantly [1 2 3 4])}
    #(extract-field-values {:base_type :type/Text :name "type"} {})))

;; unless they have really large values that would be unreasonable to display
(expect
  {}
  (with-redefs-fn {#'metadata-queries/field-distinct-values (constantly [(str/join (repeat 50000 "A"))])}
    #(extract-field-values {:base_type :type/Text :name "type"} {})))

(def ^:private venues-table (delay (Table (id :venues))))

(let [get-field-values    (fn [] (db/select-one-field :values FieldValues, :field_id (id :venues :price)))
      get-field-values-id (fn [] (db/select-one-id FieldValues, :field_id (id :venues :price)))
      venues-driver       (fn [] (driver/database-id->driver (:id (table/database @venues-table))))] ;; im a function so i work in cider
  ;; Test that when we delete FieldValues syncing the Table again will cause them to be re-created
  (expect
    [[1 2 3 4]  ; 1
     nil        ; 2
     [1 2 3 4]] ; 3
    [ ;; 1. Check that we have expected field values to start with
     (do (sync-database/sync-table! @venues-table)
         (cache-table-data-shape! (venues-driver) @venues-table)
         (get-field-values))
     ;; 2. Delete the Field values, make sure they're gone
     (do (db/delete! FieldValues :id (get-field-values-id))
         (get-field-values))
     ;; 3. Now re-sync the table and make sure they're back
     (do (sync-database/sync-table! @venues-table)
         (cache-table-data-shape! (venues-driver) @venues-table)
         (get-field-values))])

  ;; Test that caching will cause FieldValues to be updated
  (expect
    [[1 2 3 4]  ; 1
     [1 2 3]    ; 2
     [1 2 3 4]] ; 3
    [ ;; 1. Check that we have expected field values to start with
     (get-field-values)
     ;; 2. Update the FieldValues, remove one of the values that should be there
     (do (db/update! FieldValues (get-field-values-id), :values [1 2 3])
         (get-field-values))
     ;; 3. Now re-sync the table and make sure the value is back
     (do (cache-table-data-shape! (venues-driver) @venues-table)
         (get-field-values))]))

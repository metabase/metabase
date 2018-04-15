(ns metabase.sync.field-values
  "Logic for updating cached FieldValues for fields in a database."
  (:require [clojure.tools.logging :as log]
            [metabase.models
             [field :refer [Field]]
             [field-values :refer [FieldValues] :as field-values]]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

(s/defn ^:private clear-field-values-for-field! [field :- i/FieldInstance]
  (when (db/exists? FieldValues :field_id (u/get-id field))
    (log/debug (format "Based on cardinality and/or type information, %s should no longer have field values.\n"
                       (sync-util/name-for-logging field))
               "Deleting FieldValues...")
    (db/delete! FieldValues :field_id (u/get-id field))))

(s/defn ^:private update-field-values-for-field! [field :- i/FieldInstance]
  (log/debug (u/format-color 'green "Looking into updating FieldValues for %s" (sync-util/name-for-logging field)))
  (field-values/create-or-update-field-values! field))


(s/defn update-field-values-for-table!
  "Update the cached FieldValues for all Fields (as needed) for TABLE."
  [table :- i/TableInstance]
  (doseq [field (db/select Field :table_id (u/get-id table), :active true, :visibility_type "normal")]
    (sync-util/with-error-handling (format "Error updating field values for %s" (sync-util/name-for-logging field))
      (if (field-values/field-should-have-field-values? field)
        (update-field-values-for-field! field)
        (clear-field-values-for-field! field)))))


(s/defn update-field-values!
  "Update the cached FieldValues (distinct values for categories and certain other fields that are shown
   in widgets like filters) for the Tables in DATABASE (as needed)."
  [database :- i/DatabaseInstance]
  (sync-util/sync-operation :cache-field-values database (format "Cache field values in %s"
                                                                 (sync-util/name-for-logging database))
    (doseq [table (sync-util/db->sync-tables database)]
      (update-field-values-for-table! table))))

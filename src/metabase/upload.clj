;; # Upload Module Contract
;;
;; ## What you can use this module for:
;; - Creating, replacing, and appending to tables in the customer's database with CSV data.
;;
;; ## Stable guarantees (what you can depend on):
;; - When an uploaded table is created, the uploaded data will be inserted into a new table in the customer database,
;;   and a new card will be created in Metabase that wraps the uploaded table.
;; - Any schema changes will be synced to the Metabase internal database.
;; - Each uploaded table will have an auto-incrementing integer primary key in the uploaded table, so the rows in a can
;;   be uniquely identified. This column is named `_mb_row_id`.
;; - The correct permissions and instance settings are checked before any changes are made.
;;
;; ## Unstable internals (what you can't depend on):
;; The upload module hides the following implementation details which are subject to change:
;; - The set of permissions and instance settings that are required to upload data.
;; - CSV parsing and column type logic:
;;    - How it parses the CSV and converts the values to the correct types.
;;    - How it infers the schema of the CSV data by inferring column types based on the values in each column.
;; - Database interactions:
;;    - How it creates new tables and inserts the uploaded data. It uses the` `metabase.driver` namespace to perform
;;      database-specific operations, so the details of different databased driversare not this module's concern.
;;    - How it interacts with Metabase's internal database to create new cards and tables associated with the tables in the
;;      customer DB, using `metabase.sync` and `metabase.models`.

(ns metabase.upload
  (:require
   [metabase.upload.internal :as upload.internal]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(p/import-vars
 [upload.internal
  auto-pk-column-name
  auto-pk-column-keyword
  current-database
  table-identifier
  *auxiliary-sync-steps*
  can-create-upload?
  create-csv-upload!
  delete-upload!
  update-action-schema
  update-csv!
  model-hydrate-based-on-upload
  based-on-upload])

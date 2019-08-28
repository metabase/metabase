(ns metabase.sync.sync-metadata.fields
  "Logic for updating Metabase Field models from metadata fetched from a physical DB.

  The basic idea here is to look at the metadata we get from calling `describe-table` on a connected database, then
  construct an identical set of metadata from what we have about that Table in the Metabase DB. Then we iterate over
  both sets of Metadata and perform whatever steps are needed to make sure the things in the DB match the things that
  came back from `describe-table`. These steps are broken out into three main parts:

  * Fetch Metadata - logic is in `metabase.sync.sync-metadata.fields.fetch-metadata`. Construct a map of metadata from
    the Metabase application database that matches the form of DB metadata about Fields in a Table. This metadata is
    used to next two steps to determine what sync operations need to be performed by comparing the differences in the
    two sets of Metadata.

  * Sync Field instances -- logic is in `metabase.sync.sync-metadata.fields.sync-instances`. Make sure the `Field`
    instances in the Metabase application database match up with those in the DB metadata, creating new Fields as
    needed, and marking existing ones as active or inactive as appropriate.

  * Update instance metadata -- logic is in `metabase.sync.sync-metadata.fields.sync-metadata`. Update metadata
    properties of `Field` instances in the application database as needed -- this includes the base type, database type,
    special type, and comment/remark (description) properties. This primarily affects Fields that were not newly
    created; newly created Fields are given appropriate metadata when first synced (by `sync-instances`).

  A note on terminology used in `metabase.sync.sync-metadata.fields.*` namespaces:

  * `db-metadata` is a set of `field-metadata` maps coming back from the DB (e.g. from something like JDBC
    `DatabaseMetaData`) describing the columns (or equivalent) currently present in the table (or equivalent) that we're
    syncing.

  *  `field-metadata` is a map of information describing a single columnn currently present in the table being synced

  *  `our-metadata` is a set of maps of Field metadata reconstructed from the Metabase application database.

  *  `metabase-field` is a single map of Field metadata reconstructed from the Metabase application database; there is
     a 1:1 correspondance between this metadata and a row in the `Field` table. Unlike `field-metadata`, these entries
     always have an `:id` associated with them (because they are present in the Metabase application DB).

  Other notes:

  * In general the methods in these namespaces return the number of rows updated; these numbers are summed and used
    for logging purposes by higher-level sync logic."
  (:require [clojure.tools.logging :as log]
            [metabase.models.table :as table :refer [Table]]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.sync.sync-metadata.fields
             [fetch-metadata :as fetch-metadata]
             [sync-instances :as sync-instances]
             [sync-metadata :as sync-metadata]]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [trs]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUTTING IT ALL TOGETHER                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private calculate-table-hash :- su/NonBlankString
  "Calculate a hash of the `db-field-metadata` (metadata about the Fields in a given Table); this hash is saved after
  sync is completed; if it is the same next time we attempt to sync a Table, we can skip the Table entirely; since the
  metadata coming back from the DB/drivers is the same as last timw."
  [db-metadata :- #{i/TableMetadataField}]
  (->> db-metadata
       (map (juxt :name :database-type :base-type :special-type :pk? :nested-fields :custom :field-comment))
       ;; We need a predictable sort order as the hash will be different if the order is different
       (sort-by first)
       sync-util/calculate-hash))

(s/defn ^:private sync-and-update! :- su/IntGreaterThanOrEqualToZero
  "Sync Field instances (i.e., rows in the Field table in the Metabase application DB) for a Table, and update metadata
  properties (e.g. base type and comment/remark) as needed. Returns number of Fields synced."
  [table :- i/TableInstance, db-metadata :- #{i/TableMetadataField}]
  (+ (sync-instances/sync-instances! table db-metadata (fetch-metadata/our-metadata table))
     ;; Now that tables are synced and fields created as needed make sure field properties are in sync.
     ;; Re-fetch our metadata because there might be somethings that have changed after calling
     ;; `sync-instances`
     (sync-metadata/update-metadata! table db-metadata (fetch-metadata/our-metadata table))))


(s/defn sync-fields-for-table! :- {:updated-fields su/IntGreaterThanOrEqualToZero
                                   :total-fields   su/IntGreaterThanOrEqualToZero}
  "Sync the Fields in the Metabase application database for a specific `table`."
  ([table :- i/TableInstance]
   (sync-fields-for-table! (table/database table) table))

  ([database :- i/DatabaseInstance, {old-hash :fields_hash, :as table} :- i/TableInstance]
   (sync-util/with-error-handling (trs "Error syncing Fields for Table ''{0}''" (sync-util/name-for-logging table))
     (let [db-metadata   (fetch-metadata/db-metadata database table)
           total-fields  (count db-metadata)
           ;; hash the metadata about Fields in the Table; if it mashes the hash from last time we synced then we know
           ;; there's nothing to do here and we can skip iterating over the Fields
           new-hash      (calculate-table-hash db-metadata)
           hash-changed? (or (not old-hash) (not= new-hash old-hash))]
       ;; if hash is unchanged we can skip the rest of the sync process
       (when-not hash-changed?
         (log/debug (trs "Hash of {0} matches stored hash, skipping Fields sync" (sync-util/name-for-logging table))))
       ;; Ok, sync Fields if needed
       (let [num-synced-fields (or (when hash-changed?
                                     (sync-and-update! table db-metadata))
                                   0)]
         ;; Now that Fields sync has completed successfully, save updated hash in the application DB...
         (when hash-changed?
           (db/update! Table (u/get-id table) :fields_hash new-hash))
         ;;; ...and return the results
         {:total-fields total-fields, :updated-fields num-synced-fields})))))


(s/defn sync-fields! :- (s/maybe {:updated-fields su/IntGreaterThanOrEqualToZero
                                  :total-fields   su/IntGreaterThanOrEqualToZero})
  "Sync the Fields in the Metabase application database for all the Tables in a DATABASE."
  [database :- i/DatabaseInstance]
  (let [tables (sync-util/db->sync-tables database)]
    (apply merge-with + (for [table tables]
                          (sync-fields-for-table! database table)))))

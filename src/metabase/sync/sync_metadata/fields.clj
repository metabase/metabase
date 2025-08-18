(ns metabase.sync.sync-metadata.fields
  "Logic for updating Metabase Field models from metadata fetched from a physical DB.

  The basic idea here is to look at the metadata we get from calling `describe-table` on a connected database, then
  construct an identical set of metadata from what we have about that Table in the Metabase DB. Then we iterate over
  both sets of Metadata and perform whatever steps are needed to make sure the things in the DB match the things that
  came back from `describe-table`. These steps are broken out into three main parts:

  * Fetch Our Metadata - logic is in `metabase.sync.sync-metadata.fields.our-metadata`. Construct a map of metadata from
    the Metabase application database that matches the form of DB metadata about Fields in a Table. This metadata is
    used to next two steps to determine what sync operations need to be performed by comparing the differences in the
    two sets of Metadata.

  * Sync Field instances -- logic is in `metabase.sync.sync-metadata.fields.sync-instances`. Make sure the `Field`
    instances in the Metabase application database match up with those in the DB metadata, creating new Fields as
    needed, and marking existing ones as active or inactive as appropriate.

  * Update instance metadata -- logic is in `metabase.sync.sync-metadata.fields.sync-metadata`. Update metadata
    properties of `Field` instances in the application database as needed -- this includes the base type, database type,
    semantic type, and comment/remark (description) properties. This primarily affects Fields that were not newly
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
  (:require
   [metabase.driver.util :as driver.u]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.interface :as i]
   [metabase.sync.sync-metadata.fields.our-metadata :as fields.our-metadata]
   [metabase.sync.sync-metadata.fields.sync-instances :as sync-instances]
   [metabase.sync.sync-metadata.fields.sync-metadata :as sync-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.models.table :as table]
   [toucan2.core :as t2]
   [toucan2.util :as t2.util]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUTTING IT ALL TOGETHER                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- sync-and-update! :- ms/IntGreaterThanOrEqualToZero
  "Sync Field instances (i.e., rows in the Field table in the Metabase application DB) for a Table, and update metadata
  properties (e.g. base type and comment/remark) as needed. Returns number of Fields synced."
  [database    :- i/DatabaseInstance
   table       :- i/TableInstance
   db-metadata :- [:set i/TableMetadataField]]
  (+ (sync-instances/sync-instances! table db-metadata (fields.our-metadata/our-metadata table))
     ;; Now that tables are synced and fields created as needed make sure field properties are in sync.
     ;; Re-fetch our metadata because there might be some things that have changed after calling
     ;; `sync-instances`
     (sync-metadata/update-metadata! database table db-metadata (fields.our-metadata/our-metadata table))))

(defn- select-best-matching-name
  "Returns a key function for use with [[sort-by]] that ranks items based on how closely their `:schema` and `:name` match the given target values.
   Items with matching `:schema` and `:name` are prioritized, with exact matches ranked higher than non-exact matches."
  [target-schema target-name]
  (fn [item]
    [(not= (:schema item) target-schema)
     (not= (:name item) target-name)]))

(mu/defn sync-fields! :- [:map
                          [:updated-fields ms/IntGreaterThanOrEqualToZero]
                          [:total-fields   ms/IntGreaterThanOrEqualToZero]]
  "Sync the Fields in the Metabase application database for all the Tables in a `database`."
  [database :- i/DatabaseInstance]
  (sync-util/with-error-handling (format "Error syncing Fields for Database ''%s''" (sync-util/name-for-logging database))
    (let [driver          (driver.u/database->driver database)
          schemas?        (driver.u/supports? driver :schemas database)
          fields-metadata (if schemas?
                            (fetch-metadata/fields-metadata database :schema-names (sync-util/sync-schemas database))
                            (fetch-metadata/fields-metadata database))]
      (transduce (comp
                  (partition-by (juxt :table-name :table-schema))
                  (map (fn [table-metadata]
                         (let [{:keys [table-name table-schema]} (first table-metadata)
                               table   (->> (t2/select :model/Table
                                                       :db_id (:id database)
                                                       :%lower.name (t2.util/lower-case-en table-name)
                                                       :%lower.schema (some-> table-schema t2.util/lower-case-en)
                                                       {:where sync-util/sync-tables-clause})
                                            (sort-by (select-best-matching-name table-schema table-name))
                                            first)
                               updated (if table
                                         (try
                                           ;; TODO: decouple nested field columns sync from field sync. This will allow
                                           ;; describe-fields to be used for field sync for databases with nested field columns
                                           ;; Also this should be a driver method, not a sql-jdbc.sync method
                                           (let [all-metadata (fetch-metadata/include-nested-fields-for-table
                                                               (set table-metadata)
                                                               database
                                                               table)]
                                             (sync-and-update! database table all-metadata))
                                           (catch Exception e
                                             (log/error e)
                                             0))
                                         0)]
                           {:total-fields   (count table-metadata)
                            :updated-fields updated}))))
                 (partial merge-with +)
                 {:total-fields   0
                  :updated-fields 0}
                 fields-metadata))))

(mu/defn sync-fields-for-table!
  "Sync the Fields in the Metabase application database for a specific `table`."
  ([table :- i/TableInstance]
   (sync-fields-for-table! (table/database table) table))

  ([database :- i/DatabaseInstance
    table    :- i/TableInstance]
   (sync-util/with-error-handling (format "Error syncing Fields for Table ''%s''" (sync-util/name-for-logging table))
     (let [db-metadata (fetch-metadata/table-fields-metadata database table)
           ;; TODO: decouple nested field columns sync from field sync. This will allow
           ;; describe-fields to be used for field sync for databases with nested field columns
           ;; Also this should be a driver method, not a sql-jdbc.sync method
           db-metadata (fetch-metadata/include-nested-fields-for-table db-metadata database table)]
       {:total-fields   (count db-metadata)
        :updated-fields (sync-and-update! database table db-metadata)}))))

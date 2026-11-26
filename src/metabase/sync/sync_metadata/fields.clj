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

  *  `field-metadata` is a map of information describing a single column currently present in the table being synced

  *  `our-metadata` is a set of maps of Field metadata reconstructed from the Metabase application database.

  *  `metabase-field` is a single map of Field metadata reconstructed from the Metabase application database; there is
     a 1:1 correspondence between this metadata and a row in the `Field` table. Unlike `field-metadata`, these entries
     always have an `:id` associated with them (because they are present in the Metabase application DB).

  Other notes:

  * In general the methods in these namespaces return the number of rows updated; these numbers are summed and used
    for logging purposes by higher-level sync logic."
  (:require
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.util :as driver.u]
   [metabase.sync.db :as sync.db]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.interface :as i]
   [metabase.sync.sync-metadata.fields.our-metadata :as fields.our-metadata]
   [metabase.sync.sync-metadata.fields.sync-instances :as sync-instances]
   [metabase.sync.sync-metadata.fields.sync-metadata :as sync-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.util :as t2.util]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUTTING IT ALL TOGETHER                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- warn-too-many-fields!
  "Log that `table`'s warehouse schema has more fields than sync-max-fields-per-table (`limit`), so only the first
  `limit` (by name) are synced as :model/Field rows and the rest are skipped -- keeps document databases with very
  large/dynamic schemas (e.g. MongoDB) from creating an unbounded number of Fields."
  [table :- i/TableInstance
   limit :- ms/PositiveInt]
  (log/warnf (str "Table %s has more than sync-max-fields-per-table (%d) fields; syncing the first %d (by name) and "
                  "skipping the rest. Raise MB_SYNC_MAX_FIELDS_PER_TABLE to sync more.")
             (sync-util/name-for-logging table) limit limit))

(mu/defn- limit-fields-to-sync :- [:set i/TableMetadataField]
  "Cap `db-metadata` to at most [[driver.settings/sync-max-fields-per-table]] fields, keeping the first by name so the
  selection is stable across syncs, and warning when fields are dropped.

  Drivers hard-cap their metadata at exactly `limit` fields per table (they read `sync-max-fields-per-table`), so a
  table that comes back with `limit` fields is assumed to have hit the cap -- warn. We only need to truncate when a
  driver returned strictly more than `limit` (i.e. one that doesn't honor the cap)."
  [table       :- i/TableInstance
   db-metadata :- [:set i/TableMetadataField]]
  (let [limit (driver.settings/sync-max-fields-per-table)
        n     (count db-metadata)]
    (when (>= n limit)
      (warn-too-many-fields! table limit))
    (if (> n limit)
      (into #{} (take limit (sort-by :name db-metadata)))
      db-metadata)))

(mu/defn- sync-and-update-limited! :- ms/IntGreaterThanOrEqualToZero
  "Sync the Field instances of a Table and update their metadata from `db-metadata`, already limited by
  [[limit-fields-to-sync]], returning the number of Fields synced."
  [database    :- i/DatabaseInstance
   table       :- i/TableInstance
   db-metadata :- [:set i/TableMetadataField]]
  (+ (sync-instances/sync-instances! table db-metadata (fields.our-metadata/our-metadata table))
     ;; Now that tables are synced and fields created as needed make sure field properties are in sync.
     ;; Re-fetch our metadata because there might be some things that have changed after calling
     ;; `sync-instances`
     (sync-metadata/update-metadata! database table db-metadata (fields.our-metadata/our-metadata table))))

(mu/defn- sync-and-update! :- ms/IntGreaterThanOrEqualToZero
  "Sync Field instances (i.e., rows in the Field table in the Metabase application DB) for a Table, and update metadata
  properties (e.g. base type and comment/remark) as needed. Returns number of Fields synced. Only the first
  [[driver.settings/sync-max-fields-per-table]] fields are synced; any beyond that are skipped (see
  [[limit-fields-to-sync]])."
  [database    :- i/DatabaseInstance
   table       :- i/TableInstance
   db-metadata :- [:set i/TableMetadataField]]
  (sync-and-update-limited! database table (limit-fields-to-sync table db-metadata)))

(defn- select-best-matching-name
  "Returns a key function for use with [[sort-by]] that ranks items based on how closely their `:schema` and `:name` match the given target values.
   Items with matching `:schema` and `:name` are prioritized, with exact matches ranked higher than non-exact matches."
  [target-schema target-name]
  (fn [item]
    [(not= (:schema item) target-schema)
     (not= (:name item) target-name)]))

(def ^:private chunk-max-tables
  "The most Tables whose Fields [[sync-fields!]] syncs together."
  200)

(def ^:private chunk-max-columns
  "The most warehouse columns of the Tables [[sync-fields!]] syncs together, a wider Table being synced on its own."
  5000)

(defn- chunk-key-fn
  "A key function for `partition-by` over the column groups of the Tables of a sync, one per Table, that changes once
  the next group would put more than [[chunk-max-tables]] Tables or [[chunk-max-columns]] columns in the chunk."
  []
  (let [state (volatile! {:chunk 0 :tables 0 :columns 0})]
    (fn [table-metadata]
      (let [{:keys [chunk tables columns]} @state
            n                              (count table-metadata)]
        (:chunk (vreset! state (if (and (pos? tables)
                                        (or (>= tables chunk-max-tables)
                                            (> (+ columns n) chunk-max-columns)))
                                 {:chunk (inc chunk) :tables 1 :columns n}
                                 {:chunk chunk :tables (inc tables) :columns (+ columns n)})))))))

(defn- log-table-failure
  "Log the exception `e` that failed the sync of the Fields of `table`, rethrowing it when the warehouse is unreachable,
  which fails every Table and so aborts the step."
  [table e]
  (when (sync-util/transient-exception? e)
    (throw e))
  ;; a missing grant or FDW user mapping is for the customer to fix, not a Metabase bug
  (if (sync-util/customer-environment-exception? e)
    (log/warnf "Error syncing Fields for %s: %s" (sync-util/name-for-logging table) (ex-message e))
    (log/errorf e "Error syncing Fields for %s: %s" (sync-util/name-for-logging table) (ex-message e))))

(defn- table-resolver
  "A function of the name and schema of a column group of `chunk` to the synced Table of `database` it belongs to, the
  candidate Tables of the whole chunk read together and hidden Tables matched too, so that a hidden Table's
  columns are never given to a visible Table whose name differs only in case."
  [database chunk]
  (let [lower-names (into [] (comp (map (comp t2.util/lower-case-en :table-name first)) (distinct)) chunk)
        candidates  (group-by (juxt :lower_name :lower_schema)
                              (sync.db/active-tables-by-lower-names (:id database) lower-names))]
    (fn [table-name table-schema]
      (let [best (->> (get candidates [(t2.util/lower-case-en table-name) (some-> table-schema t2.util/lower-case-en)])
                      (sort-by (select-best-matching-name table-schema table-name))
                      first)]
        (when (and best (nil? (:visibility_type best)))
          (dissoc best :lower_name :lower_schema))))))

(defn- table-entry
  "The `table` of the column group `table-metadata` with its `:db-metadata`, including nested field columns and limited
  by [[limit-fields-to-sync]], or nil when reading them from the warehouse fails, which is logged."
  [database remap-table table table-metadata]
  (try
    ;; TODO: decouple nested field columns sync from field sync. This will allow
    ;; describe-fields to be used for field sync for databases with nested field columns
    ;; Also this should be a driver method, not a sql-jdbc.sync method
    {:table       table
     :db-metadata (limit-fields-to-sync table (fetch-metadata/include-nested-fields-for-table (set table-metadata)
                                                                                              database
                                                                                              table
                                                                                              remap-table))}
    (catch Exception e
      (log-table-failure table e)
      nil)))

(defn- sync-tables-one-at-a-time!
  "Sync the Fields of each of the Table `entries` on its own, logging the failure of one and going on with the others,
  and return the number of Fields synced."
  [database entries]
  (sync-util/sum-for [{:keys [table db-metadata]} entries]
    (try
      (sync-and-update-limited! database table db-metadata)
      (catch Exception e
        (log-table-failure table e)
        0))))

(defn- sync-tables-together!
  "Sync the Fields of all the Table `entries`, none with nested Fields, reading our metadata of all of them together,
  again after any Field was created, reactivated or retired, and writing their changes together, and return the number
  of Fields synced."
  [database entries]
  (let [table-ids         (mapv (comp u/the-id :table) entries)
        add-our-metadata  (fn []
                            (let [table-id->our-metadata (fields.our-metadata/our-metadata-by-table-id table-ids)]
                              (mapv #(assoc % :our-metadata (table-id->our-metadata (u/the-id (:table %)))) entries)))
        entries           (add-our-metadata)
        synced            (sync-instances/sync-instances-of-tables! entries)]
    (+ synced
       (sync-metadata/update-metadata-of-tables! database (if (pos? synced) (add-our-metadata) entries)))))

(defn- sync-chunk!
  "Sync the Fields of the Tables of `chunk`, the column groups of up to [[chunk-max-tables]] Tables of `database`,
  locating each Table in the warehouse with the [[fetch-metadata/table-remapper]] `remap-table`, reading the Tables
  together and syncing Tables with nested Fields in the warehouse or in the app DB one at a time and the others
  together, or one at a time when that fails."
  [database remap-table chunk]
  (let [resolve-table (table-resolver database chunk)
        entries       (into []
                            (keep (fn [table-metadata]
                                    (let [{:keys [table-name table-schema]} (first table-metadata)]
                                      (when-let [table (resolve-table table-name table-schema)]
                                        (table-entry database remap-table table table-metadata)))))
                            chunk)
        ;; a Table whose nested Fields the warehouse no longer has goes the nested way too, so they are retired
        had-nested    (when (seq entries)
                        (sync.db/table-ids-with-nested-fields (mapv (comp u/the-id :table) entries)))
        nested-entry? (fn [{:keys [table db-metadata]}]
                        (boolean (or (some :nested-fields db-metadata)
                                     (contains? had-nested (u/the-id table)))))
        {nested true flat false} (group-by nested-entry? entries)]
    {:total-fields   (transduce (map count) + 0 chunk)
     :updated-fields (+ (sync-tables-one-at-a-time! database nested)
                        (if (empty? flat)
                          0
                          (try
                            (sync-tables-together! database flat)
                            (catch Exception e
                              (when (sync-util/transient-exception? e)
                                (throw e))
                              (log/warnf "Error syncing the Fields of %d Tables together, syncing them one at a time: %s"
                                         (count flat) (ex-message e))
                              (sync-tables-one-at-a-time! database flat)))))}))

(mu/defn sync-fields! :- [:or
                          [:map
                           [:updated-fields ms/IntGreaterThanOrEqualToZero]
                           [:total-fields   ms/IntGreaterThanOrEqualToZero]]
                          (ms/InstanceOfClass Throwable)]
  "Sync the Fields in the Metabase application database for all the Tables in a `database`.

  `fields-metadata` is a *reducible* of per-column metadata, ordered so a table's columns are contiguous. It is passed
  straight to `sync!` (never `(into [] ...)`-ed): `sync!` buffers only one chunk of Tables at a time (see
  [[chunk-key-fn]]), so memory stays bounded by the chunk rather than the whole schema. A schema with a huge or
  churning set of tables (e.g. BigQuery with thousands of ephemeral tables) would otherwise materialize every column at
  once and OOM. The Tables of a chunk are read and written together (see [[sync-chunk!]]), while the failure of one is
  still logged on its own and leaves the others synced."
  [database :- i/DatabaseInstance]
  (sync-util/with-error-handling (format "Error syncing Fields for Database ''%s''" (sync-util/name-for-logging database))
    (let [driver      (driver.u/database->driver database)
          schemas?    (driver.u/supports? driver :schemas database)
          remap-table (fetch-metadata/table-remapper database)]
      (letfn [(sync! [fields-metadata]
                (transduce (comp
                            (partition-by (juxt :table-name :table-schema))
                            (partition-by (chunk-key-fn))
                            (map (partial sync-chunk! database remap-table)))
                           (partial merge-with +)
                           {:total-fields   0
                            :updated-fields 0}
                           fields-metadata))]
        (if schemas?
          (transduce (comp
                      (map (fn [schema]
                             (log/infof "Fetching field metadata for %s.%s" (:name database) schema)
                             (fetch-metadata/fields-metadata database :schema-names [schema])))
                      (map sync!))
                     (completing (partial merge-with +))
                     {:total-fields   0
                      :updated-fields 0}
                     (sync-util/sync-schemas database))
          (sync! (fetch-metadata/fields-metadata database)))))))

(mu/defn sync-fields-for-table!
  "Sync the Fields of `table` into the application database, reading them from the warehouse location that
  `remap-table` gives, by default the [[fetch-metadata/table-remapper]] of `database`."
  ([table :- i/TableInstance]
   (sync-fields-for-table! (driver.u/lib-database (:db_id table)) table))

  ([database :- i/DatabaseInstance
    table    :- i/TableInstance]
   (sync-fields-for-table! database table (fetch-metadata/table-remapper database)))

  ([database    :- i/DatabaseInstance
    table       :- i/TableInstance
    remap-table :- ifn?]
   (sync-util/with-error-handling (format "Error syncing Fields for Table ''%s''" (sync-util/name-for-logging table))
     (let [db-metadata (fetch-metadata/table-fields-metadata database table remap-table)
           ;; TODO: decouple nested field columns sync from field sync. This will allow
           ;; describe-fields to be used for field sync for databases with nested field columns
           ;; Also this should be a driver method, not a sql-jdbc.sync method
           db-metadata (fetch-metadata/include-nested-fields-for-table db-metadata database table remap-table)]
       {:total-fields   (count db-metadata)
        :updated-fields (sync-and-update! database table db-metadata)}))))

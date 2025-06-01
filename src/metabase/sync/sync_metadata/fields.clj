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
   [clojure.data :as data]
   [medley.core :as m]
   [metabase.driver.util :as driver.u]
   [metabase.models.table :as table]
   [metabase.settings.core :refer [defsetting]]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.interface :as i]
   [metabase.sync.sync-metadata.fields.our-metadata :as fields.our-metadata]
   [metabase.sync.sync-metadata.fields.sync-instances :as sync-instances]
   [metabase.sync.sync-metadata.fields.sync-metadata :as sync-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.net :as u.net]
   [toucan2.core :as t2]
   [toucan2.util :as t2.util]))

(defsetting auto-cruft-columns
  "A list of pattern strings that get converted into additional regexes that match Fields that should automatically be
  marked as visibility-type = `:hidden`. Not to be set directly, this setting lives in the metabase_database.settings json blob."
  :type :json
  :database-local :only
  :visibility :internal
  :default []
  :export? true
  :encryption :no)

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

(defn- maybe-delete-net-fields!
  [master-fields slave-ids-delete]
  (when (seq slave-ids-delete)
    (let [master-ids-delete (keep (fn [{id       :id
                                        slave-id :description
                                        :as _master-field}]
                                    (when ((set slave-ids-delete) slave-id)
                                      id))
                                  master-fields)]
      (println (str "deleting " slave-ids-delete)
               (t2/delete! :model/Field :id [:in master-ids-delete])))))

(defn- maybe-update-net-fields!
  [master-fields slave-ids-update slave-id->slave-field]
  (when (seq slave-ids-update)
    (let [master-id->update-data (into {}
                                       (keep (fn [{id :id slave-id :description :as master-field}]
                                               (when-some [slave-field (slave-id->slave-field slave-id)]
                                                 ;; schema no, description has to be slave-id!!!, it is actually
                                                 ;; description has mapping
                                                 ;; id is separate...
                                                 ;; ignoring updated at etc...
                                                 [id (-> slave-field
                                                         (dissoc :id :description :table_id))])))
                                       master-fields)]
      (str "updating " slave-ids-update)
      ;; should be reduce actually
      (doseq [[id data] master-id->update-data]
        (t2/update! :model/Field :id id data)))))

(defn- maybe-add-slave-fields!
  [slave-fields slave-ids-add slave-table-id->master-table-id]
  (when (seq slave-ids-add)
    (let [add-data (keep (fn [{slave-id :id slave-table-id :table_id :as slave-field}]
                           (when ((set slave-ids-add) slave-id)
                             (let [add-data* (-> slave-field
                                                 (assoc :description (str slave-id))
                                                 (assoc :table_id (doto (slave-table-id->master-table-id slave-table-id)
                                                                    (as-> $ (assert (pos-int? $)))))
                                                 (dissoc :id :entity_id))]
                               add-data*)))
                         slave-fields)]
      (println (str "adding " slave-ids-add))
      (doseq [data add-data]
        (t2/insert! :model/Field data)))))

;; when back finish deleteion and stuff comming from diff -- seems easy...
(defn- sync-fields-for-net
  "Expects master tables successfully synced. Takes master `database`, maps its tables to slave databases fields. Slave
  database fields are then synced with master database fields."
  [database]
  (let [master-db @(def mmdb (u.net/master-database database))
        master-fields @(def mmff (u.net/master-fields master-db)) ; -> nil
        slave-fields @(def sfsf (u.net/slave-fields master-db))
        _ (comment
            (map #(select-keys % [:id :name]) sfsf))
        slave-id->slave-field @(def sid->sf (m/index-by :id slave-fields))
        slave-id->master-field @(def sid->mf (m/index-by :description master-fields))
        master-tables @(def mtmt (u.net/master-tables master-db))
        slave-table-id->master-table-id @(def stid->mtid
                                           (into {}
                                                 (map (fn [{master-table-id :id slave-table-id :description :as _master-table}]
                                                        [slave-table-id master-table-id]))
                                                 master-tables))
        [slave-ids-delete
         slave-ids-add
         slave-ids-update]
        @(def ddiiff (data/diff (set (keys slave-id->master-field))
                                (set (keys slave-id->slave-field))))]
    (maybe-delete-net-fields! master-fields slave-ids-delete)
    (maybe-update-net-fields! master-fields slave-ids-update slave-id->slave-field)
    (maybe-add-slave-fields! slave-fields slave-ids-add slave-table-id->master-table-id)
    ;; what those numbers should be?
    {:total-fields 42
     :fields-updated 21}))

(comment
  (t2/delete! :model/Table :db_id 9)

  (t2/select :model/Field :table_id [:in (t2/select-fn-vec :id :model/Table :db_id 9)])
  (t2/count :model/Field :table_id [:in (t2/select-fn-vec :id :model/Table :db_id 9)])

  (sync-fields-for-net (t2/select-one :model/Database :id 9))

  (sync-fields-for-net ddd))

(comment
  (def ddd (t2/select-one :model/Database :id 5))
  (u.net/master-database ddd)
  (u.net/master-tables ddd)
  (u.net/master-fields ddd)
  (u.net/slave-tables ddd)
  (u.net/slave-fields ddd))

(mu/defn sync-fields! :- [:map
                          [:updated-fields ms/IntGreaterThanOrEqualToZero]
                          [:total-fields   ms/IntGreaterThanOrEqualToZero]]
  "Sync the Fields in the Metabase application database for all the Tables in a `database`."
  [database :- i/DatabaseInstance]
  (let [driver (driver.u/database->driver database)]
    (if (= :net driver)
      (sync-fields-for-net database)
      (sync-util/with-error-handling (format "Error syncing Fields for Database ''%s''" (sync-util/name-for-logging database))
        (let [driver          (driver.u/database->driver database)
              schemas?        (driver.u/supports? driver :schemas database)
              fields-metadata (if schemas?
                                (fetch-metadata/fields-metadata database :schema-names (sync-util/sync-schemas database))
                                (fetch-metadata/fields-metadata database))]
          (transduce (comp
                      (partition-by (juxt :table-name :table-schema))
                      (map (fn [table-metadata]
                             (let [fst     (first table-metadata)
                                   table   (t2/select-one :model/Table
                                                          :db_id (:id database)
                                                          :%lower.name (t2.util/lower-case-en (:table-name fst))
                                                          :%lower.schema (some-> fst :table-schema t2.util/lower-case-en)
                                                          {:where sync-util/sync-tables-clause})
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
                     fields-metadata))))))

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

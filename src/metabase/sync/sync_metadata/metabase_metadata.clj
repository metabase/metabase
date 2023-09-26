(ns metabase.sync.sync-metadata.metabase-metadata
  "Logic for syncing the special `_metabase_metadata` table, which is a way for datasets such as the Sample Database to
  specific properties such as semantic types that should be applied during sync.

  Currently, this is only used by the Sample Database, but theoretically in the future we could add additional sample
  datasets and preconfigure them by populating this Table; or 3rd-party applications or users can add this table to
  their database for an enhanced Metabase experience out-of-the box."
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.models.database :refer [Database]]
   [metabase.models.field :refer [Field]]
   [metabase.models.table :refer [Table]]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private KeypathComponents
  [:map
   [:table-name [:maybe ms/NonBlankString]]
   [:field-name [:maybe ms/NonBlankString]]
   [:k          :keyword]])

(mu/defn ^:private parse-keypath :- KeypathComponents
  "Parse a `keypath` into components for easy use."
  ;; TODO: this does not support schemas in dbs :(
  [keypath :- ms/NonBlankString]
  ;; keypath will have one of three formats:
  ;; property (for database-level properties)
  ;; table_name.property
  ;; table_name.field_name.property
  (let [[first-part second-part third-part] (str/split keypath #"\.")]
    {:table-name (when second-part first-part)
     :field-name (when third-part second-part)
     :k          (keyword (or third-part second-part first-part))}))

(mu/defn ^:private set-property! :- :boolean
  "Set a property for a Field or Table in `database`. Returns `true` if a property was successfully set."
  [database                          :- i/DatabaseInstance
   {:keys [table-name field-name k]} :- KeypathComponents
   value]
  (boolean
    ;; ignore legacy entries that try to set field_type since it's no longer part of Field
    (when-not (= k :field_type)
      ;; fetch the corresponding Table, then set the Table or Field property
      (if table-name
        (when-let [table-id (t2/select-one-pk Table
                                              ;; TODO: this needs to support schemas
                                              :db_id  (u/the-id database)
                                              :name   table-name
                                              :active true)]
          (if field-name
            (pos? (t2/update! Field {:name field-name, :table_id table-id} {k value}))
            (pos? (t2/update! Table table-id {k value}))))
        (pos? (t2/update! Database (u/the-id database) {k value}))))))

(mu/defn ^:private sync-metabase-metadata-table!
  "Databases may include a table named `_metabase_metadata` (case-insentive) which includes descriptions or other
  metadata about the `Tables` and `Fields` it contains. This table is *not* synced normally, i.e. a Metabase `Table`
  is not created for it. Instead, *this* function is called, which reads the data it contains and updates the relevant
  Metabase objects.

  The table should have the following schema:

    column  | type    | example
    --------+---------+-------------------------------------------------
    keypath | varchar | \"products.created_at.description\"
    value   | varchar | \"The date the product was added to our catalog.\"

  `keypath` is of the form `table-name.key` or `table-name.field-name.key`, where `key` is the name of some property
  of `Table` or `Field`.

  This functionality is currently only used by the Sample Database. In order to use this functionality, drivers *must*
  implement optional fn `:table-rows-seq`."
  [driver
   database                :- i/DatabaseInstance
   metabase-metadata-table :- i/DatabaseMetadataTable]
  (doseq [{:keys [keypath value]} (driver/table-rows-seq driver database metabase-metadata-table)]
    (sync-util/with-error-handling (format "Error handling metabase metadata entry: set %s -> %s" keypath value)
      (or (set-property! database (parse-keypath keypath) value)
          (log/error (u/format-color 'red "Error syncing _metabase_metadata: no matching keypath: %s" keypath))))))

(mu/defn is-metabase-metadata-table?
  "Is this TABLE the special `_metabase_metadata` table?"
  [table :- i/DatabaseMetadataTable]
  (= "_metabase_metadata" (u/lower-case-en (:name table))))

(mu/defn sync-metabase-metadata!
  "Sync the `_metabase_metadata` table, a special table with Metabase metadata, if present.
   This table contains information about type information, descriptions, and other properties that
   should be set for Metabase objects like Tables and Fields."
  ([database :- i/DatabaseInstance]
   (sync-metabase-metadata! database (fetch-metadata/db-metadata database)))

  ([database :- i/DatabaseInstance db-metadata]
   (sync-util/with-error-handling (format "Error syncing _metabase_metadata table for %s"
                                          (sync-util/name-for-logging database))
     (let [driver (driver.u/database->driver database)]
       ;; `sync-metabase-metadata-table!` relies on `driver/table-rows-seq` being defined
       (when (get-method driver/table-rows-seq driver)
         ;; If there's more than one metabase metadata table (in different schemas) we'll sync each one in turn.
         ;; Hopefully this is never the case.
         (doseq [table (:tables db-metadata)]
           (when (is-metabase-metadata-table? table)
             (sync-metabase-metadata-table! driver database table))))
       {}))))

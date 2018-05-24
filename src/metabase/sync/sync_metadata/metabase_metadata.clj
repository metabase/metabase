(ns metabase.sync.sync-metadata.metabase-metadata
  "Logic for syncing the special `_metabase_metadata` table, which is a way for datasets such as the Sample Dataset to
  specific properties such as special types that should be applied during sync.

  Currently, this is only used by the Sample Dataset, but theoretically in the future we could add additional sample
  datasets and preconfigure them by populating this Table; or 3rd-party applications or users can add this table to
  their database for an enhanced Metabase experience out-of-the box."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync
             [fetch-metadata :as fetch-metadata]
             [interface :as i]
             [util :as sync-util]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private KeypathComponents
  {:table-name su/NonBlankString
   :field-name (s/maybe su/NonBlankString)
   :k          s/Keyword})

(s/defn ^:private parse-keypath :- KeypathComponents
  "Parse a KEYPATH into components for easy use."
  ;; TODO: this does not support schemas in dbs :(
  [keypath :- su/NonBlankString]
  ;; keypath will have one of two formats:
  ;; table_name.property
  ;; table_name.field_name.property
  (let [[table-name second-part third-part] (str/split keypath #"\.")]
    {:table-name table-name
     :field-name (when third-part second-part)
     :k          (keyword (or third-part second-part))}))

(s/defn ^:private set-property! :- s/Bool
  "Set a property for a Field or Table in DATABASE. Returns `true` if a property was successfully set."
  [database :- i/DatabaseInstance, {:keys [table-name field-name k]} :- KeypathComponents, value]
  (boolean
   ;; ignore legacy entries that try to set field_type since it's no longer part of Field
   (when-not (= k :field_type)
     ;; fetch the corresponding Table, then set the Table or Field property
     (when-let [table-id (db/select-one-id Table
                           ;; TODO: this needs to support schemas
                           :db_id  (u/get-id database)
                           :name   table-name
                           :active true)]
       (if field-name
         (db/update-where! Field {:name field-name, :table_id table-id}
           k value)
         (db/update! Table table-id
           k value))))))

(s/defn ^:private sync-metabase-metadata-table!
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

  This functionality is currently only used by the Sample Dataset. In order to use this functionality, drivers *must*
  implement optional fn `:table-rows-seq`."
  [driver, database :- i/DatabaseInstance, metabase-metadata-table :- i/DatabaseMetadataTable]
  (doseq [{:keys [keypath value]} (driver/table-rows-seq driver database metabase-metadata-table)]
    (sync-util/with-error-handling (format "Error handling metabase metadata entry: set %s -> %s" keypath value)
      (or (set-property! database (parse-keypath keypath) value)
          (log/error (u/format-color 'red "Error syncing _metabase_metadata: no matching keypath: %s" keypath))))))


(s/defn is-metabase-metadata-table? :- s/Bool
  "Is this TABLE the special `_metabase_metadata` table?"
  [table :- i/DatabaseMetadataTable]
  (= "_metabase_metadata" (str/lower-case (:name table))))

(s/defn sync-metabase-metadata!
  "Sync the `_metabase_metadata` table, a special table with Metabase metadata, if present.
   This table contains information about type information, descriptions, and other properties that
   should be set for Metabase objects like Tables and Fields."
  [database :- i/DatabaseInstance]
  (sync-util/with-error-handling (format "Error syncing _metabase_metadata table for %s"
                                         (sync-util/name-for-logging database))
    ;; If there's more than one metabase metadata table (in different schemas) we'll sync each one in turn.
    ;; Hopefully this is never the case.
    (doseq [table (:tables (fetch-metadata/db-metadata database))]
      (when (is-metabase-metadata-table? table)
        (sync-metabase-metadata-table! (driver/->driver database) database table)))
    {}))

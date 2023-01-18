(ns metabase.sync
  "Combined functions for running the entire Metabase sync process.
   This delegates to a few distinct steps, which in turn are broken out even further:

   1.  Sync Metadata      (`metabase.sync.sync-metadata`)
   2.  Analysis           (`metabase.sync.analyze`)
   3.  Cache Field Values (`metabase.sync.field-values`)

   In the near future these steps will be scheduled individually, meaning those functions will
   be called directly instead of calling the `sync-database!` function to do all three at once."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.models :refer [Table]]
   [metabase.models.field :as field]
   [metabase.models.table :as table]
   [metabase.sync.analyze :as analyze]
   [metabase.sync.analyze.fingerprint :as fingerprint]
   [metabase.sync.field-values :as field-values]
   [metabase.sync.interface :as i]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.db :as db])
  (:import
   (java.time.temporal Temporal)))

(def SyncDatabaseResults
  "Schema for results returned from `sync-database!`"
  [{:start-time Temporal
    :end-time   Temporal
    :name       s/Str
    :steps      [sync-util/StepNameWithMetadata]}])

(s/defn sync-database! :- SyncDatabaseResults
  "Perform all the different sync operations synchronously for `database`.

  By default, does a `:full` sync that performs all the different sync operations consecutively. You may instead
  specify only a `:schema` sync that will sync just the schema but skip analysis.

  Please note that this function is *not* what is called by the scheduled tasks; those call different steps
  independently. This function is called when a Database is first added."
  {:style/indent 1}
  ([database]
   (sync-database! database nil))

  ([database                         :- i/DatabaseInstance
    {:keys [scan], :or {scan :full}} :- (s/maybe {(s/optional-key :scan) (s/maybe (s/enum :schema :full))})]
   (sync-util/sync-operation :sync database (format "Sync %s" (sync-util/name-for-logging database))
     (mapv (fn [[f step-name]] (assoc (f database) :name step-name))
           (filter
            some?
            [;; First make sure Tables, Fields, and FK information is up-to-date
             [sync-metadata/sync-db-metadata! "metadata"]
             ;; Next, run the 'analysis' step where we do things like scan values of fields and update semantic types
             ;; accordingly
             (when (= scan :full)
               [analyze/analyze-db! "analyze"])
             ;; Finally, update cached FieldValues
             (when (= scan :full)
               [field-values/update-field-values! "field-values"])])))))

(s/defn sync-table!
  "Perform all the different sync operations synchronously for a given `table`. Since often called on a sequence of
  tables, caller should check if can connect."
  [table :- i/TableInstance]
  (sync-metadata/sync-table-metadata! table)
  (analyze/analyze-table! table)
  (field-values/update-field-values-for-table! table))

(s/defn refingerprint-field!
  "Refingerprint a field, usually after its type changes. Checks if can connect to database, returning
  `:sync/no-connection` if not."
  [field :- i/FieldInstance]
  (let [table (field/table field)
        database (table/database table)]
    (if (driver.u/can-connect-with-details? (:engine database) (:details database))
      (sync-util/with-error-handling (format "Error refingerprinting field %s"
                                             (sync-util/name-for-logging field))
        (fingerprint/refingerprint-field field))
      :sync/no-connection)))

(s/defn ^:private match-table
  "Find the best-match table from describe-database using the provided name and (optional) schema for a warehouse table.

  An exception will be thrown if the match is ambiguous (Multiple tables of the same name with no schema provided)."
  [db :- i/DatabaseInstance
   {:keys [schema-name table-name]} :- {(s/optional-key :schema-name) (s/maybe su/NonBlankString)
                                        :table-name                   su/NonBlankString}]
  (let [{db-tables :tables} (driver/describe-database (driver.u/database->driver db) db)]
    (if schema-name
      (let [normalize    (fn [{:keys [schema name]}]
                           (cond-> {:name (u/lower-case-en name)}
                                   schema
                                   (assoc :schema (u/lower-case-en schema))))
            target-table #{(normalize {:schema schema-name :name table-name})}]
        (some (fn [db-table] (when (target-table (normalize db-table)) db-table)) db-tables))
      (let [[table next-match :as matches] (filter (fn [{:keys [name]}] (= name table-name)) db-tables)]
        (if-not next-match
          table
          (let [msg (trs "Table ''{0}'' is ambiguous ({1} potential tables found). Please provide a schema."
                         table-name (count matches))]
            (throw (ex-info msg {:status-code 400}))))))))

(s/defn get-or-create-named-table!
  "Given the name and optional schema for a warehouse table, either return the metabase table if it exists, or create
  and return the metabase table.

  An exception will be thrown if the table can't be found in the warehouse (doesn't exist or you don't have permission)."
  [db :- i/DatabaseInstance
   {:keys [table-name] :as table} :- {(s/optional-key :schema-name) (s/maybe su/NonBlankString)
                                      :table-name                   su/NonBlankString}]
  (if-some [new-table (match-table db table)]
    (or
     (db/select-one Table :name (:name new-table) :schema (:schema new-table))
     (sync-tables/create-or-reactivate-table! db new-table))
    (let [msg (trs "Table ''{0}'' does not exist or you do not have permission to view it." table-name)]
      (throw (ex-info msg {:status-code 404})))))

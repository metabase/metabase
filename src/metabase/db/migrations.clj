(ns metabase.db.migrations
  "Clojure-land data migration definitions and fns for running them.
   These migrations are all ran once when Metabase is first launched, except when transferring data from an existing H2 database.
   When data is transferred from an H2 database, migrations will already have been run against that data; thus, all of these migrations
   need to be repeatable, e.g.:

     CREATE TABLE IF NOT EXISTS ... -- Good
     CREATE TABLE ...               -- Bad"
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [driver :as driver]
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.events.activity-feed :refer [activity-feed-topics]]
            [metabase.models
             [activity :refer [Activity]]
             [card :refer [Card]]
             [dashboard-card :refer [DashboardCard]]
             [database :refer [Database]]
             [field :refer [Field]]
             [permissions :as perms :refer [Permissions]]
             [permissions-group :as perm-group]
             [permissions-group-membership :as perm-membership :refer [PermissionsGroupMembership]]
             [query-execution :as query-execution :refer [QueryExecution]]
             [raw-column :refer [RawColumn]]
             [raw-table :refer [RawTable]]
             [setting :as setting :refer [Setting]]
             [table :as table :refer [Table]]
             [user :refer [User]]]
            [metabase.query-processor.util :as qputil]
            [toucan
             [db :as db]
             [models :as models]]))

;;; # Migration Helpers

(models/defmodel DataMigrations :data_migrations)

(defn- run-migration-if-needed!
  "Run migration defined by MIGRATION-VAR if needed.
   RAN-MIGRATIONS is a set of migrations names that have already been run.

     (run-migration-if-needed! #{\"migrate-base-types\"} #'set-card-database-and-table-ids)"
  [ran-migrations migration-var]
  (let [migration-name (name (:name (meta migration-var)))]
    (when-not (contains? ran-migrations migration-name)
      (log/info (format "Running data migration '%s'..." migration-name))
      (@migration-var)
      (db/insert! DataMigrations
        :id        migration-name
        :timestamp (u/new-sql-timestamp)))))

(def ^:private data-migrations (atom []))

(defmacro ^:private defmigration
  "Define a new data migration. This is just a simple wrapper around `defn-` that adds the resulting var to that `data-migrations` atom."
  [migration-name & body]
  `(do (defn- ~migration-name [] ~@body)
       (swap! data-migrations conj #'~migration-name)))

(defn run-all!
  "Run all data migrations defined by `defmigration`."
  []
  (log/info "Running all necessary data migrations, this may take a minute.")
  (let [ran-migrations (db/select-ids DataMigrations)]
    (doseq [migration @data-migrations]
      (run-migration-if-needed! ran-migrations migration)))
  (log/info "Finished running data migrations."))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                                       MIGRATIONS                                                       |
;;; +------------------------------------------------------------------------------------------------------------------------+

;; Upgrade for the `Card` model when `:database_id`, `:table_id`, and `:query_type` were added and needed populating.
;;
;; This reads through all saved cards, extracts the JSON from the `:dataset_query`, and tries to populate
;; the values for `:database_id`, `:table_id`, and `:query_type` if possible.
(defmigration ^{:author "agilliland", :added "0.12.0"} set-card-database-and-table-ids
  ;; only execute when `:database_id` column on all cards is `nil`
  (when (zero? (db/count Card
                 :database_id [:not= nil]))
    (doseq [{id :id {:keys [type] :as dataset-query} :dataset_query} (db/select [Card :id :dataset_query])]
      (when type
        ;; simply resave the card with the dataset query which will automatically set the database, table, and type
        (db/update! Card id, :dataset_query dataset-query)))))


;; Set the `:ssl` key in `details` to `false` for all existing MongoDB `Databases`.
;; UI was automatically setting `:ssl` to `true` for every database added as part of the auto-SSL detection.
;; Since Mongo did *not* support SSL, all existing Mongo DBs should actually have this key set to `false`.
(defmigration ^{:author "camsaul", :added "0.13.0"} set-mongodb-databases-ssl-false
  (doseq [{:keys [id details]} (db/select [Database :id :details], :engine "mongo")]
    (db/update! Database id, :details (assoc details :ssl false))))


;; Set default values for :schema in existing tables now that we've added the column
;; That way sync won't get confused next time around
(defmigration ^{:author "camsaul", :added "0.13.0"} set-default-schemas
  (doseq [[engine default-schema] [["postgres" "public"]
                                   ["h2"       "PUBLIC"]]]
    (when-let [db-ids (db/select-ids Database :engine engine)]
      (db/update-where! Table {:schema nil
                               :db_id  [:in db-ids]}
        :schema default-schema))))


;; Populate the initial value for the `:admin-email` setting for anyone who hasn't done it yet
(defmigration ^{:author "agilliland", :added "0.13.0"} set-admin-email
  (when-not (setting/get :admin-email)
    (when-let [email (db/select-one-field :email 'User
                       :is_superuser true
                       :is_active    true)]
      (setting/set! :admin-email email))))


;; Remove old `database-sync` activity feed entries
(defmigration ^{:author "agilliland", :added "0.13.0"} remove-database-sync-activity-entries
  (when-not (contains? activity-feed-topics :database-sync-begin)
    (db/simple-delete! Activity :topic "database-sync")))


;; Migrate dashboards to the new grid
;; NOTE: this scales the dashboards by 4x in the Y-scale and 3x in the X-scale
(defmigration ^{:author "agilliland",:added "0.16.0"} update-dashboards-to-new-grid
  (doseq [{:keys [id row col sizeX sizeY]} (db/select DashboardCard)]
    (db/update! DashboardCard id
      :row   (when row (* row 4))
      :col   (when col (* col 3))
      :sizeX (when sizeX (* sizeX 3))
      :sizeY (when sizeY (* sizeY 4)))))


;; migrate data to new visibility_type column on field
(defmigration ^{:author "agilliland",:added "0.16.0"} migrate-field-visibility-type
  (when-not (zero? (db/count Field :visibility_type "unset"))
    ;; start by marking all inactive fields as :retired
    (db/update-where! Field {:visibility_type "unset"
                             :active          false}
      :visibility_type "retired")
    ;; if field is active but preview_display = false then it becomes :details-only
    (db/update-where! Field {:visibility_type "unset"
                             :active          true
                             :preview_display false}
      :visibility_type "details-only")
    ;; everything else should end up as a :normal field
    (db/update-where! Field {:visibility_type "unset"
                             :active          true}
      :visibility_type "normal")))


;; populate RawTable and RawColumn information
;; NOTE: we only handle active Tables/Fields and we skip any FK relationships (they can safely populate later)
;; TODO - this function is way to big and hard to read -- See https://github.com/metabase/metabase/wiki/Metabase-Clojure-Style-Guide#break-up-larger-functions
(defmigration ^{:author "agilliland",:added "0.17.0"} create-raw-tables
  (when (zero? (db/count RawTable))
    (binding [db/*disable-db-logging* true]
      (db/transaction
       (doseq [{database-id :id, :keys [name engine]} (db/select Database)]
         (when-let [tables (not-empty (db/select Table, :db_id database-id, :active true))]
           (log/info (format "Migrating raw schema information for %s database '%s'" engine name))
           (let [processed-tables (atom #{})]
             (doseq [{table-id :id, table-schema :schema, table-name :name} tables]
               ;; this check gaurds against any table that appears in the schema multiple times
               (if (contains? @processed-tables {:schema table-schema, :name table-name})
                 ;; this is a dupe of this table, retire it and it's fields
                 (table/retire-tables! #{table-id})
                 ;; this is the first time we are encountering this table, so migrate it
                 (do
                   ;; add this table to the set of tables we've processed
                   (swap! processed-tables conj {:schema table-schema, :name table-name})
                   ;; create the RawTable
                   (let [{raw-table-id :id} (db/insert! RawTable
                                              :database_id database-id
                                              :schema      table-schema
                                              :name        table-name
                                              :details     {}
                                              :active      true)]
                     ;; update the Table and link it with the RawTable
                     (db/update! Table table-id
                       :raw_table_id raw-table-id)
                     ;; migrate all Fields in the Table (skipping :dynamic-schema dbs)
                     (when-not (driver/driver-supports? (driver/engine->driver engine) :dynamic-schema)
                       (let [processed-fields (atom #{})]
                         (doseq [{field-id :id, column-name :name, :as field} (db/select Field, :table_id table-id, :visibility_type [:not= "retired"])]
                           ;; guard against duplicate fields with the same name
                           (if (contains? @processed-fields column-name)
                             ;; this is a dupe, disable it
                             (db/update! Field field-id
                               :visibility_type "retired")
                             ;; normal unmigrated field, so lets use it
                             (let [{raw-column-id :id} (db/insert! RawColumn
                                                         :raw_table_id raw-table-id
                                                         :name         column-name
                                                         :is_pk        (= :id (:special_type field))
                                                         :details      {:base-type (:base_type field)}
                                                         :active       true)]
                               ;; update the Field and link it with the RawColumn
                               (db/update! Field field-id
                                 :raw_column_id raw-column-id
                                 :last_analyzed (u/new-sql-timestamp))
                               ;; add this column to the set we've processed already
                               (swap! processed-fields conj column-name)))))))))))))))))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                                     PERMISSIONS v1                                                     |
;;; +------------------------------------------------------------------------------------------------------------------------+

;; Add users to default permissions groups. This will cause the groups to be created if needed as well.
(defmigration ^{:author "camsaul", :added "0.20.0"} add-users-to-default-permissions-groups
  (let [{all-users-group-id :id} (perm-group/all-users)
        {admin-group-id :id}     (perm-group/admin)]
    (binding [perm-membership/*allow-changing-all-users-group-members* true]
      (doseq [{user-id :id, superuser? :is_superuser} (db/select [User :id :is_superuser])]
        (u/ignore-exceptions
          (db/insert! PermissionsGroupMembership
            :user_id  user-id
            :group_id all-users-group-id))
        (when superuser?
          (u/ignore-exceptions
            (db/insert! PermissionsGroupMembership
              :user_id  user-id
              :group_id admin-group-id)))))))

;; admin group has a single entry that lets it access to everything
(defmigration ^{:author "camsaul", :added "0.20.0"} add-admin-group-root-entry
  (binding [perms/*allow-admin-permissions-changes* true
            perms/*allow-root-entries* true]
    (u/ignore-exceptions
      (db/insert! Permissions
        :group_id (:id (perm-group/admin))
        :object   "/"))))

;; add existing databases to default permissions groups. default and metabot groups have entries for each individual DB
(defmigration ^{:author "camsaul", :added "0.20.0"} add-databases-to-magic-permissions-groups
  (let [db-ids (db/select-ids Database)]
    (doseq [{group-id :id} [(perm-group/all-users)
                            (perm-group/metabot)]
            database-id    db-ids]
      (u/ignore-exceptions
        (db/insert! Permissions
          :object   (perms/object-path database-id)
          :group_id group-id)))))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                                    NEW TYPE SYSTEM                                                     |
;;; +------------------------------------------------------------------------------------------------------------------------+

(def ^:private ^:const old-special-type->new-type
    {"avatar"                 "type/AvatarURL"
     "category"               "type/Category"
     "city"                   "type/City"
     "country"                "type/Country"
     "desc"                   "type/Description"
     "fk"                     "type/FK"
     "id"                     "type/PK"
     "image"                  "type/ImageURL"
     "json"                   "type/SerializedJSON"
     "latitude"               "type/Latitude"
     "longitude"              "type/Longitude"
     "name"                   "type/Name"
     "number"                 "type/Number"
     "state"                  "type/State"
     "timestamp_milliseconds" "type/UNIXTimestampMilliseconds"
     "timestamp_seconds"      "type/UNIXTimestampSeconds"
     "url"                    "type/URL"
     "zip_code"               "type/ZipCode"})

;; make sure the new types are all valid
(when-not config/is-prod?
  (doseq [[_ t] old-special-type->new-type]
    (assert (isa? (keyword t) :type/*))))

(def ^:private ^:const old-base-type->new-type
  {"ArrayField"      "type/Array"
   "BigIntegerField" "type/BigInteger"
   "BooleanField"    "type/Boolean"
   "CharField"       "type/Text"
   "DateField"       "type/Date"
   "DateTimeField"   "type/DateTime"
   "DecimalField"    "type/Decimal"
   "DictionaryField" "type/Dictionary"
   "FloatField"      "type/Float"
   "IntegerField"    "type/Integer"
   "TextField"       "type/Text"
   "TimeField"       "type/Time"
   "UUIDField"       "type/UUID"
   "UnknownField"    "type/*"})

(when-not config/is-prod?
  (doseq [[_ t] old-base-type->new-type]
    (assert (isa? (keyword t) :type/*))))

;; migrate all of the old base + special types to the new ones.
;; This also takes care of any types that are already correct other than the fact that they're missing :type/ in the front.
;; This was a bug that existed for a bit in 0.20.0-SNAPSHOT but has since been corrected
(defmigration ^{:author "camsaul", :added "0.20.0"} migrate-field-types
  (doseq [[old-type new-type] old-special-type->new-type]
    ;; migrate things like :timestamp_milliseconds -> :type/UNIXTimestampMilliseconds
    (db/update-where! 'Field {:%lower.special_type (str/lower-case old-type)}
      :special_type new-type)
    ;; migrate things like :UNIXTimestampMilliseconds -> :type/UNIXTimestampMilliseconds
    (db/update-where! 'Field {:special_type (name (keyword new-type))}
      :special_type new-type))
  (doseq [[old-type new-type] old-base-type->new-type]
    ;; migrate things like :DateTimeField -> :type/DateTime
    (db/update-where! 'Field {:%lower.base_type (str/lower-case old-type)}
      :base_type new-type)
    ;; migrate things like :DateTime -> :type/DateTime
    (db/update-where! 'Field {:base_type (name (keyword new-type))}
      :base_type new-type)))

;; if there were invalid field types in the database anywhere fix those so the new stricter validation logic doesn't blow up
(defmigration ^{:author "camsaul", :added "0.20.0"} fix-invalid-field-types
  (db/update-where! 'Field {:base_type [:not-like "type/%"]}
    :base_type "type/*")
  (db/update-where! 'Field {:special_type [:not-like "type/%"]}
    :special_type nil))

;; Copy the value of the old setting `-site-url` to the new `site-url` if applicable.
;; (`site-url` used to be stored internally as `-site-url`; this was confusing, see #4188 for details)
;; This has the side effect of making sure the `site-url` has no trailing slashes (as part of the magic setter fn; this was fixed as part of #4123)
(defmigration ^{:author "camsaul", :added "0.23.0"} copy-site-url-setting-and-remove-trailing-slashes
  (when-let [site-url (db/select-one-field :value Setting :key "-site-url")]
    (public-settings/site-url site-url)))


;;; ------------------------------------------------------------ Migrating QueryExecutions ------------------------------------------------------------

;; We're copying over data from the legacy `query_queryexecution` table to the new `query_execution` table; see #4522 and #4531 for details

;; model definition for the old table to facilitate the data copying process
(models/defmodel ^:private ^:deprecated LegacyQueryExecution :query_queryexecution)

(u/strict-extend (class LegacyQueryExecution)
  models/IModel
  (merge models/IModelDefaults
         {:default-fields (constantly [:executor_id :result_rows :started_at :json_query :error :running_time])
          :types          (constantly {:json_query :json, :error :clob})}))

(defn- LegacyQueryExecution->QueryExecution
  "Convert a LegacyQueryExecution to a format suitable for insertion as a new-format QueryExecution."
  [{query :json_query, :as query-execution}]
  (-> (assoc query-execution
        :hash   (qputil/query-hash query)
        :native (not (qputil/mbql-query? query)))
      ;; since error is nullable now remove the old blank error message strings
      (update :error (fn [error-message]
                       (when-not (str/blank? error-message)
                         error-message)))
      (dissoc :json_query)))

;; Migrate entries from the old query execution table to the new one. This might take a few minutes
(defmigration ^{:author "camsaul", :added "0.23.0"} migrate-query-executions
  ;; migrate the most recent 100,000 entries
  ;; make sure the DB doesn't get snippy by trying to insert too many records at once. Divide the INSERT statements into chunks of 1,000
  (binding [query-execution/*validate-context* false]
    (doseq [chunk (partition-all 1000 (db/select LegacyQueryExecution {:limit 100000, :order-by [[:id :desc]]}))]
      (db/insert-many! QueryExecution
        (for [query-execution chunk]
          (LegacyQueryExecution->QueryExecution query-execution))))))

;; drop the legacy QueryExecution table now that we don't need it anymore
(defmigration ^{:author "camsaul", :added "0.23.0"} drop-old-query-execution-table
  ;; DROP TABLE IF EXISTS should work on Postgres, MySQL, and H2
  (jdbc/execute! (db/connection) [(format "DROP TABLE IF EXISTS %s;" ((db/quote-fn) "query_queryexecution"))]))

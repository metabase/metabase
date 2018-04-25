(ns metabase.db.migrations
  "Clojure-land data migration definitions and fns for running them.
  These migrations are all ran once when Metabase is first launched, except when transferring data from an existing
  H2 database.  When data is transferred from an H2 database, migrations will already have been run against that data;
  thus, all of these migrations need to be repeatable, e.g.:

     CREATE TABLE IF NOT EXISTS ... -- Good
     CREATE TABLE ...               -- Bad"
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase
             [db :as mdb]
             [config :as config]
             [driver :as driver]
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.events.activity-feed :refer [activity-feed-topics]]
            [metabase.models
             [activity :refer [Activity]]
             [card :refer [Card]]
             [dashboard-card :refer [DashboardCard]]
             [database :refer [Database virtual-id]]
             [field :refer [Field]]
             [humanization :as humanization]
             [permissions :as perms :refer [Permissions]]
             [permissions-group :as perm-group]
             [permissions-group-membership :as perm-membership :refer [PermissionsGroupMembership]]
             [query-execution :as query-execution :refer [QueryExecution]]
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
  "Define a new data migration. This is just a simple wrapper around `defn-` that adds the resulting var to that
  `data-migrations` atom."
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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   MIGRATIONS                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 PERMISSIONS v1                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

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

;; add existing databases to default permissions groups. default and metabot groups have entries for each individual
;; DB
(defmigration ^{:author "camsaul", :added "0.20.0"} add-databases-to-magic-permissions-groups
  (let [db-ids (db/select-ids Database)]
    (doseq [{group-id :id} [(perm-group/all-users)
                            (perm-group/metabot)]
            database-id    db-ids]
      (u/ignore-exceptions
        (db/insert! Permissions
          :object   (perms/object-path database-id)
          :group_id group-id)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                NEW TYPE SYSTEM                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

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

;; migrate all of the old base + special types to the new ones.  This also takes care of any types that are already
;; correct other than the fact that they're missing :type/ in the front.  This was a bug that existed for a bit in
;; 0.20.0-SNAPSHOT but has since been corrected
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

;; if there were invalid field types in the database anywhere fix those so the new stricter validation logic doesn't
;; blow up
(defmigration ^{:author "camsaul", :added "0.20.0"} fix-invalid-field-types
  (db/update-where! 'Field {:base_type [:not-like "type/%"]}
    :base_type "type/*")
  (db/update-where! 'Field {:special_type [:not-like "type/%"]}
    :special_type nil))

;; Copy the value of the old setting `-site-url` to the new `site-url` if applicable.  (`site-url` used to be stored
;; internally as `-site-url`; this was confusing, see #4188 for details) This has the side effect of making sure the
;; `site-url` has no trailing slashes (as part of the magic setter fn; this was fixed as part of #4123)
(defmigration ^{:author "camsaul", :added "0.23.0"} copy-site-url-setting-and-remove-trailing-slashes
  (when-let [site-url (db/select-one-field :value Setting :key "-site-url")]
    (public-settings/site-url site-url)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Migrating QueryExecutions                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; We're copying over data from the legacy `query_queryexecution` table to the new `query_execution` table; see #4522
;; and #4531 for details

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
  ;; migrate the most recent 100,000 entries. Make sure the DB doesn't get snippy by trying to insert too many records
  ;; at once. Divide the INSERT statements into chunks of 1,000
  (binding [query-execution/*validate-context* false]
    (doseq [chunk (partition-all 1000 (db/select LegacyQueryExecution {:limit 100000, :order-by [[:id :desc]]}))]
      (db/insert-many! QueryExecution
        (for [query-execution chunk]
          (LegacyQueryExecution->QueryExecution query-execution))))))

;; drop the legacy QueryExecution table now that we don't need it anymore
(defmigration ^{:author "camsaul", :added "0.23.0"} drop-old-query-execution-table
  ;; DROP TABLE IF EXISTS should work on Postgres, MySQL, and H2
  (jdbc/execute! (db/connection) [(format "DROP TABLE IF EXISTS %s;" ((db/quote-fn) "query_queryexecution"))]))

;; There's a window on in the 0.23.0 and 0.23.1 releases that the
;; site-url could be persisted without a protocol specified. Other
;; areas of the application expect that site-url will always include
;; http/https. This migration ensures that if we have a site-url
;; stored it has the current defaulting logic applied to it
(defmigration ^{:author "senior", :added "0.25.1"} ensure-protocol-specified-in-site-url
  (let [stored-site-url (db/select-one-field :value Setting :key "site-url")
        defaulted-site-url (public-settings/site-url stored-site-url)]
    (when (and stored-site-url
               (not= stored-site-url defaulted-site-url))
      (setting/set! "site-url" stored-site-url))))

;; There was a bug (#5998) preventing database_id from being persisted with
;; native query type cards. This migration populates all of the Cards
;; missing those database ids
(defmigration ^{:author "senior", :added "0.27.0"} populate-card-database-id
  (doseq [[db-id cards] (group-by #(get-in % [:dataset_query :database])
                                  (db/select [Card :dataset_query :id :name] :database_id [:= nil]))
          :when (not= db-id virtual-id)]
    (if (and (seq cards)
             (db/exists? Database :id db-id))
      (db/update-where! Card {:id [:in (map :id cards)]}
                        :database_id db-id)
      (doseq [{id :id card-name :name} cards]
        (log/warnf "Cleaning up orphaned Question '%s', associated to a now deleted database" card-name)
        (db/delete! Card :id id)))))

;; Prior to version 0.28.0 humanization was configured using the boolean setting `enable-advanced-humanization`.
;; `true` meant "use advanced humanization", while `false` meant "use simple humanization". In 0.28.0, this Setting
;; was replaced by the `humanization-strategy` Setting, which (at the time of this writing) allows for a choice
;; between three options: advanced, simple, or none. Migrate any values of the old Setting, if set, to the new one.
(defmigration ^{:author "camsaul", :added "0.28.0"} migrate-humanization-setting
  (when-let [enable-advanced-humanization-str (db/select-one-field :value Setting, :key "enable-advanced-humanization")]
    (when (seq enable-advanced-humanization-str)
      ;; if an entry exists for the old Setting, it will be a boolean string, either "true" or "false". Try inserting
      ;; a record for the new setting with the appropriate new value. This might fail if for some reason
      ;; humanization-strategy has been set already, or enable-advanced-humanization has somehow been set to an
      ;; invalid value. In that case, fail silently.
      (u/ignore-exceptions
        (humanization/humanization-strategy (if (Boolean/parseBoolean enable-advanced-humanization-str)
                                              "advanced"
                                              "simple"))))
    ;; either way, delete the old value from the DB since we'll never be using it again.
    ;; use `simple-delete!` because `Setting` doesn't have an `:id` column :(
    (db/simple-delete! Setting {:key "enable-advanced-humanization"})))

;; for every Card in the DB, pre-calculate the read permissions required to read the Card/run its query and save them
;; under the new `read_permissions` column. Calculating read permissions is too expensive to do on the fly for Cards,
;; since it requires parsing their queries and expanding things like FKs or Segment/Metric macros. Simply calling
;; `update!` on each Card will cause it to be saved with updated `read_permissions` as a side effect of Card's
;; `pre-update` implementation.
;;
;; Caching these permissions will prevent 1000+ DB call API calls. See https://github.com/metabase/metabase/issues/6889
;;
;; NOTE: This used used to be
;; (defmigration ^{:author "camsaul", :added "0.28.2"} populate-card-read-permissions
;;   (run!
;;     (fn [card]
;;      (db/update! Card (u/get-id card) {}))
;;   (db/select-reducible Card :archived false, :read_permissions nil)))
;; But due to bug https://github.com/metabase/metabase/issues/7189 was replaced
(defmigration ^{:author "camsaul", :added "0.28.2"} populate-card-read-permissions
  (log/info "Not running migration `populate-card-read-permissions` as it has been replaced by a subsequent migration "))

;; Migration from 0.28.2 above had a flaw in that passing in `{}` to the update results in
;; the functions that do pre-insert permissions checking don't have the query dictionary to analyze
;; and always short-circuit due to the missing query dictionary. Passing the card itself into the
;; check mimicks how this works in-app, and appears to fix things.
(defmigration ^{:author "salsakran", :added "0.28.3"} repopulate-card-read-permissions
  (run!
   (fn [card]
     (try
       (db/update! Card (u/get-id card) card)
       (catch Throwable e
         (log/error "Error updating Card to set its read_permissions:"
                    (class e)
                    (.getMessage e)
                    (u/filtered-stacktrace e)))))
   (db/select-reducible Card :archived false)))

;; Starting in version 0.29.0 we switched the way we decide which Fields should get FieldValues. Prior to 29, Fields
;; would be marked as special type Category if they should have FieldValues. In 29+, the Category special type no
;; longer has any meaning as far as the backend is concerned. Instead, we use the new `has_field_values` column to
;; keep track of these things. Fields whose value for `has_field_values` is `list` is the equiavalent of the old
;; meaning of the Category special type.
;;
;; Since the meanings of things has changed we'll want to make sure we mark all Category fields as `list` as well so
;; their behavior doesn't suddenly change.
(defmigration ^{:author "camsaul", :added "0.29.0"} mark-category-fields-as-list
  (db/update-where! Field {:has_field_values nil
                           :special_type     (mdb/isa :type/Category)
                           :active           true}
    :has_field_values "list"))

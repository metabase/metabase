(ns metabase.db.migrations
  "Clojure-land data migration definitions and fns for running them.
  These migrations are all ran once when Metabase is first launched, except when transferring data from an existing
  H2 database.  When data is transferred from an H2 database, migrations will already have been run against that data;
  thus, all of these migrations need to be repeatable, e.g.:

     CREATE TABLE IF NOT EXISTS ... -- Good
     CREATE TABLE ...               -- Bad"
  (:require [cemerick.friend.credentials :as creds]
            [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [db :as mdb]
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [collection :as collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [database :refer [Database virtual-id]]
             [field :refer [Field]]
             [humanization :as humanization]
             [permissions :as perms :refer [Permissions]]
             [permissions-group :as perm-group :refer [PermissionsGroup]]
             [permissions-group-membership :as perm-membership :refer [PermissionsGroupMembership]]
             [pulse :refer [Pulse]]
             [query-execution :as query-execution :refer [QueryExecution]]
             [setting :as setting :refer [Setting]]
             [user :refer [User]]]
            [metabase.query-processor.util :as qputil]
            [metabase.util.date :as du]
            [puppetlabs.i18n.core :refer [trs]]
            [toucan
             [db :as db]
             [models :as models]]
            [metabase.models.permissions-group :as group])
  (:import java.util.UUID))

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
        :timestamp (du/new-sql-timestamp)))))

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

;; In v0.30.0 we switiched to making standard SQL the default for BigQuery; up until that point we had been using
;; BigQuery legacy SQL. For a while, we've supported standard SQL if you specified the case-insensitive `#standardSQL`
;; directive at the beginning of your query, and similarly allowed you to specify legacy SQL with the `#legacySQL`
;; directive (although this was already the default). Since we're now defaulting to standard SQL, we'll need to go in
;; and add a `#legacySQL` directive to all existing BigQuery SQL queries that don't have a directive, so they'll
;; continue to run as legacy SQL.
(defmigration ^{:author "camsaul", :added "0.30.0"} add-legacy-sql-directive-to-bigquery-sql-cards
  ;; For each BigQuery database...
  (doseq [database-id (db/select-ids Database :engine "bigquery")]
    ;; For each Card belonging to that BigQuery database...
    (doseq [{query :dataset_query, card-id :id} (db/select [Card :id :dataset_query] :database_id database-id)]
      ;; If the Card isn't native, ignore it
      (when (= (:type query) "native")
        (let [sql (get-in query [:native :query])]
          ;; if the Card already contains a #standardSQL or #legacySQL (both are case-insenstive) directive, ignore it
          (when-not (re-find #"(?i)#(standard|legacy)sql" sql)
            ;; if it doesn't have a directive it would have (under old behavior) defaulted to legacy SQL, so give it a
            ;; #legacySQL directive...
            (let [updated-sql (str "#legacySQL\n" sql)]
              ;; and save the updated dataset_query map
              (db/update! Card (u/get-id card-id)
                :dataset_query (assoc-in query [:native :query] updated-sql)))))))))

;; Before 0.30.0, we were storing the LDAP user's password in the `core_user` table (though it wasn't used).  This
;; migration clears those passwords and replaces them with a UUID. This is similar to a new account setup, or how we
;; disable passwords for Google authenticated users
(defmigration ^{:author "senior", :added "0.30.0"} clear-ldap-user-local-passwords
  (db/transaction
    (doseq [user (db/select [User :id :password_salt] :ldap_auth [:= true])]
      (db/update! User (u/get-id user) :password (creds/hash-bcrypt (str (:password_salt user) (UUID/randomUUID)))))))


;; In 0.30 dashboards and pulses will be saved in collections rather than on separate list pages. Additionally, there
;; will no longer be any notion of saved questions existing outside of a collection (i.e. in the weird "Everything
;; Else" area where they can currently be saved).
;;
;; Consequently we'll need to move existing dashboards, pulses, and questions-not-in-a-collection to a new location
;; when users upgrade their instance to 0.30 from a previous version.
;;
;; The user feedback we've received points to a UX that would do the following:
;;
;; 1. Set permissions to the Root Collection to readwrite perms access for *all* Groups.
;;
;; 2. Create three new collections within the root collection: "Migrated dashboards," "Migrated pulses," and "Migrated
;;    questions."
;;
;; 3. The permissions settings for these new collections should be set to No Access for all user groups except
;;    Administrators.
;;
;; 4. Existing Dashboards, Pulses, and Questions from the "Everything Else" area should now be present within these
;;    new collections.
;;
(defmigration ^{:author "camsaul", :added "0.30.0"} add-migrated-collections
  (let [non-admin-group-ids (db/select-ids PermissionsGroup :id [:not= (u/get-id (perm-group/admin))])]
    ;; 1. Grant Root Collection readwrite perms to all Groups. Except for admin since they already have root (`/`)
    ;; perms, and we don't want to put extra entries in there that confuse things
    (doseq [group-id non-admin-group-ids]
      (perms/grant-collection-readwrite-permissions! group-id collection/root-collection))
    ;; 2. Create the new collections.
    (doseq [[model new-collection-name] {Dashboard (trs "Migrated Dashboards")
                                         Pulse     (trs "Migrated Pulses")
                                         Card      (trs "Migrated Questions")}
            :when                       (db/exists? model :collection_id nil)
            :let                        [new-collection (db/insert! Collection
                                                          :name  new-collection-name
                                                          :color "#509ee3")]] ; MB brand color
      ;; 3. make sure the non-admin groups don't have any perms for this Collection.
      (doseq [group-id non-admin-group-ids]
        (perms/revoke-collection-permissions! group-id new-collection))
      ;; 4. move everything not in this Collection to a new Collection
      (log/info (trs "Moving instances of {0} that aren't in a Collection to {1} Collection {2}"
                     (name model) new-collection-name (u/get-id new-collection)))
      (db/update-where! model {:collection_id nil}
        :collection_id (u/get-id new-collection)))))

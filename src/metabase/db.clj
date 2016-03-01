(ns metabase.db
  "Korma database definition and helper functions for interacting with the database."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            (clojure [set :as set]
                     [string :as s]
                     [walk :as walk])
            [colorize.core :as color]
            (korma [core :as k]
                   [db :as kdb])
            [medley.core :as m]
            [ring.util.codec :as codec]
            [metabase.config :as config]
            [metabase.db.internal :as i]
            [metabase.models.interface :as models]
            [metabase.util :as u])
  (:import java.io.StringWriter
           java.sql.Connection
           liquibase.Liquibase
           (liquibase.database DatabaseFactory Database)
           liquibase.database.jvm.JdbcConnection
           liquibase.exception.DatabaseException
           liquibase.resource.ClassLoaderResourceAccessor))

;; ## DB FILE, JDBC/KORMA DEFINITONS

(def db-file
  "Path to our H2 DB file from env var or app config."
  ;; see http://h2database.com/html/features.html for explanation of options
  (delay (if (config/config-bool :mb-db-in-memory)
           ;; In-memory (i.e. test) DB
           "mem:metabase;DB_CLOSE_DELAY=-1"
           ;; File-based DB
           (let [db-file-name (config/config-str :mb-db-file)
                 db-file      (clojure.java.io/file db-file-name)
                 options      ";AUTO_SERVER=TRUE;MV_STORE=FALSE;DB_CLOSE_DELAY=-1"]
             (apply str "file:" (if (.isAbsolute db-file)
                                  ;; when an absolute path is given for the db file then don't mess with it
                                  [db-file-name options]
                                  ;; if we don't have an absolute path then make sure we start from "user.dir"
                                  [(System/getProperty "user.dir") "/" db-file-name options]))))))

(defn parse-connection-string
  "Parse a DB connection URI like `postgres://cam@localhost.com:5432/cams_cool_db?ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory` and return a broken-out map."
  [uri]
  (when-let [[_ protocol user pass host port db query] (re-matches #"^([^:/@]+)://(?:([^:/@]+)(?::([^:@]+))?@)?([^:@]+)(?::(\d+))?/([^/?]+)(?:\?(.*))?$" uri)]
    (merge {:type     (keyword protocol)
            :user     user
            :password pass
            :host     host
            :port     port
            :dbname   db}
           (some-> query
                   codec/form-decode
                   walk/keywordize-keys))))

(def db-connection-details
  "Connection details that can be used when pretending the Metabase DB is itself a `Database`
   (e.g., to use the Generic SQL driver functions on the Metabase DB itself)."
  (delay (or (when-let [uri (config/config-str :mb-db-connection-uri)]
               (parse-connection-string uri))
             (case (config/config-kw :mb-db-type)
               :h2       {:type     :h2
                          :db       @db-file}
               :mysql    {:type     :mysql
                          :host     (config/config-str :mb-db-host)
                          :port     (config/config-int :mb-db-port)
                          :dbname   (config/config-str :mb-db-dbname)
                          :user     (config/config-str :mb-db-user)
                          :password (config/config-str :mb-db-pass)}
               :postgres {:type     :postgres
                          :host     (config/config-str :mb-db-host)
                          :port     (config/config-int :mb-db-port)
                          :dbname   (config/config-str :mb-db-dbname)
                          :user     (config/config-str :mb-db-user)
                          :password (config/config-str :mb-db-pass)}))))

(defn jdbc-details
  "Takes our own MB details map and formats them properly for connection details for Korma / JDBC."
  [db-details]
  {:pre [(map? db-details)]}
  ;; TODO: it's probably a good idea to put some more validation here and be really strict about what's in `db-details`
  (case (:type db-details)
    :h2       (kdb/h2       (assoc db-details :naming {:keys   s/lower-case
                                                       :fields s/upper-case}))
    :mysql    (kdb/mysql    (assoc db-details :db (:dbname db-details)))
    :postgres (kdb/postgres (assoc db-details :db (:dbname db-details)))))


;; ## MIGRATE

(def ^:private ^:const changelog-file
  "migrations/liquibase.json")

(defn migrate
  "Migrate the database:

   *  `:up`            - Migrate up
   *  `:down`          - Rollback *all* migrations
   *  `:down-one`      - Rollback a single migration
   *  `:print`         - Just print the SQL for running the migrations, don't actually run them.
   *  `:release-locks` - Manually release migration locks left by an earlier failed migration.
                         (This shouldn't be necessary now that we run migrations inside a transaction,
                         but is available just in case)."
  [db-details direction]
  (try
    (jdbc/with-db-transaction [conn (jdbc-details db-details)]
      (let [^Database database (-> (DatabaseFactory/getInstance)
                                   (.findCorrectDatabaseImplementation (JdbcConnection. (jdbc/get-connection conn))))
            ^Liquibase liquibase (Liquibase. changelog-file (ClassLoaderResourceAccessor.) database)]
        (case direction
          :up            (.update liquibase "")
          :down          (.rollback liquibase 10000 "")
          :down-one      (.rollback liquibase 1 "")
          :print         (let [writer (StringWriter.)]
                           (.update liquibase "" writer)
                           (.toString writer))
          :release-locks (.forceReleaseLocks liquibase))))
    (catch Throwable e
      (throw (DatabaseException. e)))))


;; ## SETUP-DB

(def ^:private setup-db-has-been-called?
  (atom false))

(def ^:dynamic *allow-potentailly-unsafe-connections*
  "We want to make *every* database connection made by the drivers safe -- read-only, only connect if DB file exists, etc.
   At the same time, we'd like to be able to use driver functionality like `can-connect-with-details?` to check whether we can
   connect to the Metabase database, in which case we'd like to allow connections to databases that don't exist.

   So we need some way to distinguish the Metabase database from other databases. We could add a key to the details map
   specifying that it's the Metabase DB, but what if some shady user added that key to another database?

   We could check if a database details map matched `db-connection-details` above, but what if a shady user went Meta-Metabase
   and added the Metabase DB to Metabase itself? Then when they used it they'd have potentially unsafe access.

   So this is where dynamic variables come to the rescue. We'll make this one `true` when we use `can-connect?` for the
   Metabase DB, in which case we'll allow connection to non-existent H2 (etc.) files, and leave it `false` happily and
   forever after, making all other connnections \"safe\"."
  false)

(defn- verify-db-connection
  "Test connection to database with DETAILS and throw an exception if we have any troubles connecting."
  [engine details]
  {:pre [(keyword? engine) (map? details)]}
  (log/info (u/format-color 'cyan "Verifying Database Connection ..."))
  (assert (binding [*allow-potentailly-unsafe-connections* true]
            (require 'metabase.driver)
            (@(resolve 'metabase.driver/can-connect-with-details?) engine details))
    "Unable to connect to Metabase DB.")
  (log/info (str "Verify Database Connection ... ✅")))

(defn setup-db
  "Do general preparation of database by validating that we can connect.
   Caller can specify if we should run any pending database migrations."
  [& {:keys [db-details auto-migrate]
      :or   {db-details   @db-connection-details
             auto-migrate true}}]
  (reset! setup-db-has-been-called? true)

  (verify-db-connection (:type db-details) db-details)

  ;; Run through our DB migration process and make sure DB is fully prepared
  (if auto-migrate
    (migrate db-details :up)
    ;; if we are not doing auto migrations then print out migration sql for user to run manually
    ;; then throw an exception to short circuit the setup process and make it clear we can't proceed
    (let [sql (migrate db-details :print)]
      (log/info (str "Database Upgrade Required\n\n"
                     "NOTICE: Your database requires updates to work with this version of Metabase.  "
                     "Please execute the following sql commands on your database before proceeding.\n\n"
                     sql
                     "\n\n"
                     "Once your database is updated try running the application again.\n"))
      (throw (java.lang.Exception. "Database requires manual upgrade."))))
  (log/info "Database Migrations Current ... ✅")

  ;; Establish our 'default' Korma DB Connection
  (kdb/default-connection (kdb/create-db (jdbc-details db-details)))

  ;; Do any custom code-based migrations now that the db structure is up to date
  ;; NOTE: we use dynamic resolution to prevent circular dependencies
  (require 'metabase.db.migrations)
  (@(resolve 'metabase.db.migrations/run-all)))

(defn setup-db-if-needed
  "Call `setup-db` if DB is not already setup; otherwise no-op."
  [& args]
  (when-not @setup-db-has-been-called?
    (apply setup-db args)))


;; # ---------------------------------------- UTILITY FUNCTIONS ----------------------------------------

;; ## UPD

(defn upd
  "Wrapper around `korma.core/update` that updates a single row by its id value and
   automatically passes &rest KWARGS to `korma.core/set-fields`.

     (upd User 123 :is_active false) ; updates user with id=123, setting is_active=false

   Returns true if update modified rows, false otherwise."
  [entity entity-id & {:as kwargs}]
  {:pre [(integer? entity-id)]}
  (let [obj           (models/do-pre-update entity (assoc kwargs :id entity-id))
        rows-affected (k/update entity
                                (k/set-fields (dissoc obj :id))
                                (k/where {:id entity-id}))]
    (when (> rows-affected 0)
      (models/post-update obj))
    (> rows-affected 0)))

(defn upd-non-nil-keys
  "Calls `upd`, but filters out KWARGS with `nil` values."
  [entity entity-id & {:as kwargs}]
  (->> (m/filter-vals (complement nil?) kwargs)
       (m/mapply upd entity entity-id)))


;; ## DEL

(defn del
  "Wrapper around `korma.core/delete` that makes it easier to delete a row given a single PK value.
   Returns a `204 (No Content)` response dictionary."
  [entity & {:as kwargs}]
  (k/delete entity (k/where kwargs))
  {:status 204
   :body nil})


;; ## SEL

(def ^:dynamic *sel-disable-logging*
  "Should we disable logging for the `sel` macro? Normally `false`, but bind this to `true` to keep logging from getting too noisy during
   operations that require a lot of DB access, like the sync process."
  false)

(defmacro sel
  "Wrapper for korma `select` that calls `post-select` on results and provides a few other conveniences.

  ONE-OR-MANY tells `sel` how many objects to fetch and is either `:one` or `:many`.

    (sel :one User :id 1)          -> returns the User (or nil) whose id is 1
    (sel :many OrgPerm :user_id 1) -> returns sequence of OrgPerms whose user_id is 1

  OPTION, if specified, is one of `:field`, `:fields`, `:id`, `:id->field`, `:field->id`, `:field->obj`, `:id->fields`,
  `:field->field`, or `:field->fields`.

    ;; Only return IDs of objects.
    (sel :one :id User :email \"cam@metabase.com\") -> 120

    ;; Only return the specified field.
    (sel :many :field [User :first_name]) -> (\"Cam\" \"Sameer\" ...)

    ;; Return map(s) that only contain the specified fields.
    (sel :one :fields [User :id :first_name])
      -> ({:id 1 :first_name \"Cam\"}, {:id 2 :first_name \"Sameer\"} ...)

    ;; Return a map of ID -> field value
    (sel :many :id->field [User :first_name])
      -> {1 \"Cam\", 2 \"Sameer\", ...}

    ;; Return a map of field value -> ID. Duplicates will be discarded!
    (sel :many :field->id [User :first_name])
      -> {\"Cam\" 1, \"Sameer\" 2}

    ;; Return a map of field value -> field value.
    (sel :many :field->field [User :first_name :last_name])
      -> {\"Cam\" \"Saul\", \"Rasta\" \"Toucan\", ...}

    ;; Return a map of field value -> *entire* object. Duplicates will be discarded!
    (sel :many :field->obj [Table :name] :db_id 1)
      -> {\"venues\" {:id 1, :name \"venues\", ...}
          \"users\"  {:id 2, :name \"users\", ...}}

    ;; Return a map of field value -> other fields.
    (sel :many :field->fields [Table :name :id :db_id])
      -> {\"venues\" {:id 1, :db_id 1}
          \"users\"  {:id 2, :db_id 1}}

    ;; Return a map of ID -> specified fields
    (sel :many :id->fields [User :first_name :last_name])
      -> {1 {:first_name \"Cam\", :last_name \"Saul\"},
          2 {:first_Name \"Sameer\", :last_name ...}}

  ENTITY may be either an entity like `User` or a vector like `[entity & field-keys]`.
  If just an entity is passed, `sel` will return `default-fields` for ENTITY.
  Otherwise, if a vector is passed `sel` will return the fields specified by FIELD-KEYS.

    (sel :many [OrgPerm :admin :id] :user_id 1) -> return admin and id of OrgPerms whose user_id is 1

  ENTITY may optionally be a fully-qualified symbol name of an entity; in this case, the symbol's namespace
  will be required and the symbol itself resolved at runtime. This is sometimes neccesary to avoid circular
  dependencies. This is slower, however, due to added runtime overhead.

    ;; require/resolve metabase.models.table/Table. Then sel Table 1
    (sel :one 'metabase.models.table/Table :id 1)

  FORMS may be either keyword args, which will be added to a korma `where` clause, or [other korma
  clauses](http://www.sqlkorma.com/docs#select) such as `order`, which are passed directly.

    (sel :many Table :db_id 1)                    -> (select User (where {:id 1}))
    (sel :many Table :db_id 1 (order :name :ASC)) -> (select User (where {:id 1}) (order :name ASC))"
  {:arglists '([options? entity & forms])}
  [& args]
  (let [[option args] (u/optional keyword? args)]
    `(~(if option
         ;; if an option was specified, hand off to macro named metabase.db.internal/sel:OPTION
         (symbol (format "metabase.db.internal/sel:%s" (name option)))
         ;; otherwise just hand off to low-level sel* macro
         'metabase.db.internal/sel*)
      ~@args)))


;; ## INS

(defn ins
  "Wrapper around `korma.core/insert` that renames the `:scope_identity()` keyword in output to `:id`
   and automatically passes &rest KWARGS to `korma.core/values`.

   Returns a newly created object by calling `sel`."
  [entity & {:as kwargs}]
  (let [vals         (models/do-pre-insert entity kwargs)
        ;; take database-specific keys returned from a jdbc insert and map them to :id
        {:keys [id]} (set/rename-keys (k/insert entity (k/values vals))
                                      {(keyword "scope_identity()") :id
                                       :generated_key               :id})]
    (some-> id entity models/post-insert)))


;; ## EXISTS?

(defmacro exists?
  "Easy way to see if something exists in the db.

    (exists? User :id 100)"
  [entity & {:as kwargs}]
  `(boolean (seq (k/select (i/entity->korma ~entity)
                           (k/fields [:id])
                           (k/where ~(if (seq kwargs) kwargs {}))
                           (k/limit 1)))))

;; ## CASADE-DELETE

(defn -cascade-delete
  "Internal implementation of `cascade-delete`. Don't use this directly!"
  [entity f]
  (let [entity  (i/entity->korma entity)
        results (i/sel-exec entity f)]
    (dorun (for [obj (map (partial models/do-post-select entity) results)]
             (do (models/pre-cascade-delete obj)
                 (del entity :id (:id obj))))))
  {:status 204, :body nil})

(defmacro cascade-delete
  "Do a cascading delete of object(s). For each matching object, the `pre-cascade-delete` multimethod is called,
   which should delete any objects related the object about to be deleted.

   Like `del`, this returns a 204/nil reponse so it can be used directly in an API endpoint."
  [entity & kwargs]
  `(-cascade-delete ~entity (i/sel-fn ~@kwargs)))

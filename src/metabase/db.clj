(ns metabase.db
  "Database definition and helper functions for interacting with the database."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            (clojure [set :as set]
                     [string :as s]
                     [walk :as walk])
            (honeysql [core :as hsql]
                      [format :as hformat]
                      [helpers :as h])
            (korma [core :as k]
                   [db :as kdb])
            [medley.core :as m]
            [ring.util.codec :as codec]
            [metabase.config :as config]
            [metabase.db.internal :as i]
            [metabase.models.interface :as models]
            [metabase.util :as u]
            metabase.util.honeysql-extensions) ; this needs to be loaded so the `:h2` quoting style gets added
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

(defn- db-type
  "The type of backing DB used to run Metabase. `:h2`, `:mysql`, or `:postgres`."
  ^clojure.lang.Keyword []
  (config/config-kw :mb-db-type))

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
             (case (db-type)
               :h2       {:type     :h2                               ; TODO - we probably don't need to specifc `:type` here since we can just call (db-type)
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
            ((resolve 'metabase.driver/can-connect-with-details?) engine details))
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
  ((resolve 'metabase.db.migrations/run-all)))

(defn setup-db-if-needed
  "Call `setup-db` if DB is not already setup; otherwise no-op."
  [& args]
  (when-not @setup-db-has-been-called?
    (apply setup-db args)))


;; # ---------------------------------------- OLD UTILITY FUNCTIONS ----------------------------------------

;; ## SEL

(def ^:dynamic ^Boolean *disable-db-logging*
  "Should we disable logging for database queries? Normally `false`, but bind this to `true` to keep logging from getting too noisy during
   operations that require a lot of DB access, like the sync process."
  false)

(defmacro ^:deprecated sel
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



;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                         NEW HONEY-SQL BASED DB UTIL FUNCTIONS                                          |
;;; +------------------------------------------------------------------------------------------------------------------------+

;; THIS DEPRECATES THE *ENTIRE* `metabase.db.internal` namespace. Yay!

(defn- entity-symb->ns
  "Return the namespace symbol where we'd expect to find an entity symbol.

     (entity-symb->ns 'CardFavorite) -> 'metabase.models.card-favorite"
  [symb]
  {:pre [(symbol? symb)]}
  (symbol (str "metabase.models." (s/lower-case (s/replace (name symb) #"([a-z])([A-Z])" "$1-$2")))))

(defn- resolve-entity-from-symbol
  "Resolve the entity associated with SYMB, calling `require` on its namespace if needed.

     (resolve-entity-from-symbol 'CardFavorite) -> metabase.models.card-favorite/CardFavorite"
  [symb]
  (let [entity-ns (entity-symb->ns symb)]
    @(try (ns-resolve entity-ns symb)
          (catch Throwable _
            (require entity-ns)
            (ns-resolve entity-ns symb)))))

(defn resolve-entity
  "Resolve a model entity *if* it's quoted. This also unwraps entities when they're inside vectores.

     (resolve-entity Database)         -> #'metabase.models.database/Database
     (resolve-entity [Database :name]) -> #'metabase.models.database/Database
     (resolve-entity 'Database)        -> #'metabase.models.database/Database"
  [entity]
  {:post [(:metabase.models.interface/entity %)]}
  (cond
    (:metabase.models.interface/entity entity) entity
    (vector? entity)                           (resolve-entity (first entity))
    (symbol? entity)                           (resolve-entity-from-symbol entity)
    :else                                      (throw (Exception. (str "Invalid entity:" entity)))))

(defn- db-connection
  "Get a JDBC connection spec for the Metabase DB."
  []
  (setup-db-if-needed)
  (or korma.db/*current-conn*
      (korma.db/get-connection (or korma.db/*current-db* @korma.db/_default))))

(defn- quoting-style
  "Style of `:quoting` that should be passed to HoneySQL `format`."
  ^clojure.lang.Keyword []
  (case (db-type)
    :h2       :h2
    :mysql    :mysql
    :postgres :ansi))

(defn- quote-fn
  "The function that JDBC should use to quote identifiers for our database. This is passed as the `:entities` option to functions like `jdbc/insert!`."
  []
  ((quoting-style) @(resolve 'honeysql.format/quote-fns)))

(defn- honeysql->sql
  "Compile HONEYSQL-FORM to SQL.
  This returns a vector with the SQL string as its first item and prepared statement params as the remaining items."
  [honeysql-form]
  {:pre [(map? honeysql-form)]}
  ;; Not sure *why* but without setting this binding on *rare* occasion HoneySQL will unwantedly generate SQL for a subquery and wrap the query in parens like "(UPDATE ...)" which is invalid
  (u/prog1 (binding [hformat/*subquery?* false]
             (hsql/format honeysql-form :quoting (quoting-style)))
    (when-not *disable-db-logging*
      (log/debug (str "DB Call: " (first <>))))))

(defn query
  "Compile HONEYSQL-FROM and call `jdbc/query` against the Metabase database.
   Options are passed along to `jdbc/query`."
  [honeysql-form & options]
  (apply jdbc/query (db-connection) (honeysql->sql honeysql-form) options))

(defn entity->table-name
  "Get the keyword table name associated with an ENTITY, which can be anything that can be passed to `resolve-entity`.

     (entity->table-name 'CardFavorite) -> :report_cardfavorite"
  ^clojure.lang.Keyword [entity]
  {:post [(keyword? %)]}
  (keyword (:table (resolve-entity entity))))

(defn- entity->fields
  "Get the fields that should be used in a query, destructuring ENTITY if it's wrapped in a vector, otherwise calling `default-fields`.
   This will return `nil` if the entity isn't wrapped in a vector and uses the default implementation of `default-fields`.

     (entity->fields 'User) -> [:id :email :date_joined :first_name :last_name :last_login :is_superuser :is_qbnewb]
     (entity->fields ['User :first_name :last_name]) -> [:first_name :last_name]
     (entity->fields 'Database) -> nil"
  [entity]
  (if (vector? entity)
    (rest entity)
    (models/default-fields (resolve-entity entity))))

(defn qualify
  "Qualify a FIELD-NAME name with the name its ENTITY. This is necessary for disambiguating fields for HoneySQL queries that contain joins.

     (qualify 'CardFavorite :id) -> :report_cardfavorite.id"
  ^clojure.lang.Keyword [entity field-name]
  (hsql/qualify (entity->table-name entity) field-name))


(defn simple-select
  "Select objects from the database. Like `select`, but doesn't offer as many conveniences, so you should use that instead.
   This calls `post-select` on the results.

     (simple-select 'User {:where [:= :id 1]})"
  {:style/indent 1}
  [entity honeysql-form]
  (let [entity (resolve-entity entity)]
    (vec (for [object (query (merge {:select (or (models/default-fields entity)
                                                 [:*])
                                     :from   [(entity->table-name entity)]}
                                    honeysql-form))]
           (models/do-post-select entity object)))))

(defn simple-select-one
  "Select a single object from the database. Like `select-one`, but doesn't offer as many conveniences, so prefer that instead.

     (simple-select-one 'User (h/where [:= :first-name \"Cam\"]))"
  ([entity]
   (simple-select-one entity {}))
  ([entity honeysql-form]
   (first (simple-select entity (h/limit honeysql-form 1)))))

(defn execute!
  "Compile HONEYSQL-FORM and call `jdbc/execute!` against the Metabase DB.
   OPTIONS are passed directly to `jdbc/execute!` and can be things like `:multi?` (default `false`) or `:transaction?` (default `true`)."
  [honeysql-form & options]
  (apply jdbc/execute! (db-connection) (honeysql->sql honeysql-form) options))

(defn- where
  "Generate a HoneySQL `where` form using key-value args.
     (where {} :a :b)      -> (h/where {} [:= :a :b])
     (where {} :a [:!= b]) -> (h/where {} [:!= :a :b])"
  {:style/indent 1}

  ([honeysql-form]
   honeysql-form) ; no-op

  ([honeysql-form m]
   (m/mapply where honeysql-form m))

  ([honeysql-form k v]
   (h/merge-where honeysql-form (if (vector? v)
                                  (let [[f v] v] ; e.g. :id [:!= 1] -> [:!= :id 1]
                                    (assert (keyword? f))
                                    [f k v])
                                  [:= k v])))

  ([honeysql-form k v & more]
   (apply where (where honeysql-form k v) more)))

(defn- where+
  "Generate a HoneySQL form, converting pairs of arguments with keywords into a `where` clause, and merging other HoneySQL clauses in as-is.
   Meant for internal use by functions like `select`. (So called because it handles `where` *plus* other clauses).

     (where+ {} [:id 1 {:limit 10}]) -> {:where [:= :id 1], :limit 10}"
  [honeysql-form options]
  (loop [honeysql-form honeysql-form, [first-option & [second-option & more, :as butfirst]] options]
    (cond
      (keyword? first-option) (recur (where honeysql-form first-option second-option) more)
      first-option            (recur (merge honeysql-form first-option)               butfirst)
      :else                   honeysql-form)))


;;; ## UPDATE!

(defn update!
  "Update a single row in the database. Returns `true` if a row was affected, `false` otherwise.
   Accepts either a single map of updates to make or kwargs. ENTITY is automatically resolved,
   and `pre-update` is called on KVS before the object is inserted into the database.

     (db/update! 'Label 11 :name \"ToucanFriendly\")
     (db/update! 'Label 11 {:name \"ToucanFriendly\"})"
  {:style/indent 2}

  ([entity honeysql-form]
   (let [entity (resolve-entity entity)]
     (not= [0] (execute! (merge (h/update (entity->table-name entity))
                                honeysql-form)))))

  ([entity id kvs]
   {:pre [(integer? id) (map? kvs) (every? keyword? (keys kvs))]}
   (let [entity (resolve-entity entity)
         kvs    (-> (models/do-pre-update entity (assoc kvs :id id))
                    (dissoc :id))]
     (update! entity (-> (h/sset {} kvs)
                         (where :id id)))))

  ([entity id k v & more]
   (update! entity id (apply array-map k v more))))


(defn update-non-nil-keys!
  "Like `update!`, but filters out KVS with `nil` values."
  {:style/indent 2}
  ([entity id kvs]
   (update! entity id (m/filter-vals (complement nil?) kvs)))
  ([entity id k v & more]
   (update-non-nil-keys! entity id (apply array-map k v more))))


;;; Object count caching <3
;; To avoid slamming the Database with simple count operations like `SELECT COUNT(*) FROM LABEL` (the new `GET /api/setup/admin_checklist` endpoint does 10 of these, for example)
;; We'll cache their values for each entity until it changes (via an `insert!` or `delete!`)
;; This caching also extends to simple calls to `db/exists?` (with no args) -- a call like `(db/exists? Label)` can simply check whether the object count for `Label` is > 0.

(def ^:private entity-name->object-count
  (atom {}))

(defn- invalidate-count! [entity]
  (let [{entity-name :name, :as entity} (resolve-entity entity)]
    (log/debug (u/format-color 'yellow "Invalidating object counts for: %s" entity-name))
    (swap! entity-name->object-count dissoc entity-name)))

(declare select-one)

(defn- entity-count
  "Get the number of instances of `Entity` in the database, returing a cached value if possible."
  [entity]
  (let [{entity-name :name, :as entity} (resolve-entity entity)]
    (or (u/prog1 (@entity-name->object-count entity-name)
          (when <>
            (log/debug (u/format-color 'green "Used cached value for (entity-count %s)" entity-name))))
        (u/prog1 (:count (select-one [entity [:%count.* :count]]))
          (swap! entity-name->object-count assoc entity-name <>)))))


;;; ## DELETE!

(defn delete!
  "Delete an object or objects from the Metabase DB matching certain constraints. Returns `true` if something was deleted, `false` otherwise.

     (delete! 'Label)                ; delete all Labels
     (delete! Label :name \"Cam\")   ; delete labels where :name == \"Cam\"
     (delete! Label {:name \"Cam\"}) ; for flexibility either a single map or kwargs are accepted

   Most the time, you should use `cascade-delete!` instead, handles deletion of dependent objects via the entity's implementation of `pre-cascade-delete`."
  {:style/indent 1}
  ([entity]
   (delete! entity {}))
  ([entity kvs]
   {:pre [(map? kvs) (every? keyword? (keys kvs))]}
   (let [entity (resolve-entity entity)]
     (invalidate-count! entity)
     (not= [0] (execute! (-> (h/delete-from (entity->table-name entity))
                             (where kvs))))))
  ([entity k v & more]
   (delete! entity (apply array-map k v more))))


;;; ## INSERT!

(defn- insert-id-key
  "The keyword name of the ID column of a newly inserted row returned by `jdbc/insert!`."
  ^clojure.lang.Keyword []
  (case (db-type)
    :postgres :id
    :mysql    :generated_key
    :h2       (keyword "scope_identity()")))

(defn simple-insert!
  "Do a raw JDBC `insert!` for a single row. Insert map M into the table named by keyword TABLE-KW. Returns ID of the inserted row (if applicable).
   Normally, you shouldn't call this directly; use `insert!` instead, which handles entity resolution and calls `pre-insert` and `post-insert`.

     (simple-insert! :label {:name \"Cam\", :slug \"cam\"}) -> 1"
  [table-kw m]
  {:pre  [(keyword? table-kw) (map? m) (every? keyword? (keys m))]}
  ((insert-id-key) (first (jdbc/insert! (db-connection) table-kw m, :entities (quote-fn)))))

(defn insert!
  "Insert a new object into the Database. Resolves ENTITY, and calls its `pre-insert` method on OBJECT to prepare it before insertion;
   after insertion, it calls `post-insert` on the newly created object and returns it.
   For flexibility, `insert!` OBJECT can be either a single map or individual kwargs:

     (insert! Label {:name \"Toucan Unfriendly\"})
     (insert! 'Label :name \"Toucan Friendly\")

   This fetches the newly created object from the database and passes it to the entity's `post-insert` method, ultimately returning the object."
  {:style/indent 1}
  ([entity object]
   {:pre [(map? object)]}
   (let [entity (resolve-entity entity)
         id     (simple-insert! (entity->table-name entity) (models/do-pre-insert entity object))]
     (invalidate-count! entity)
     (some-> id entity models/post-insert)))

  ([entity k v & more]
   (insert! entity (apply array-map k v more))))


;;; ## SELECT

;; All of the following functions are based off of the old `sel` macro and can do things like select certain fields by wrapping ENTITY in a vector
;; and automatically convert kv-args to a `where` clause

(defn select-one
  "Select a single object from the database.

     (select-one ['Database :name] :id 1) -> {:name \"Sample Dataset\"}"
  {:style/indent 1}
  [entity & options]
  (let [fields (entity->fields entity)]
    (simple-select-one entity (where+ {:select (or fields [:*])} options))))

(defn select-one-field
  "Select a single FIELD of a single object from the database.

     (select-one-field :name 'Database :id 1) -> \"Sample Dataset\""
  {:style/indent 2}
  [field entity & options]
  {:pre [(keyword? field)]}
  (field (apply select-one [entity field] options)))

(defn select-one-id
  "Select the `:id` of a single object from the database.

     (select-one-id 'Database :name \"Sample Dataset\") -> 1"
  [entity & options]
  (apply select-one-field :id entity options))

(defn select-one-count
  "Select the count of objects matching some condition.

     ;; Get all Databases whose name is non-nil
     (select-one-count 'Database :name [:not= nil]) -> 12

   This function avoids making a database call and instead returns a cached value when no OPTIONS are used (see documentation for `entity-count` for further information)."
  [entity & options]
  (if-not (seq options)
    (entity-count entity)
    (:count (apply select-one [entity [:%count.* :count]] options))))

(defn select
  "Select objects from the database.

     (select 'Database :name [:not= nil] {:limit 2}) -> [...]"
  {:style/indent 1}
  [entity & options]
  (let [fields (entity->fields entity)]
    (simple-select entity (where+ {:select (or fields [:*])} options))))

(defn select-field
  "Select values of a single field for multiple objects. These are returned as a set.

     (select-field :name 'Database) -> #{\"Sample Dataset\", \"test-data\"}"
  {:style/indent 2}
  [field entity & options]
  {:pre [(keyword? field)]}
  (set (map field (apply select [entity field] options))))

(defn select-ids
  "Select IDs for multiple objects. These are returned as a set.

     (select-ids 'Table :db_id 1) -> #{1 2 3 4}"
  {:style/indent 1}
  [entity & options]
  (apply select-field :id entity options))

(defn select-field->obj
  "Select objects from the database, and return them as a map of FIELD to the objects themselves.

     (select-field->obj :name 'Database) -> {\"Sample Dataset\" {...}, \"test-data\" {...}}"
  {:style/indent 2}
  [field entity & options]
  {:pre [(keyword? field)]}
  (into {} (for [result (apply select entity options)]
             {(field result) result})))

(defn select-id->obj
  "Select objects from the database, and return them as a map of their `:id` to the objects themselves.

     (select-id->obj 'Database) -> {1 {...}, 2 {...}}"
  [entity & options]
  (apply select-field->obj :id entity options))

(defn select-field->field
  "Select fields K and V from objects in the database, and return them as a map from K to V.

     (select-field->field :id :name 'Database) -> {1 \"Sample Dataset\", 2 \"test-data\"}"
  {:style/indent 3}
  [k v entity & options]
  {:pre [(keyword? k) (keyword? v)]}
  (into {} (for [result (apply select [entity k v] options)]
             {(k result) (v result)})))

(defn select-field->id
  "Select FIELD and `:id` from objects in the database, and return them as a map from FIELD to `:id`.

     (select-field->id :name 'Database) -> {\"Sample Dataset\" 1, \"test-data\" 2}"
  {:style/indent 2}
  [field entity & options]
  (apply select-field->field field :id entity options))

(defn select-id->field
  "Select FIELD and `:id` from objects in the database, and return them as a map from `:id` to FIELD.

     (select-id->field :name 'Database) -> {1 \"Sample Dataset\", 2 \"test-data\"}"
  {:style/indent 2}
  [field entity & options]
  (apply select-field->field :id field entity options))


;;; ## EXISTS?

(defn exists?
  "Easy way to see if something exists in the DB.

    (db/exists? User :id 100)

   This function avoids making a database call and instead returns a cached value when no KVS are used (see documentation for `entity-count` for further information).

   NOTE: This only works for objects that have an `:id` field."
  ^Boolean [entity & kvs]
  (if-not (seq kvs)
    (> (entity-count entity) 0)
    (boolean (select-one entity (apply where (h/select {} :id) kvs)))))


;;; ## CASADE-DELETE

(defn cascade-delete!
  "Do a cascading delete of object(s). For each matching object, the `pre-cascade-delete` multimethod is called,
   which should delete any objects related the object about to be deleted.
   Returns a 204/nil reponse so it can be used directly in an API endpoint.

     (cascade-delete! Database :id 1)

   TODO - this depends on objects having an `:id` column; consider a way to fix this for models like `Setting` that do not have one."
  {:style/indent 1}
  [entity & kvs]
  (let [entity (resolve-entity entity)]
    (doseq [object (apply select entity kvs)]
      (models/pre-cascade-delete object)
      (delete! entity :id (:id object))))
  {:status 204, :body nil})

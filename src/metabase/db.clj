(ns metabase.db
  "Korma database definition and helper functions for interacting with the database."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            (clojure [set :as set]
                     [string :as s]
                     [walk :as walk])
            (honeysql [core :as hsql]
                      [helpers :as h])
            [korma.db :as kdb]
            [medley.core :as m]
            [ring.util.codec :as codec]
            [metabase.config :as config]
            (metabase.db [internal :as internal]
                         [spec :as spec])
            [metabase.models.interface :as models]
            [metabase.util :as u])
  (:import java.io.StringWriter
           java.sql.Connection
           liquibase.Liquibase
           (liquibase.database DatabaseFactory Database)
           liquibase.database.jvm.JdbcConnection
           liquibase.exception.DatabaseException
           liquibase.resource.ClassLoaderResourceAccessor))

;;; ## DB FILE, JDBC/KORMA DEFINITONS

(def db-file
  "Path to our H2 DB file from env var or app config."
  ;; see http://h2database.com/html/features.html for explanation of options
  (delay (if (config/config-bool :mb-db-in-memory)
           ;; In-memory (i.e. test) DB
           "mem:metabase;DB_CLOSE_DELAY=-1"
           ;; File-based DB
           (let [db-file-name (config/config-str :mb-db-file)
                 db-file      (clojure.java.io/file db-file-name)
                 options      ";AUTO_SERVER=TRUE;MV_STORE=FALSE;DB_CLOSE_DELAY=-1;MVCC=true"]
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

(def ^:const ^clojure.lang.Keyword db-type
  "The type of backing DB used to run Metabase. `:h2`, `:mysql`, or `:postgres`."
  (config/config-kw :mb-db-type))

(def db-connection-details
  "Connection details that can be used when pretending the Metabase DB is itself a `Database`
   (e.g., to use the Generic SQL driver functions on the Metabase DB itself)."
  (delay (or (when-let [uri (config/config-str :mb-db-connection-uri)]
               (parse-connection-string uri))
             (case db-type
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
    :h2       (spec/h2       (assoc db-details :naming {:keys   s/lower-case
                                                        :fields s/upper-case}))
    :mysql    (spec/mysql    (assoc db-details :db (:dbname db-details)))
    :postgres (spec/postgres (assoc db-details :db (:dbname db-details)))))


;;; ## MIGRATE

(def ^:private ^:const changelog-file "migrations/liquibase.json")

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


;;; ## SETUP-DB

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


;; # ---------------------------------------- UTILITY FUNCTIONS ----------------------------------------

(declare resolve-entity)

(defn db-spec []
  @(:pool @korma.db/_default))

(def ^:const quoting-style
  "Style of `:quoting` that should be passed to HoneySQL `format`."
  (case db-type
    :h2       :h2
    :mysql    :mysql
    :postgres :ansi))

(defn- honeysql->sql
  "Compile HONEYSQL-FROM to SQL."
  ^String [honeysql-form]
  (u/prog1 (hsql/format honeysql-form :quoting quoting-style)
    (println "SQL:" (first <>))))

(defn query
  "Compile HONEYSQL-FROM and call `jdbc/query` against the Metabase database."
  [honeysql-form]
  (jdbc/query (db-spec) (honeysql->sql honeysql-form)))

(defn- entity->name [entity]
  (keyword (:table entity)))

(defn select
  "Select objects from the database."
  ([honeysql-form]
   (query (merge {:select [:*]} honeysql-form)))

  ([entity honeysql-form]
   (let [entity (resolve-entity entity)]
     (vec (for [object (select (merge {:select (or (models/default-fields entity)
                                                   [:*])
                                       :from   [(entity->name entity)]}
                                      honeysql-form))]
            (models/do-post-select entity object))))))

(defn select-1
  "Select a single object from the database.

     (select-1 'User (h/where [:= :first-name \"Cam\"]))"
  ([entity]
   (select-1 entity {}))
  ([entity honeysql-form]
   (first (select entity (h/limit honeysql-form 1)))))

(defn execute!
  "Compile HONEYSQL-FORM and call `jdbc/execute!` against the Metabase DB.
   OPTIONS are passed directly to `jdbc/execute!` and can be things like `:multi?` (default `false`) or `:transaction?` (default `true`)."
  [honeysql-form & options]
  (apply jdbc/execute! (db-spec) (honeysql->sql honeysql-form) options))

(defn where
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


(defn select-1-where
  "Select a single object matching some conditions.

     (select-1-where 'Label :name \"Cam\")"
  [entity & kvs]
  (select-1 entity (apply where {} kvs)))

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
     (not= [0] (execute! (merge (h/update (entity->name entity))
                                honeysql-form)
                         #_:transaction? #_false))))

  ([entity id kvs]
   {:pre [(integer? id) (map? kvs)]}
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


;;; ## DELETE!

(defn delete!
  "Delete an object or objects from the Metabase DB matching certain constraints. Returns `true` if something was deleted, `false` otherwise.

     (delete! 'Label)                ; delete all Labels
     (delete! Label :name \"Cam\")   ; delete labels where :name == \"Cam\"
     (delete! Label {:name \"Cam\"}) ; for flexibility either a single map or kwargs are accepted"
  {:style/indent 1}
  ([entity]
   (delete! entity {}))
  ([entity kvs]
   (let [entity (resolve-entity entity)]
     (not= [0] (execute! (-> (h/delete-from (entity->name entity))
                             (where kvs))))))
  ([entity k v & more]
   (delete! entity (apply array-map k v more))))

;;; ## INSERT!

(defn insert!
  "Insert a new object into the Database. Resolves ENTITY, and calls its `pre-insert` method on OBJECT to prepare it before insertion;
   after insertion, it calls `post-insert` on the newly created object and returns it.

   For flexibility, `insert!` OBJECT can be either a single map or individual kwargs:

     (insert! Label {:name \"Toucan Unfriendly\"})
     (insert! 'Label :name \"Toucan Friendly\")"
  {:style/indent 1}
  ([entity object]
   (let [entity (resolve-entity entity)
         object (models/do-pre-insert entity object)
         id     (first (vals (first (jdbc/insert! (db-spec) (entity->name entity) object))))]
     (some-> id entity models/post-insert)))

  ([entity k v & more]
   (insert! entity (apply array-map k v more))))


;;; ## EXISTS?

(defn exists?
  "Easy way to see if something exists in the DB.

    (db/exists? User :id 100)

   NOTE: This only works for objects that have an `:id` field."
  [entity & kvs]
  (boolean (select-1 entity (apply where (h/select :id) kvs))))

;;; ## CASADE-DELETE

(declare sel)

(defn cascade-delete!
  "Do a cascading delete of object(s). For each matching object, the `pre-cascade-delete` multimethod is called,
   which should delete any objects related the object about to be deleted.

   Returns a 204/nil reponse so it can be used directly in an API endpoint." ; TODO - do we want to do this still?
  [entity & kvs]
  (let [entity  (resolve-entity entity)]
    (doseq [object (apply sel entity kvs)]
      (models/pre-cascade-delete object)
      (delete! entity :id (:id object))))
  {:status 204, :body nil})

;;; ## SEL

(def ^:dynamic *sel-disable-logging*
  "Should we disable logging for the `sel` macro? Normally `false`, but bind this to `true` to keep logging from getting too noisy during
   operations that require a lot of DB access, like the sync process."
  false)

(defn resolve-entity
  [entity]
  {:post [:metabase.models.interface/entity]}
  (cond
    (:metabase.models.interface/entity entity) entity
    (vector? entity)                           (resolve-entity (first entity))
    (symbol? entity)                           (resolve-entity-from-symbol entity)
    :else                                      (throw (Exception. (str "Invalid entity:" entity)))))

(defn- entity->fields [entity]
  (if (vector? entity)
    (rest entity)
    (models/default-fields (resolve-entity entity))))

(defn where+ [honeysql-form options]
  (loop [honeysql-form honeysql-form, [first-option & [second-option & more, :as butfirst]] options]
    (cond
      (keyword? first-option) (recur (where honeysql-form first-option second-option) more)
      first-option            (recur (merge honeysql-form first-option)               butfirst)
      :else                   (u/prog1 honeysql-form
                                (println "where+:" <>)))))

(defn sel-1 [entity & options]
  (let [fields (entity->fields entity)]
    (select-1 entity (where+ {:select (or fields [:*])} options))))

(defn sel-1-field [field entity & options]
  {:pre [(keyword? field)]}
  (field (apply sel-1 [entity field] options)))

(defn sel-1-id [entity & options]
  (apply sel-1-field :id entity options))

(defn sel [entity & options]
  (let [fields (entity->fields entity)]
    (select entity (where+ {:select (or fields [:*])} options))))

(defn sel-field
  "Returns a set."
  [field entity & options]
  {:pre [(keyword? field)]}
  (set (map field (apply sel [entity field] options))))

(defn sel-ids [entity & options]
  (apply sel-field :id entity options))

(defn sel-field->obj [field entity & options]
  {:pre [(keyword? field)]}
  (into {} (for [result (apply sel entity options)]
             {(field result) result})))

(defn sel-id->obj [entity & options]
  (apply sel-field->obj :id entity options))

(defn sel-field->field [k v entity & options]
  {:pre [(keyword? k) (keyword? v)]}
  (into {} (for [result (apply sel [entity k v] options)]
             {(k result) (v result)})))

(defn sel-field->id [field entity & options]
  (apply sel-field->field field :id entity options))

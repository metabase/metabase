(ns metabase.db
  "Korma database definition and helper functions for interacting with the database."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            (clojure [set :as set]
                     [string :as str])
            [environ.core :refer [env]]
            (korma [core :as k]
                   [db :as kdb])
            [medley.core :as m]
            [metabase.config :as config]
            [metabase.db.internal :as i]
            [metabase.models.interface :as models]
            [metabase.util :as u])
  (:import com.metabase.corvus.migrations.LiquibaseMigrations))

;; ## DB FILE, JDBC/KORMA DEFINITONS

(def ^:private ^:const db-file
  "Path to our H2 DB file from env var or app config."
  ;; see http://h2database.com/html/features.html for explanation of options
  (if (config/config-bool :mb-db-in-memory)
    ;; In-memory (i.e. test) DB
    "mem:metabase;DB_CLOSE_DELAY=-1;MULTI_THREADED=TRUE"
    ;; File-based DB
    (let [db-file-name (config/config-str :mb-db-file)
          db-file      (clojure.java.io/file db-file-name)
          options      ";AUTO_SERVER=TRUE;MV_STORE=FALSE;DB_CLOSE_DELAY=-1"]
      (apply str "file:" (if (.isAbsolute db-file)
                           ;; when an absolute path is given for the db file then don't mess with it
                           [db-file-name options]
                           ;; if we don't have an absolute path then make sure we start from "user.dir"
                           [(System/getProperty "user.dir") "/" db-file-name options])))))


(defn setup-jdbc-db
  "Configure connection details for JDBC."
  []
  (case (config/config-kw :mb-db-type)
    :h2       {:subprotocol "h2"
               :classname   "org.h2.Driver"
               :subname     db-file}
    :postgres {:subprotocol "postgresql"
               :classname   "org.postgresql.Driver"
               :subname     (str "//" (config/config-str :mb-db-host)
                                 ":" (config/config-str :mb-db-port)
                                 "/" (config/config-str :mb-db-dbname))
               :user        (config/config-str :mb-db-user)
               :password    (config/config-str :mb-db-pass)}))


(defn setup-korma-db
  "Configure connection details for Korma."
  []
  (case (config/config-kw :mb-db-type)
    :h2       (kdb/h2 {:db     db-file
                       :naming {:keys   str/lower-case
                                :fields str/upper-case}})
    :postgres (kdb/postgres {:db       (config/config-str :mb-db-dbname)
                             :port     (config/config-int :mb-db-port)
                             :user     (config/config-str :mb-db-user)
                             :password (config/config-str :mb-db-pass)
                             :host     (config/config-str :mb-db-host)})))


;; ## CONNECTION

(defn- metabase-db-connection-details
  "Connection details that can be used when pretending the Metabase DB is itself a `Database`
   (e.g., to use the Generic SQL driver functions on the Metabase DB itself)."
  []
  (case (config/config-kw :mb-db-type)
    :h2       {:db db-file}
    :postgres {:host     (config/config-str :mb-db-host)
               :port     (config/config-int :mb-db-port)
               :dbname   (config/config-str :mb-db-dbname)
               :user     (config/config-str :mb-db-user)
               :password (config/config-str :mb-db-pass)}))


;; ## MIGRATE

(defn migrate
  "Migrate the database `:up`, `:down`, or `:print`."
  [jdbc-db direction]
  (let [conn (jdbc/get-connection jdbc-db)]
    (case direction
      :up    (LiquibaseMigrations/setupDatabase conn)
      :down  (LiquibaseMigrations/teardownDatabase conn)
      :print (LiquibaseMigrations/genSqlDatabase conn))))


;; ## SETUP-DB

(def ^:private setup-db-has-been-called?
  (atom false))

(def ^:private db-can-connect? (u/runtime-resolved-fn 'metabase.driver 'can-connect?))

(defn setup-db
  "Do general perparation of database by validating that we can connect.
   Caller can specify if we should run any pending database migrations."
  [& {:keys [auto-migrate]
      :or {auto-migrate true}}]
  (reset! setup-db-has-been-called? true)
  (log/info "Setting up DB specs...")
  (let [jdbc-db (setup-jdbc-db)
        korma-db (setup-korma-db)]

    ;; Test DB connection and throw exception if we have any troubles connecting
    (log/info "Verifying Database Connection ...")
    (assert (db-can-connect? {:engine (config/config-kw :mb-db-type)
                              :details (metabase-db-connection-details)})
            "Unable to connect to Metabase DB.")
    (log/info "Verify Database Connection ... CHECK")

    ;; Run through our DB migration process and make sure DB is fully prepared
    (if auto-migrate
      (migrate jdbc-db :up)
      ;; if we are not doing auto migrations then print out migration sql for user to run manually
      ;; then throw an exception to short circuit the setup process and make it clear we can't proceed
      (let [sql (migrate jdbc-db :print)]
        (log/info (str "Database Upgrade Required\n\n"
                    "NOTICE: Your database requires updates to work with this version of Metabase.  "
                    "Please execute the following sql commands on your database before proceeding.\n\n"
                    sql
                    "\n\n"
                    "Once your database is updated try running the application again.\n"))
        (throw (java.lang.Exception. "Database requires manual upgrade."))))
    (log/info "Database Migrations Current ... CHECK")

    ;; Establish our 'default' Korma DB Connection
    (kdb/default-connection (kdb/create-db korma-db))))

(defn setup-db-if-needed [& args]
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
  (let [obj (->> (assoc kwargs :id entity-id)
                 (models/pre-update entity)
                 (models/internal-pre-update entity)
                 (#(dissoc % :id)))
        result (-> (k/update entity (k/set-fields obj) (k/where {:id entity-id}))
                   (> 0))]
    (when result
      (models/post-update entity (assoc obj :id entity-id)))
    result))

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

(def ^:dynamic *sel-disable-logging* false)

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
  Otherwise is a vector is passed `sel` will return the fields specified by FIELD-KEYS.

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

   Returns newly created object by calling `sel`."
  [entity & {:as kwargs}]
  (let [vals (->> kwargs
                  (models/pre-insert entity)
                  (models/internal-pre-insert entity))
        {:keys [id]} (-> (k/insert entity (k/values vals))
                         (set/rename-keys {(keyword "scope_identity()") :id}))]
    (models/post-insert entity (entity id))))


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

(defn -cascade-delete [entity f]
  (let [entity  (i/entity->korma entity)
        results (i/sel-exec entity f)]
    (dorun (for [obj results]
             (do (models/pre-cascade-delete entity obj)
                 (del entity :id (:id obj))))))
  {:status 204, :body nil})

(defmacro cascade-delete
  "Do a cascading delete of object(s). For each matching object, the `pre-cascade-delete` multimethod is called,
   which should delete any objects related the object about to be deleted.

   Like `del`, this returns a 204/nil reponse so it can be used directly in an API endpoint."
  [entity & kwargs]
  `(-cascade-delete ~entity (i/sel-fn ~@kwargs)))

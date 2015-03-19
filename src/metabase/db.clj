(ns metabase.db
  "Korma database definition and helper functions for interacting with the database."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [clojure.string :as str]
            [environ.core :refer [env]]
            (korma [core :refer :all]
                   [db :refer :all])
            [medley.core :as m]
            [metabase.config :as config]
            [metabase.db.internal :refer :all]
            [metabase.util :as u]))


(declare post-select)

(defn db-file
  "Path to our H2 DB file from env var or app config."
  []
  (let [db-file-name (config/config-str :mb-db-file)
        db-file (clojure.java.io/file db-file-name)
        options ";AUTO_SERVER=TRUE;MV_STORE=FALSE;DB_CLOSE_DELAY=-1"] ; see http://h2database.com/html/features.html for explanation of options
    (if (.isAbsolute db-file)
      ;; when an absolute path is given for the db file then don't mess with it
      (str "file:" db-file-name options)
      ;; if we don't have an absolute path then make sure we start from "user.dir"
      (str "file:" (str (System/getProperty "user.dir") "/" db-file-name options)))))


(defn setup-jdbc-db
  "Configure connection details for JDBC."
  []
  (case (config/config-kw :mb-db-type)
    :h2 {:subprotocol "h2"
         :classname   "org.h2.Driver"
         :subname     (db-file)}
    :postgres {:subprotocol "postgresql"
               :classname "org.postgresql.Driver"
               :subname (str "//" (config/config-str :mb-db-host)
                             ":" (config/config-str :mb-db-port)
                             "/" (config/config-str :mb-db-dbname))
               :user (config/config-str :mb-db-user)
               :password (config/config-str :mb-db-pass)}))


(defn setup-korma-db
  "Configure connection details for Korma."
  []
  (case (config/config-kw :mb-db-type)
    :h2 (h2 {:db (db-file)
             :naming {:keys str/lower-case
                      :fields str/upper-case}})
    :postgres (postgres {:db (config/config-str :mb-db-dbname)
                         :port (config/config-int :mb-db-port)
                         :user (config/config-str :mb-db-user)
                         :password (config/config-str :mb-db-pass)
                         :host (config/config-str :mb-db-host)})))

(defn metabase-db-conn-str
  "A connection string that can be used when pretending the Metabase DB is itself a `Database`
   (e.g., to use the Generic SQL driver functions on the Metabase DB itself)."
  []
  (case (config/config-kw :mb-db-type)
    :h2 (db-file)
    :postgres (format "host=%s port=%d dbname=%s user=%s password=%s"
                      (config/config-str :mb-db-host)
                      (config/config-int :mb-db-port)
                      (config/config-str :mb-db-dbname)
                      (config/config-str :mb-db-user)
                      (config/config-str :mb-db-pass))))

(defn test-db-conn
  "Simple test of a JDBC connection."
  [jdbc-db]
  (let [result (first (jdbc/query jdbc-db ["select 7 as num"] :row-fn :num))]
    (assert (= 7 result) "JDBC Connection Test FAILED")))


(defn migrate
  "Migrate the database `:up`, `:down`, or `:print`."
  [jdbc-db direction]
  (let [conn (jdbc/get-connection jdbc-db)]
    (case direction
      :up (com.metabase.corvus.migrations.LiquibaseMigrations/setupDatabase conn)
      :down (com.metabase.corvus.migrations.LiquibaseMigrations/teardownDatabase conn)
      :print (com.metabase.corvus.migrations.LiquibaseMigrations/genSqlDatabase conn))))


(def ^:private setup-db-has-been-called?
  (atom false))

(defn setup-db
  "Do general perparation of database by validating that we can connect.
   Caller can specify if we should run any pending database migrations."
  [& {:keys [auto-migrate]
      :or {auto-migrate true}}]
  (reset! setup-db-has-been-called? true)
  (let [jdbc-db (setup-jdbc-db)
        korma-db (setup-korma-db)]
    ;; Test DB connection and throw exception if we have any troubles connecting
    (test-db-conn jdbc-db)
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
                    "Once you're database is updated try running the application again.\n"))
        (throw (java.lang.Exception. "Database requires manual upgrade."))))
    (log/info "Database Migrations Current ... CHECK")
    ;; Establish our 'default' Korma DB Connection
    (default-connection (create-db korma-db))))

(defn setup-db-if-needed [& args]
  (when-not @setup-db-has-been-called?
    (apply setup-db args)))


;;; # UTILITY FUNCTIONS

;; ## UPD

(defmulti pre-update
  "Multimethod that is called by `upd` before DB operations happen.
   A good place to set updated values for fields like `updated_at`, or serialize maps into JSON."
  (fn [entity _] entity))

(defmethod pre-update :default [_ obj]
  obj) ; default impl does no modifications to OBJ

(defn upd
  "Wrapper around `korma.core/update` that updates a single row by its id value and
   automatically passes &rest KWARGS to `korma.core/set-fields`.

     (upd User 123 :is_active false) ; updates user with id=123, setting is_active=false

   Returns true if update modified rows, false otherwise."
  [entity entity-id & {:as kwargs}]
  (let [kwargs (->> kwargs
                    (pre-update entity))]
    (-> (update entity (set-fields kwargs) (where {:id entity-id}))
        (> 0))))

(defn upd-non-nil-keys
  "Calls `upd`, but filters out KWARGS with null values."
  [entity entity-id & {:as kwargs}]
  (->> (m/filter-vals identity kwargs)
       (m/mapply upd entity entity-id)))


;; ## DEL

(defn del
  "Wrapper around `korma.core/delete` that makes it easier to delete a row given a single PK value.
   Returns a `204 (No Content)` response dictionary."
  [entity & {:as kwargs}]
  (delete entity (where kwargs))
  {:status 204
   :body nil})


;; ## SEL

(defmulti post-select
  "Called on the results from a call to `sel`. Default implementation doesn't do anything, but
   you can provide custom implementations to do things like add hydrateable keys or remove sensitive fields."
  (fn [entity _] entity))

;; Default implementation of post-select
(defmethod post-select :default [_ result]
  result)

(defmulti default-fields
  "The default fields that should be used for ENTITY by calls to `sel` if none are specified."
  identity)

(defmethod default-fields :default [_]
  nil) ; by default return nil, which we'll take to mean "everything"

(defmacro sel
  "Wrapper for korma `select` that calls `post-select` on results and provides a few other conveniences.

  ONE-OR-MANY tells `sel` how many objects to fetch and is either `:one` or `:many`.

    (sel :one User :id 1)          -> returns the User (or nil) whose id is 1
    (sel :many OrgPerm :user_id 1) -> returns sequence of OrgPerms whose user_id is 1

  OPTION, if specified, is one of `:field`, `:fields`, or `:id`.

    ;; Only return IDs of objects.
    (sel :one :id User :email \"cam@metabase.com\")  -> 120

    ;; Only return the specified field.
    (sel :many :field [User :first_name])            -> (\"Cam\" \"Sameer\" ...)

    ;; Return map(s) that only contain the specified fields.
    (sel :one :fields [User :id :first_name])        -> ({:id 1 :first_name \"Cam\"}, {:id 2 :first_name \"Sameer\"} ...)

  ENTITY may be either an entity like `User` or a vector like `[entity & field-keys]`.
  If just an entity is passed, `sel` will return `default-fields` for ENTITY.
  Otherwise is a vector is passed `sel` will return the fields specified by FIELD-KEYS.

    (sel :many [OrgPerm :admin :id] :user_id 1) -> return admin and id of OrgPerms whose user_id is 1

  ENTITY may optionally be a fully-qualified string name of an entity; in this case, the symbol's namespace
  will be required and the symbol itself resolved at runtime. This is sometimes neccesary to avoid circular
  dependencies. This is slower, however, due to added runtime overhead.

    (sel :one \"metabase.models.table/Table\" :id 1) ; require/resolve metabase.models.table/Table. then sel Table 1

  FORMS may be either keyword args, which will be added to a korma `where` clause, or other korma
   clauses such as `order`, which are passed directly.

    (sel :many Table :db_id 1)                    -> (select User (where {:id 1}))
    (sel :many Table :db_id 1 (order :name :ASC)) -> (select User (where {:id 1}) (order :name ASC))"
  [one-or-many & args]
  {:arglists ([one-or-many option? entity & forms])
   :pre [(contains? #{:one :many} one-or-many)]}
  (if (= one-or-many :one)
    `(first (sel :many ~@args (limit 1)))
    (let [[option [entity & forms]] (u/optional keyword? args)]
      (case option
        :field  `(let [[entity# field#] ~entity]
                   (map field#
                        (sel :many [entity# field#] ~@forms)))
        :id     `(sel :many :field [~entity :id] ~@forms)
        :fields `(let [[~'_ & fields# :as entity#] ~entity]
                   (map #(select-keys % fields#)
                        (sel :many entity# ~@forms)))
        nil     `(-sel-select ~entity ~@forms)))))

(def ^:dynamic *entity-overrides*
  "The entity passed to `-sel-select` gets merged with this dictionary right before `select` gets called. This lets you override some of the korma
   entity fields like `:transforms` or `:table`, if need be."
  {})

(defmacro -sel-select
  "Internal macro used by `sel` (don't call this directly).
   Generates the korma `select` form."
  [entity & forms]
  (let [forms (sel-apply-kwargs forms)]                                          ; convert kwargs like `:id 1` to korma `where` clause
    `(let [[entity# field-keys#] (destructure-entity ~entity)                    ; pull out field-keys if passed entity vector like `[entity & field-keys]`
           entity# (entity->korma entity#)                                       ; entity## is the actual entity like `metabase.models.user/User` that we can dispatch on
           entity-select-form# (-> entity#                                       ; entity-select-form# is the tweaked version we'll pass to korma `select`
                                   (assoc :fields (or field-keys#
                                                      (default-fields entity#))) ; tell korma which fields to grab. If `field-keys` weren't passed in vector
                                   (merge *entity-overrides*))]                  ; then do a `default-fields` lookup at runtime
       (when (config/config-bool :mb-db-logging)
         (log/debug "DB CALL: " (:name entity#)
                  (or (:fields entity-select-form#) "*")
                  ~@(mapv (fn [[form & args]]
                            `[~(name form) ~(apply str (interpose " " args))])
                          forms)))
       (->> (select entity-select-form# ~@forms)
            (map (partial post-select entity#))))))                             ; map `post-select` over the results


;; ## INS

(defmulti pre-insert
  "Gets called by `ins` immediately before inserting a new object immediately before the korma `insert` call.
   This provides an opportunity to do things like encode JSON or provide default values for certain fields.

    (pre-insert Query [_ query]
      (let [defaults {:version 1}]
        (merge defaults query))) ; set some default values"
  (fn [entity _] entity))

(defmethod pre-insert :default [_ obj]
  obj)   ; default impl returns object as is

(defn ins
  "Wrapper around `korma.core/insert` that renames the `:scope_identity()` keyword in output to `:id`
   and automatically passes &rest KWARGS to `korma.core/values`.

   Returns newly created object by calling `sel`."
  [entity & {:as kwargs}]
  (let [vals (->> kwargs
                  (pre-insert entity))]
    (let [{:keys [id]} (-> (insert entity (values vals))
                           (clojure.set/rename-keys {(keyword "scope_identity()") :id}))]
      (sel :one entity :id id))))


;; ## EXISTS?

(defmacro exists?
  "Easy way to see if something exists in the db.

    (exists? User :id 100)"
  [entity & {:as kwargs}]
  `(not (empty? (select (entity->korma ~entity)
                        (fields [:id])
                        (where ~kwargs)
                        (limit 1)))))

;; ## CASADE-DELETE

(defmulti pre-cascade-delete (fn [entity _]
                               entity))

(defmethod pre-cascade-delete :default [_ instance]
  instance)

(defmacro cascade-delete [entity & kwargs]
  `(let [entity# (entity->korma ~entity)
         instances# (sel :many entity# ~@kwargs)]
     (dorun (map (fn [instance#]
                   (pre-cascade-delete entity# instance#)
                   (del entity# :id (:id instance#)))
                 instances#))))

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
            [metabase.db.internal :refer :all :as i]
            [metabase.util :as u]))


(declare post-select)

;; ## DB FILE, JDBC/KORMA DEFINITONS

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
             :naming {:keys   str/lower-case
                      :fields str/upper-case}})
    :postgres (postgres {:db       (config/config-str :mb-db-dbname)
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
    :h2       {:db (db-file)}
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
      :up    (com.metabase.corvus.migrations.LiquibaseMigrations/setupDatabase conn)
      :down  (com.metabase.corvus.migrations.LiquibaseMigrations/teardownDatabase conn)
      :print (com.metabase.corvus.migrations.LiquibaseMigrations/genSqlDatabase conn))))


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
    (default-connection (create-db korma-db))))

(defn setup-db-if-needed [& args]
  (when-not @setup-db-has-been-called?
    (apply setup-db args)))


;; # UTILITY FUNCTIONS

;; ## CAST-COLUMNS

;; TODO - Doesn't Korma have similar `transformations` functionality? Investigate.

(def ^:const ^:private type-fns
  "A map of column type keywords to the functions that should be used to \"cast\"
   them when going `:in` or `:out` of the database."
  {:json    {:in  i/write-json
             :out i/read-json}
   :keyword {:in  name
             :out keyword}})

(defn types
  "Tag columns in an entity definition with a type keyword.
   This keyword will be used to automatically \"cast\" columns when they are present.

    ;; apply ((type-fns :json) :in) -- cheshire/generate-string -- to value of :details before inserting into DB
    ;; apply ((type-fns :json) :out) -- read-json -- to value of :details when reading from DB
    (defentity Database
      (types {:details :json}))"
  [entity types-map]
  {:pre [(every? keyword? (keys types-map))
         (every? (partial contains? type-fns) (vals types-map))]}
  (assoc entity ::types types-map))

(defn apply-type-fns
  "Recursively apply a sequence of functions associated with COLUMN-TYPE-PAIRS to OBJ.

   COLUMN-TYPE-PAIRS should be the value of `(seq (::types korma-entity))`.
   DIRECTION should be either `:in` or `:out`."
  {:arglists '([direction column-type-pairs obj])}
  [direction [[column column-type] & rest-pairs] obj]
  (if-not column obj
          (recur direction rest-pairs (if-not (column obj) obj
                                              (update-in obj [column] (-> type-fns column-type direction))))))

;; TODO - It would be good to allow custom types by just inserting the `{:in fn :out fn}` inline with the
;; entity definition

;; TODO - hydration-keys should be an entity function for the sake of prettiness


;; ## TIMESTAMPED

(defn timestamped
  "Mark ENTITY as having `:created_at` *and* `:updated_at` fields.

    (defentity Card
      timestamped)

   *  When a new object is created via `ins`, values for both fields will be generated.
   *  When an object is updated via `upd`, `:updated_at` will be updated."
  [entity]
  (assoc entity ::timestamped true))


;; ## UPD

(defmulti pre-update
  "Multimethod that is called by `upd` before DB operations happen.
   A good place to set updated values for fields like `updated_at`, or serialize maps into JSON."
  (fn [entity _] entity))

(defmethod pre-update :default [_ obj]
  obj) ; default impl does no modifications to OBJ

(defmulti post-update
  "Multimethod that is called by `upd` after a SQL `UPDATE` *succeeds*.
   (This gets called with whatever the output of `pre-update` was).

   A good place to schedule asynchronous tasks, such as creating a `FieldValues` object for a `Field`
   when it is marked with `special_type` `:category`.

   The output of this function is ignored."
  (fn [entity _] entity))

(defmethod post-update :default [_ _] ; default impl does nothing and returns nil
  nil)

(defn upd
  "Wrapper around `korma.core/update` that updates a single row by its id value and
   automatically passes &rest KWARGS to `korma.core/set-fields`.

     (upd User 123 :is_active false) ; updates user with id=123, setting is_active=false

   Returns true if update modified rows, false otherwise."
  [entity entity-id & {:as kwargs}]
  {:pre [(integer? entity-id)]}
  (let [obj (->> (assoc kwargs :id entity-id)
                 (pre-update entity)
                 (#(dissoc % :id))
                 (apply-type-fns :in (seq (::types entity))))
        obj (cond-> obj
              (::timestamped entity) (assoc :updated_at (u/new-sql-timestamp)))
        result (-> (update entity (set-fields obj) (where {:id entity-id}))
                   (> 0))]
    (when result
      (post-update entity (assoc obj :id entity-id)))
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

  OPTION, if specified, is one of `:field`, `:fields`, `:id`, `:id->field`, `:field->id`, `:field->obj`, or `:id->fields`.

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
  {:arglists '([one-or-many option? entity & forms])}
  [one-or-many & args]
  {:pre [(contains? #{:one :many} one-or-many)]}
  (if (= one-or-many :one)
    `(first (sel :many ~@args (limit 1)))
    (let [[option [entity & forms]] (u/optional keyword? args)]
      (case option
        :field  `(let [[entity# field#] ~entity]
                   (map field#
                        (sel :many [entity# field#] ~@forms)))
        :id     `(sel :many :field [~entity :id] ~@forms)
        :id->fields `(->> (sel :many :fields [~@entity :id] ~@forms)
                          (map (fn [{id# :id :as obj#}]
                                 {id# obj#}))
                          (into {}))
        :id->field `(let [[entity# field#] ~entity]
                      (->> (sel :many :fields [entity# field# :id] ~@forms)
                           (map (fn [{id# :id field-val# field#}]
                                  {id# field-val#}))
                           (into {})))
        :field->id `(let [[entity# field#] ~entity]
                      (->> (sel :many :fields [entity# field# :id] ~@forms)
                           (map (fn [{id# :id field-val# field#}]
                                  {field-val# id#}))
                           (into {})))
        :field->field `(let [[entity# field1# field2#] ~entity]
                         (->> (sel :many entity# ~@forms)
                              (map (fn [obj#]
                                     {(field1# obj#) (field2# obj#)}))
                              (into {})))
        :field->obj `(let [[entity# field#] ~entity]
                       (->> (sel :many entity# ~@forms)
                            (map (fn [obj#]
                                   {(field# obj#) obj#}))
                            (into {})))
        :fields `(let [[~'_ & fields# :as entity#] ~entity]
                   (map #(select-keys % fields#)
                        (sel :many entity# ~@forms)))
        nil     `(-sel ~entity ~@forms)))))

(def ^:dynamic *sel-disable-logging* false)

(defn -sel-maybe-log [entity fields forms-str]
  )

(defn -sel-after [entity results]
  (map (comp (partial post-select entity)
             (partial apply-type-fns :out (seq (::types entity))))
       results))

(defmacro -sel
  "Internal macro used by `sel` (don't call this directly).
   Generates the korma `select` form."
  [entity & forms]
  (let [forms (sel-apply-kwargs forms)]
    `(let [[entity# field-keys#] (destructure-entity ~entity)
           entity#               (entity->korma entity#)
           entity-select-form#   (assoc entity# :fields (or field-keys#
                                                            (default-fields entity#)))]
       (when (and (config/config-bool :mb-db-logging)
                  (not *sel-disable-logging*))
         (log/debug "DB CALL:" (:name entity#) (or (:fields entity-select-form#) "*")
                    ~(apply str (interpose " " (for [[form & args] forms]
                                                 (apply str (name form) " " (interpose " " args)))))))
       (-sel-after entity# (select entity-select-form# ~@forms)))))


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

(defmulti post-insert
  "Gets called by `ins` after an object is inserted into the DB. (This object is fetched via `sel`).
   A good place to do asynchronous tasks such as creating related objects.
   Implementations should return the newly created object."
  (fn [entity _] entity))

;; Default implementation returns object as-is
(defmethod post-insert :default [_ obj]
  obj)

(defn ins
  "Wrapper around `korma.core/insert` that renames the `:scope_identity()` keyword in output to `:id`
   and automatically passes &rest KWARGS to `korma.core/values`.

   Returns newly created object by calling `sel`."
  [entity & {:as kwargs}]
  (let [vals (->> kwargs
                  (pre-insert entity)
                  (apply-type-fns :in (seq (::types entity))))
        vals (cond-> vals
               (::timestamped entity) (assoc :created_at (u/new-sql-timestamp)
                                             :updated_at (u/new-sql-timestamp)))
        {:keys [id]} (-> (insert entity (values vals))
                         (clojure.set/rename-keys {(keyword "scope_identity()") :id}))]
    (->> (sel :one entity :id id)
         (post-insert entity))))


;; ## EXISTS?

(defmacro exists?
  "Easy way to see if something exists in the db.

    (exists? User :id 100)"
  [entity & {:as kwargs}]
  `(not (empty? (select (entity->korma ~entity)
                        (fields [:id])
                        ~@(when (seq kwargs)
                            `[(where ~kwargs)])
                        (limit 1)))))

;; ## CASADE-DELETE

(defmulti pre-cascade-delete
  "Called by `cascade-delete` for each matching object that is about to be deleted.
   Implementations should delete any objects related to this object by recursively
   calling `cascade-delete`.

    (defmethod pre-cascade-delete Database [_ {database-id :id :as database}]
      (cascade-delete Card :database_id database-id)
      ...)"
  (fn [entity _]
    entity))

(defmethod pre-cascade-delete :default [_ instance]
  instance)

;; TODO - does this *really* need to be a macro?
(defmacro cascade-delete
  "Do a cascading delete of object(s). For each matching object, the `pre-cascade-delete` multimethod is called,
   which should delete any objects related the object about to be deleted.

   Like `del`, this returns a 204/nil reponse so it can be used directly in an API endpoint."
  [entity & kwargs]
  `(let [entity# (entity->korma ~entity)
         instances# (sel :many entity# ~@kwargs)]
     (dorun (map (fn [instance#]
                   (pre-cascade-delete entity# instance#)
                   (del entity# :id (:id instance#)))
                 instances#))
     {:status 204, :body nil}))

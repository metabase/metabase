(ns metabase.db
  "Korma database definition and helper functions for interacting with the database."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [clojure.string :as str]
            [environ.core :refer [env]]
            [korma.core :refer :all]
            [korma.db :refer :all]
            [metabase.config :refer [app-defaults]]
            [metabase.db.internal :refer :all]))

(def db-file
  "Path to our H2 DB file from env var or app config."
  (str "file:" (or (:database-file env)
                   (:database-file app-defaults))))
(log/info (str "Using H2 database file: " db-file))

(defdb db (h2 {:db db-file
               :naming {:keys str/lower-case
                        :fields str/upper-case}}))

(defn migrate
  "Migrate the database :up or :down."
  [direction]
  (let [conn (jdbc/get-connection {:subprotocol "h2"
                                   :subname db-file})]
    (case direction
      :up (com.metabase.corvus.migrations.LiquibaseMigrations/setupDatabase conn)
      :down (com.metabase.corvus.migrations.LiquibaseMigrations/teardownDatabase conn))))

;;; UTILITY FUNCTIONS

(defn ins
  "Wrapper around `korma.core/insert` that renames the `:scope_identity()` keyword in output to `:id`
   and automatically passes &rest KWARGS to `korma.core/values`."
  [entity & kwargs]
  (-> (insert entity (values (apply assoc {} kwargs)))
      (clojure.set/rename-keys {(keyword "scope_identity()") :id})))

(defn upd
  "Wrapper around `korma.core/update` that updates a single row by its id value and
   automatically passes &rest KWARGS to `korma.core/set-fields`.

   `(upd User 123 :is_active false)` -> updates user with id=123, setting is_active=false

   Returns true if update modified rows, false otherwise."
  [entity entity-id & kwargs]
  (-> (update entity (set-fields (apply assoc {} kwargs)) (where {:id entity-id}))
      (> 0)))

(defn del
  "Wrapper around `korma.core/delete` that makes it easier to delete a row given a single PK value."
  [entity & kwargs]
  (delete entity (where (apply assoc {} kwargs))))

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

  `(sel :one User :id 1)          -> returns the User (or nil) whose id is 1`
  `(sel :many OrgPerm :user_id 1) -> returns sequence of OrgPerms whose user_id is 1`

  ENTITY may be either an entity like `User` or a vector like `[entity & field-keys]`.
  If just an entity is passed, `sel` will return `default-fields` for ENTITY.
  Otherwise is a vector is passed `sel` will return the fields specified by FIELD-KEYS.

  `(sel :many [OrgPerm :admin :id] :user_id 1) -> return admin and id of OrgPerms whose user_id is 1`

  FORMS may be either keyword args, which will be added to a korma `where` clause, or other korma
   clauses such as `order`, which are passed directly.

  `(sel :many Table :db_id 1)                    -> (select User (where {:id 1}))`
  `(sel :many Table :db_id 1 (order :name :ASC)) -> (select User (where {:id 1}) (order :name ASC))`"
  [one-or-many entity & forms]
  `(->> (-sel-select ~entity ~@forms)
        (map (partial post-select ~entity))
        ~(case one-or-many
           :one 'first
           :many 'identity)))

(defmacro -sel-select
  "Internal macro used by `sel` (don't call this directly).
   Generates the korma `select` form."
  [entity & forms]
  (let [[entity field-keys] (entity-field-keys default-fields entity)
        forms (->> forms
                   sel-apply-kwargs
                   (sel-apply-fields field-keys))]
    `(select ~entity ~@forms)))

(defmacro sel-fn
  "Returns a memoized fn that calls `sel`.

   ENTITY may optionally be a fully-qualified string name of an entity; in this case, the symbol's namespace
   will be required and the symbol itself resolved at runtime. This is sometimes neccesary to avoid circular
   dependencies in the model files. This is slower, however, due to added runtime overhead.

   `(sel :one Table :id 1)                           ; returns fn that will sel Table 1 when called`
   `(sel :one \"metabase.models.table/Table\" :id 1) ; returns fn that will require/resolve metabase.models.table/Table. then sel Table 1`"
  [one-or-many entity & forms]
  `(memoize
    (fn []
      ~@(if (string? entity)
          `((require '~(-> entity (^String .split "/") first symbol)) ; require the namespace
            (let [entity# (symbol ~entity)]
              (eval `(sel ~~one-or-many ~entity# ~~@forms))))
          `((sel ~one-or-many ~entity ~@forms))))))

(ns metabase.db
  "Korma database definition and helper functions for interacting with the database."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [clojure.string :as str]
            [environ.core :refer [env]]
            [korma.core :refer :all]
            [korma.db :refer :all]
            [metabase.config :refer [app-defaults]]))

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

  `sel` returns either :one or :many objects.

   `(sel :one User :id 1)          -> returns the User (or nil) whose id is 1`
   `(sel :many OrgPerm :user_id 1) -> returns sequence of OrgPerms whose user_id is 1`

   By default, `sel` will return `default-fields` for `entity` (or all fields if `default-fields` isn't specified),
   but you can override this behavior by passing `entity` as a vector like `[entity & field-keys]`.

   `(sel :many [OrgPerm :admin :id] :user_id 1) -> return admin and id of OrgPerms whose user_id is 1"
  [one-or-many entity & kwargs]
  (let [quantity-fn (case one-or-many
                      :one first
                      :many identity)
        [entity & field-keys] (if (vector? entity) entity
                                  [entity])
        field-keys (or field-keys
                       (default-fields (eval entity)))]
    `(->> (select ~entity
                  (where ~(apply assoc {} kwargs))
                  ~@(when field-keys
                      `[(fields ~@field-keys)]))
          (map (partial post-select ~entity))
          ~quantity-fn)))

(defmacro sel-fn
  "Returns a memoized fn that calls `sel`"
  [one-or-many entity & kwargs]
  `(memoize
    (fn []
      (sel ~one-or-many ~entity ~@kwargs))))

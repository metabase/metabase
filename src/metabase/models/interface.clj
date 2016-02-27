(ns metabase.models.interface
  (:require [clojure.tools.logging :as log]
            [cheshire.core :as json]
            [korma.core :as k]
            (metabase [config :as config]
                      [util :as u])
            [metabase.models.common :as common]))

;;; permissions implementations

(defn superuser?
  "Is `*current-user*` is a superuser? Ignores args.
   Intended for use as an implementation of `can-read?` and/or `can-write?`."
  [& _]
  (:is_superuser @@(resolve 'metabase.api.common/*current-user*)))

(defn- creator?
  "Did the current user create OBJ?"
  [{:keys [creator_id], :as obj}]
  {:pre [creator_id]}
  (= creator_id @(resolve 'metabase.api.common/*current-user-id*)))

(defn- publicly-?
  ([perms {:keys [public_perms], :as obj}]
   {:pre [public_perms]}
   (or (>= public_perms perms)
       (creator? obj)
       (superuser?)))
  ([perms entity id]
   (or (superuser?)
       (publicly-? perms (entity id)))))

(def ^{:arglists '([obj] [entity id])} publicly-readable?
  "Implementation of `can-read?` that returns `true` if `*current-user*` is a superuser, the person who created OBJ, or if OBJ has read `:public_perms`."
  (partial publicly-? common/perms-read))

(def ^{:arglists '([obj] [entity id])} publicly-writeable?
  "Implementation of `can-write?` that returns `true` if `*current-user*` is a superuser, the person who created OBJ, or if OBJ has readwrite `:public_perms`."
  (partial publicly-? common/perms-readwrite))

(defprotocol IEntity
  "Methods model classes should implement; all except for `can-read?` and `can-write?` have default implementations in `IEntityDefaults`.
   Internal models that don't participate in permissions checking don't need to implement `can-read?`/`can-write?`."
  (pre-insert [this]
    "Gets called by `ins` immediately before inserting a new object immediately before the korma `insert` call.
     This provides an opportunity to do things like encode JSON or provide default values for certain fields.

         (pre-insert [_ query]
           (let [defaults {:version 1}]
             (merge defaults query))) ; set some default values")

  (post-insert [this]
    "Gets called by `ins` after an object is inserted into the DB. (This object is fetched via `sel`).
     A good place to do asynchronous tasks such as creating related objects.
     Implementations should return the newly created object.")

  (pre-update [this]
    "Called by `upd` before DB operations happen. A good place to set updated values for fields like `updated_at`, or serialize maps into JSON.")

  (post-update [this]
    "Called by `upd` after a SQL `UPDATE` *succeeds*. (This gets called with whatever the output of `pre-update` was).

     A good place to schedule asynchronous tasks, such as creating a `FieldValues` object for a `Field`
     when it is marked with `special_type` `:category`.

     The output of this function is ignored.")

  (post-select [this]
    "Called on the results from a call to `sel`. Default implementation doesn't do anything, but
     you can provide custom implementations to do things like add hydrateable keys or remove sensitive fields.")

  (pre-cascade-delete [this]
    "Called by `cascade-delete` for each matching object that is about to be deleted.
     Implementations should delete any objects related to this object by recursively
     calling `cascade-delete`.

     The output of this function is ignored.

        (pre-cascade-delete [_ {database-id :id :as database}]
          (cascade-delete Card :database_id database-id)
          ...)")

  (^{:hydrate :can_read} can-read? ^Boolean [instance], ^Boolean [entity, ^Integer id]
   "Return whether `*current-user*` has *read* permissions for an object. You should use one of these implmentations:

     *  `(constantly true)` (default)
     *  `superuser?`
     *  `publicly-readable?`")

  (^{:hydrate :can_write} can-write? ^Boolean [instance], ^Boolean [entity, ^Integer id]
   "Return whether `*current-user*` has *write* permissions for an object. You should use one of these implmentations:

     *  `(constantly true)`
     *  `superuser?` (default)
     *  `publicly-writeable?`")

  (default-fields ^clojure.lang.Sequential [this]
    "Return a sequence of keyword field names that should be fetched by default when calling `sel` or invoking the entity (e.g., `(Database 1)`).")

  (timestamped? ^Boolean [this]
    "Should `:created_at` and `:updated_at` be updated when calling `ins`, and `:updated_at` when calling `upd`? Default is `false`.")

  (hydration-keys ^clojure.lang.Sequential [this]
    "Return a sequence of keyword field names that should be hydrated to this model. For example, `User` might inclide `:creator`, which means `hydrate`
     will look for `:creator_id` in other objects and fetch the corresponding `Users`.")

  (types ^clojure.lang.IPersistentMap [this]
    "Return a map of keyword field names to their types for fields that should be serialized/deserialized in a special way. Valid types are `:json`, `:keyword`, or `:clob`.

     *  `:json` serializes objects as JSON strings before going into the DB, and parses JSON strings when coming out
     *  `:keyword` calls `name` before going into the DB, and `keyword` when coming out
     *  `:clob` converts clobs to Strings (via `metabase.util/jdbc-clob->str`) when coming out

       (types [_] {:cards :json}) ; encode `:cards` as JSON when stored in the DB"))


(def ^:private type-fns
  "The functions that should be invoked for corresponding `types` when an object comes `:in` or `:out` of the DB."
  {:json    {:in  (fn [obj]
                    (if (string? obj)
                      obj
                      (json/generate-string obj)))
             :out (fn [obj]
                    (let [s (u/jdbc-clob->str obj)]
                      (if (string? s)
                        (json/parse-string s keyword)
                        obj)))}
   :keyword {:in  name
             :out keyword}
   :clob    {:in  identity
             :out u/jdbc-clob->str}})

(defn- apply-type-fns
  "Apply the appropriate `type-fns` for OBJ."
  [obj direction]
  (into obj (for [[col type] (types obj)]
              (when-let [v (get obj col)]
                {col ((get-in type-fns [type direction]) v)}))))

(defn- maybe-update-timestamps
  "If OBJ is `timestamped?`, update each key in KS with a `new-sql-timestamp`."
  [obj & ks]
  (if-not (timestamped? obj)
    obj
    (let [ts (u/new-sql-timestamp)]
      (into obj (for [k ks]
                  {k ts})))))


(defprotocol ICreateFromMap
  "Used by internal functions like `do-post-select`."
  (^:private map-> [klass, ^clojure.lang.IPersistentMap m]
   "Convert map M to instance of record type KLASS."))

;; these functions call (map-> entity ...) twice to make sure functions like pre-insert/post-select didn't do something that accidentally removed the typing

(defn do-pre-insert
  "Don't call this directly! Apply functions like `pre-insert` before inserting an object into the DB."
  [entity obj]
  (as-> obj <>
    (map-> entity <>)
    (pre-insert <>)
    (map-> entity <>)
    (apply-type-fns <> :in)
    (maybe-update-timestamps <> :created_at :updated_at)))

(defn do-pre-update
  "Don't call this directly! Apply internal functions like `pre-update` before updating an object in the DB."
  [entity obj]
  (as-> obj <>
    (map-> entity <>)
    (pre-update <>)
    (map-> entity <>)
    (apply-type-fns <> :in)
    (maybe-update-timestamps <> :updated_at)))

(defn do-post-select
  "Don't call this directly! Apply internal functions like `post-select` when an object is retrieved from the DB."
  [entity obj]
  (as-> obj <>
    (map-> entity <>)
    (apply-type-fns <> :out)
    (post-select <>)
    (map-> entity <>)))

(def IEntityDefaults
  "Default implementations for `IEntity` methods."
  {:default-fields     (constantly nil)
   :timestamped?       (constantly false)
   :hydration-keys     (constantly nil)
   :types              (constantly nil)
   :can-read?          (fn [this & _] (throw (UnsupportedOperationException. (format "No implementation of can-read? for %s; please provide one."  (class this)))))
   :can-write?         (fn [this & _] (throw (UnsupportedOperationException. (format "No implementation of can-write? for %s; please provide one." (class this)))))
   :pre-insert         identity
   :post-insert        identity
   :pre-update         identity
   :post-update        (constantly nil)
   :post-select        identity
   :pre-cascade-delete (constantly nil)})

(defn- invoke-entity
  "Fetch an object with a specific ID or all objects of type ENTITY from the DB.

     (invoke-entity Database)   -> seq of all databases
     (invoke-entity Database 1) -> Database w/ ID 1"
  ([entity]
   (for [obj (k/select (assoc entity :fields (default-fields entity)))]
     (do-post-select entity obj)))
  ([entity id]
   (when id
     (when (and id
                (config/config-bool :mb-db-logging)
                (not @(resolve 'metabase.db/*sel-disable-logging*)))
       (log/debug "DB CALL:" (:name entity) id))
     (when-let [[obj] (seq (k/select (assoc entity :fields (default-fields entity))
                                     (k/where {:id id})
                                     (k/limit 1)))]
       (do-post-select entity obj)))))

(def ^:const ^{:arglists '([entity])} ^Boolean metabase-entity?
  "Is ENTITY a valid metabase model entity?"
  ::entity)

;; We use the same record type (e.g., `DatabaseInstance`) for both the "entity" (e.g., `Database`) and objects fetched from the DB ("instances").
;; entities have the key `::entity` assoced so we can differentiate.
;; invoking an instance calls get so you can do things like `(db :name)` as if it were a regular map.
(defn invoke-entity-or-instance
  "Check whether OBJ is an entity (e.g. `Database`) or an object from the DB; if an entity, call `invoked-entity`; otherwise call `get`."
  [obj & args]
  (apply (if (metabase-entity? obj)
           invoke-entity
           get)
         obj args))


(defmacro defentity
  "Define a new \"entity\". Entities encapsulate information and behaviors related to a specific table in the Metabase DB,
   and have their own unique record type.

   `defentity` defines a backing record type following the format `<entity>Instance`. For example, the class associated with
   `User` is `metabase.models.user/UserInstance`. This class is used for both the titular korma entity (e.g. `User`) and
   for objects that are fetched from the DB. This means they can share the `IEntity` protocol and simplifies the interface
   somewhat; functions like `types` work on either the entity or instances fetched from the DB.

     (defentity User :metabase_user)  ; creates class `UserInstance` and korma entity `User`

     (metabase.db/sel :one User, ...) ; use with `metabase.db` functions. All results are instances of `UserInstance`
     (korma.core/select User ...)     ; use with korma functions. Results will be regular maps

   The record type automatically extends `IEntity` with `IEntityDefaults`, but you may call `extend` again if you need to
   override default behaviors:

     (extend (class User)             ; it's somewhat more readable to write `(class User)` instead `UserInstance`
       IEntity (merge IEntityDefaults
                      {...}))

   Finally, the entity itself is invokable. Calling with no args returns *all* values of that object; calling with a single
   arg can be used to fetch a specific instance by its integer ID.

     (Database)                       ; return a seq of *all* Databases (as instances of `DatabaseInstance`)
     (Database 1)                     ; return Database 1"
  {:arglist      '([entity table-name] [entity docstr? table-name & korma-forms])
   :style/indent 1}
  [entity & args]
  (let [[docstr [table-name & korma-forms]] (u/optional string? args)
        instance                            (symbol (str entity "Instance"))
        map->instance                       (symbol (str "map->" instance))]
    `(do
       (defrecord ~instance []
         clojure.lang.IFn
         (~'invoke [this#]     (invoke-entity-or-instance this#))
         (~'invoke [this# id#] (invoke-entity-or-instance this# id#)))

       (extend ~instance
         IEntity        IEntityDefaults
         ICreateFromMap {:map-> (u/drop-first-arg ~map->instance)})

       (def ~(vary-meta entity assoc
                        :tag      (symbol (str (namespace-munge *ns*) \. instance))
                        :arglists ''([] [id])
                        :doc      (or docstr
                                      (format "Korma entity for '%s' table; instance of %s." (name table-name) instance)))
         (-> (k/create-entity ~(name entity))
             (k/table ~table-name)
             ~@korma-forms
             (assoc ::entity true)
             ~map->instance)))))

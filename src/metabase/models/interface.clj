(ns metabase.models.interface
  ;; TODO - maybe just call this namespace `metabase.models`?
  (:require [clojure.tools.logging :as log]
            [cheshire.core :as json]
            (metabase [config :as config]
                      [util :as u])
            [metabase.models.common :as common]))


;;; ------------------------------------------------------------ Entity ------------------------------------------------------------

(defprotocol IEntity
  "Methods model classes should implement; all except for `can-read?` and `can-write?` have default implementations in `IEntityDefaults`.
   Internal models that don't participate in permissions checking don't need to implement `can-read?`/`can-write?`."
  (pre-insert [this]
    "Gets called by `insert!` immediately before inserting a new object immediately before the SQL `INSERT` call.
     This provides an opportunity to do things like encode JSON or provide default values for certain fields.

         (pre-insert [query]
           (let [defaults {:version 1}]
             (merge defaults query))) ; set some default values")

  (post-insert [this]
    "Gets called by `insert!` with an object that was newly inserted into the database.
     This provides an opportunity to trigger specific logic that should occur when an object is inserted or modify the object that is returned.
     The value returned by this method is returned to the caller of `insert!`. The default implementation is `identity`.

       (post-insert [user]
         (assoc user :newly-created true))

       (post-insert [user]
         (u/prog1 user
           (add-user-to-magic-perm-groups! <>)))")

  (pre-update [this]
    "Called by `update!` before DB operations happen. A good place to set updated values for fields like `updated_at`.")

  (post-select [this]
    "Called on the results from a call to `select`. Default implementation doesn't do anything, but
     you can provide custom implementations to do things like add hydrateable keys or remove sensitive fields.")

  (pre-cascade-delete [this]
    "Called by `cascade-delete!` for each matching object that is about to be deleted.
     Implementations should delete any objects related to this object by recursively
     calling `cascade-delete!`.

     The output of this function is ignored.

        (pre-cascade-delete [{database-id :id :as database}]
          (cascade-delete! Card :database_id database-id)
          ...)")

  (can-read? ^Boolean [instance], ^Boolean [entity, ^Integer id]
   "Return whether `*current-user*` has *read* permissions for an object. You should use one of these implmentations:

     *  `(constantly true)`
     *  `superuser?`
     *  `(partial current-user-has-full-permissions? :read)` (you must also implement `perms-objects-set` to use this)
     *  `(partial current-user-has-partial-permissions? :read)` (you must also implement `perms-objects-set` to use this)")

  (can-write? ^Boolean [instance], ^Boolean [entity, ^Integer id]
   "Return whether `*current-user*` has *write* permissions for an object. You should use one of these implmentations:

     *  `(constantly true)`
     *  `superuser?`
     *  `(partial current-user-has-full-permissions? :write)` (you must also implement `perms-objects-set` to use this)
     *  `(partial current-user-has-partial-permissions? :write)` (you must also implement `perms-objects-set` to use this)")

  (default-fields ^clojure.lang.Sequential [this]
    "Return a sequence of keyword field names that should be fetched by default when calling `select` or invoking the entity (e.g., `(Database 1)`).")

  (timestamped? ^Boolean [this]
    "Should `:created_at` and `:updated_at` be updated when calling `insert!`, and `:updated_at` when calling `update!`? Default is `false`.")

  (hydration-keys ^clojure.lang.Sequential [this]
    "Return a sequence of keyword field names that should be hydrated to this model. For example, `User` might inclide `:creator`, which means `hydrate`
     will look for `:creator_id` in other objects and fetch the corresponding `Users`.")

  (types ^clojure.lang.IPersistentMap [this]
    "Return a map of keyword field names to their types for fields that should be serialized/deserialized in a special way. Valid types are `:json`, `:keyword`, or `:clob`.

     *  `:json` serializes objects as JSON strings before going into the DB, and parses JSON strings when coming out
     *  `:keyword` calls `u/keyword->qualified-name` before going into the DB, and `keyword` when coming out
     *  `:clob` converts clobs to Strings (via `metabase.util/jdbc-clob->str`) when coming out

       (types [_] {:cards :json}) ; encode `:cards` as JSON when stored in the DB")

  (perms-objects-set [this, ^clojure.lang.Keyword read-or-write]
    "Return a set of permissions object paths that a user must have access to in order to access this object. This should be something like #{\"/db/1/schema/public/table/20/\"}.
     READ-OR-WRITE will be either `:read` or `:write`, depending on which permissions set we're fetching (these will be the same sets for most models; they can ignore this param)."))


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
   :keyword {:in  u/keyword->qualified-name
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

(defn- throw-no-implementation-exception [method-name]
  (fn [this & _] (throw (UnsupportedOperationException. (format "No implementation of %s for %s; please provide one." method-name (class this))))))

(def IEntityDefaults
  "Default implementations for `IEntity` methods."
  {:default-fields     (constantly nil)
   :timestamped?       (constantly false)
   :hydration-keys     (constantly nil)
   :types              (constantly nil)
   :can-read?          (throw-no-implementation-exception "can-read?")
   :can-write?         (throw-no-implementation-exception "can-write?")
   :pre-insert         identity
   :post-insert        identity
   :pre-update         identity
   :post-select        identity
   :pre-cascade-delete (constantly nil)
   :perms-objects-set  (throw-no-implementation-exception "perms-objects-set")})

(defn- invoke-entity
  "Fetch an object with a specific ID or all objects of type ENTITY from the DB.
     (invoke-entity Database)           -> seq of all databases
     (invoke-entity Database 1)         -> Database w/ ID 1
     (invoke-entity Database :id 1 ...) -> A single Database matching some key-value args"
  ([entity]
   ((resolve 'metabase.db/select) entity))
  ([entity id]
   (when id
     (invoke-entity entity :id id)))
  ([entity k v & more]
   (apply (resolve 'metabase.db/select-one) entity k v more)))

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
   `User` is `metabase.models.user/UserInstance`. This class is used for both the titular entity (e.g. `User`) and
   for objects that are fetched from the DB. This means they can share the `IEntity` protocol and simplifies the interface
   somewhat; functions like `types` work on either the entity or instances fetched from the DB.

     (defentity User :metabase_user) ; creates class `UserInstance` and DB entity `User`

     (metabase.db/select User, ...)  ; use with `metabase.db` functions. All results are instances of `UserInstance`

   The record type automatically extends `IEntity` with `IEntityDefaults`, but you may call `extend` again if you need to
   override default behaviors:

     (u/strict-extend (class User)             ; it's somewhat more readable to write `(class User)` instead `UserInstance`
       IEntity (merge IEntityDefaults
                      {...}))

   Finally, the entity itself is invokable. Calling with no args returns *all* values of that object; calling with a single
   arg can be used to fetch a specific instance by its integer ID.

     (Database)                       ; return a seq of *all* Databases (as instances of `DatabaseInstance`)
     (Database 1)                     ; return Database 1"
  {:arglists     '([entity table-name] [entity docstr? table-name])
   :style/indent 2}
  [entity & args]
  (let [[docstr [table-name]] (u/optional string? args)
        instance              (symbol (str entity "Instance"))
        map->instance         (symbol (str "map->" instance))]
    `(do
       (defrecord ~instance []
         clojure.lang.Named
         (~'getName [~'_]
          ~(name entity))

         clojure.lang.IFn
         (~'invoke [this#]
          (invoke-entity-or-instance this#))
         (~'invoke [this# id#]
          (invoke-entity-or-instance this# id#))
         (~'invoke [this# arg1# arg2#]
          (invoke-entity-or-instance this# arg1# arg2#))
         (~'invoke [this# arg1# arg2# arg3#]
          (invoke-entity-or-instance this# arg1# arg2# arg3#))
         (~'invoke [this# arg1# arg2# arg3# arg4#]
          (invoke-entity-or-instance this# arg1# arg2# arg3# arg4#))
         (~'invoke [this# arg1# arg2# arg3# arg4# arg5#]
          (invoke-entity-or-instance this# arg1# arg2# arg3# arg4# arg5#))
         (~'invoke [this# arg1# arg2# arg3# arg4# arg5# arg6#]
          (invoke-entity-or-instance this# arg1# arg2# arg3# arg4# arg5# arg6#))
         (~'invoke [this# arg1# arg2# arg3# arg4# arg5# arg6# arg7#]
          (invoke-entity-or-instance this# arg1# arg2# arg3# arg4# arg5# arg6# arg7#))
         (~'invoke [this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8#]
          (invoke-entity-or-instance this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8#))
         (~'invoke [this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9#]
          (invoke-entity-or-instance this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9#))
         (~'invoke [this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10#]
          (invoke-entity-or-instance this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10#))
         (~'invoke [this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11#]
          (invoke-entity-or-instance this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11#))
         (~'invoke [this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11# arg12#]
          (invoke-entity-or-instance this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11# arg12#))
         (~'invoke [this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11# arg12# arg13#]
          (invoke-entity-or-instance this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11# arg12# arg13#))
         (~'invoke [this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11# arg12# arg13# arg14#]
          (invoke-entity-or-instance this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11# arg12# arg13# arg14#))
         (~'invoke [this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11# arg12# arg13# arg14# arg15#]
          (invoke-entity-or-instance this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11# arg12# arg13# arg14# arg15#))
         (~'invoke [this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11# arg12# arg13# arg14# arg15# arg16#]
          (invoke-entity-or-instance this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11# arg12# arg13# arg14# arg15# arg16#))
         (~'invoke [this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11# arg12# arg13# arg14# arg15# arg16# arg17#]
          (invoke-entity-or-instance this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11# arg12# arg13# arg14# arg15# arg16# arg17#))
         (~'invoke [this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11# arg12# arg13# arg14# arg15# arg16# arg17# arg18#]
          (invoke-entity-or-instance this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11# arg12# arg13# arg14# arg15# arg16# arg17# arg18#))
         (~'invoke [this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11# arg12# arg13# arg14# arg15# arg16# arg17# arg18# arg19#]
          (invoke-entity-or-instance this# arg1# arg2# arg3# arg4# arg5# arg6# arg7# arg8# arg9# arg10# arg11# arg12# arg13# arg14# arg15# arg16# arg17# arg18# arg19#)))

       (u/strict-extend ~instance
         IEntity        IEntityDefaults
         ICreateFromMap {:map-> (u/drop-first-arg ~map->instance)})

       (def ~(vary-meta entity assoc
                        :tag      (symbol (str (namespace-munge *ns*) \. instance))
                        :arglists ''([] [id] [& kvs])
                        :doc      (or docstr
                                      (format "Entity for '%s' table; instance of %s." (name table-name) instance)))
         (~map->instance {:table   ~table-name
                          :name    ~(name entity)
                          ::entity true})))))


;;; ------------------------------------------------------------ New Permissions Stuff ------------------------------------------------------------

(defn superuser?
  "Is `*current-user*` is a superuser? Ignores args.
   Intended for use as an implementation of `can-read?` and/or `can-write?`."
  [& _]
  @(resolve 'metabase.api.common/*is-superuser?*))


(defn- current-user-permissions-set []
  @@(resolve 'metabase.api.common/*current-user-permissions-set*))

(defn- current-user-has-root-permissions? ^Boolean []
  (contains? (current-user-permissions-set) "/"))

(defn- make-perms-check-fn [perms-check-fn-symb]
  (fn -has-perms?
    ([read-or-write entity object-id]
     (or (current-user-has-root-permissions?)
         (-has-perms? read-or-write (entity object-id))))
    ([read-or-write object]
     (and object
          ((resolve perms-check-fn-symb) (current-user-permissions-set) (perms-objects-set object read-or-write))))))

(def ^{:arglists '([read-or-write entity object-id] [read-or-write object])}
  ^Boolean current-user-has-full-permissions?
  "Implementation of `can-read?`/`can-write?` for the new permissions system.
   `true` if the current user has *full* permissions for the paths returned by its implementation of `perms-objects-set`.
   (READ-OR-WRITE is either `:read` or `:write` and passed to `perms-objects-set`; you'll usually want to partially bind it in the implementation map)."
  (make-perms-check-fn 'metabase.models.permissions/set-has-full-permissions-for-set?))

(def ^{:arglists '([read-or-write entity object-id] [read-or-write object])}
  ^Boolean current-user-has-partial-permissions?
  "Implementation of `can-read?`/`can-write?` for the new permissions system.
   `true` if the current user has *partial* permissions for the paths returned by its implementation of `perms-objects-set`.
   (READ-OR-WRITE is either `:read` or `:write` and passed to `perms-objects-set`; you'll usually want to partially bind it in the implementation map)."
  (make-perms-check-fn 'metabase.models.permissions/set-has-partial-permissions-for-set?))

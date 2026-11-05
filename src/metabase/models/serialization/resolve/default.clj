(ns metabase.models.serialization.resolve.default
  "Database-backed implementations of the serdes resolver protocols.

  These are the default resolvers used during normal serdes export/import
  against the application database."
  (:require
   [metabase.models.db :as models.db]
   [metabase.models.interface :as mi]
   [metabase.models.serialization.path :as serdes.path]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defn- inaccessible-error
  [entity-name portable-ref]
  (ex-info (tru "{0} {1} does not exist or you don''t have access to it." entity-name (pr-str portable-ref))
           {:status-code 400}))

(defn- maybe-check-accessible
  "Returns `entity` when it exists and, with the `check-read?` option, the current user can read it; throws the same
  error otherwise. The other option, `create?`, makes the import functions synthesize a missing entity instead."
  [entity {:keys [check-read?]} entity-name portable-ref]
  (when-not (and entity (or (not check-read?) (mi/can-read? entity)))
    (throw (inaccessible-error entity-name portable-ref)))
  entity)

;;; ============================================================
;;; Export functions
;;; ============================================================

(defn- portable-id
  [model entity]
  (let [path (mapv :id (serdes.path/generate-path (name model) entity))]
    (if (= (count path) 1)
      (first path)
      path)))

(defn export-fk
  "Given a numeric foreign key and its model, looks up the entity by ID and gets its entity ID or identity hash."
  [id model {:keys [check-read?] :as opts}]
  (when id
    (let [entity (models.db/entity-by-own-pk model id)]
      (when (and (nil? entity) (not check-read?))
        (throw (ex-info "FK target not found" {:model model
                                               :id    id
                                               :skip  true
                                               :metabase.models.serialization/type :target-not-found})))
      (portable-id model (maybe-check-accessible entity opts (name model) id)))))

(defn export-fk-keyed
  "Given a numeric ID, look up a different identifying field for that entity."
  [id model field {:keys [check-read?] :as opts}]
  (when id
    (if check-read?
      (get (maybe-check-accessible (models.db/entity-by-own-pk model id) opts (name model) id) field)
      (models.db/entity-field model id field))))

(defn export-user
  "Export a user as their email address."
  [id]
  (when id (export-fk-keyed id 'User :email {})))

(defn export-table-fk
  "Given a numeric table_id, return a portable table reference [db-name schema table-name]."
  [table-id {:keys [check-read?] :as opts}]
  (when table-id
    (let [table (cond-> (models.db/entity-by-own-pk :model/Table table-id)
                  check-read? (maybe-check-accessible opts "Table" table-id))]
      [(models.db/database-name (:db_id table)) (:schema table) (:name table)])))

(defn export-field-fk
  "Given a numeric field_id, return a portable field reference [db-name schema table-name field-name]."
  [resolver field-id {:keys [check-read?]}]
  (when field-id
    (let [fields (serdes.path/field-hierarchy field-id)]
      (when (and check-read? (empty? fields))
        (throw (inaccessible-error "Field" field-id)))
      (let [[db-name schema table-name] (resolve/export-table-fk resolver (:table_id (first fields)))]
        (into [db-name schema table-name] (map :name) fields)))))

;;; ============================================================
;;; Import functions
;;; ============================================================

(defn import-fk
  "Given a portable ID and model, return the numeric PK."
  [eid model {:keys [check-read?] :as opts}]
  (when eid
    (let [eid    (if (vector? eid) (last eid) eid)
          entity (serdes.path/lookup-by-id model eid)]
      (when (and (nil? entity) (not check-read?))
        (throw (ex-info "Could not find foreign key target - bad serdes dependencies or other serialization error"
                        {:entity_id eid :model (name model)
                         :metabase.models.serialization/type :target-not-found})))
      (get (maybe-check-accessible entity opts (name model) eid) (first (t2/primary-keys model))))))

(defn import-fk-keyed
  "Given a portable identifying field value, return the numeric :id."
  [portable model field]
  (models.db/pk-by-field model field portable))

(defn import-user
  "Import a user by email, creating one if needed and allowed. Returns PK."
  [resolver email {:keys [create?]}]
  (when email
    (or (resolve/import-fk-keyed resolver email 'User :email)
        (if create?
          ;; Need to break a circular dependency here.
          (:id ((clojure.core/resolve 'metabase.users.models.user/serdes-synthesize-user!) {:email email :is_active false}))
          (throw (inaccessible-error "User" email))))))

(defn- synthesize-database!
  "Creates a new stub Database for a deserialized reference whose name doesn't match any existing row. Returns the new
  database id."
  [db-name]
  (models.db/insert-stub-database! db-name))

(defn- synthesize-table!
  "Creates a new inactive Table for a deserialized reference whose `[db-name schema table-name]`
  triple doesn't match any existing row. Returns the new table id."
  [db-id schema table-name]
  (models.db/insert-inactive-table! db-id schema table-name))

(defn- synthesize-field!
  "Walks a field path from top-level to deepest, returning each existing field id and creating any
  missing ones as inactive Fields. Returns the leaf field id."
  [table-id field-names]
  (loop [parent-id nil
         remaining field-names]
    (if-let [field-name (first remaining)]
      (let [field-id (or (models.db/field-pk table-id field-name parent-id)
                         (models.db/insert-inactive-field! table-id parent-id field-name))]
        (recur field-id (rest remaining)))
      parent-id)))

(defn import-database-fk
  "Given a portable database name, return the numeric database id, synthesizing a stub Database for a missing one with
  `create?`."
  [db-name {:keys [create?] :as opts}]
  (when db-name
    (let [database (models.db/database-by-name db-name)]
      (if (and (nil? database) create?)
        (synthesize-database! db-name)
        (:id (maybe-check-accessible database opts "Database" db-name))))))

(defn import-table-fk
  "Given [db-name schema table-name], return numeric table_id, synthesizing an inactive Table for a missing one with
  `create?`."
  [resolver [db-name schema table-name :as table-id] {:keys [create?] :as opts}]
  (when table-id
    (let [db-id (resolve/import-database-fk resolver db-name)
          table (models.db/table-by-name table-name schema db-id)]
      (if (and (nil? table) create?)
        (synthesize-table! db-id schema table-name)
        (:id (maybe-check-accessible table opts "Table" table-id))))))

(defn import-field-fk
  "Given [db-name schema table-name field-name ...], return numeric field_id, synthesizing inactive Fields for the
  missing part of its parent chain with `create?`. Its Table already checked read access, which a Field inherits."
  [resolver [db-name schema table-name & fields :as field-id] {:keys [create?]}]
  (when field-id
    (let [table-id (resolve/import-table-fk resolver [db-name schema table-name])]
      (or (models.db/field-pk-in-path table-id (reverse fields))
          (if create?
            (synthesize-field! table-id fields)
            (throw (inaccessible-error "Field" field-id)))))))

;;; ============================================================
;;; Resolver constructors
;;; ============================================================

(defn- export-resolver
  [opts]
  (reify resolve/SerdesExportResolver
    (resolve/export-fk       [_ id model]       (export-fk id model opts))
    (resolve/export-fk-keyed [_ id model field] (export-fk-keyed id model field opts))
    (resolve/export-user     [_ id]             (export-user id))
    (resolve/export-table-fk [_ table-id]       (export-table-fk table-id opts))
    (resolve/export-field-fk [this field-id]    (export-field-fk this field-id opts))))

(defn- import-resolver
  [opts]
  (reify resolve/SerdesImportResolver
    (resolve/import-fk          [_ eid model]            (import-fk eid model opts))
    (resolve/import-fk-keyed    [_ portable model field] (import-fk-keyed portable model field))
    (resolve/import-user        [this email]             (import-user this email opts))
    (resolve/import-database-fk [_ db-name]              (import-database-fk db-name opts))
    (resolve/import-table-fk    [this path]              (import-table-fk this path opts))
    (resolve/import-field-fk    [this path]              (import-field-fk this path opts))))

(def ^:private default-import-opts
  {:create? true})

(def default-export-resolver
  "A stateless database-backed export resolver."
  (export-resolver {}))

(def default-import-resolver
  "A stateless database-backed import resolver that synthesizes missing Databases, Tables, Fields, and Users."
  (import-resolver default-import-opts))

(def strict-export-resolver
  "A stateless database-backed export resolver that throws the same 400 for an entity that is missing or that the current
  user cannot read."
  (export-resolver {:check-read? true}))

(def strict-import-resolver
  "A stateless database-backed import resolver that throws the same 400 for an entity that is missing or that the current
  user cannot read, instead of creating it."
  (import-resolver {:check-read? true}))

(def lenient-import-resolver
  "A stateless database-backed import resolver that returns nil for an unresolvable FK instead of throwing."
  (reify resolve/SerdesImportResolver
    (resolve/import-fk       [_ eid model]            (try (resolve/import-fk default-import-resolver eid model)
                                                           (catch ExceptionInfo e
                                                             (log/warnf "Failed to import FK: %s" (ex-message e))
                                                             nil)))
    (resolve/import-fk-keyed [_ portable model field] (resolve/import-fk-keyed default-import-resolver portable model field))
    (resolve/import-user     [_ email]                (resolve/import-user default-import-resolver email))
    (resolve/import-database-fk [_ db-name]           (resolve/import-database-fk default-import-resolver db-name))
    (resolve/import-table-fk [_ path]                 (resolve/import-table-fk default-import-resolver path))
    (resolve/import-field-fk [_ path]                 (resolve/import-field-fk default-import-resolver path))))

(defn cached-export-resolver
  "Returns a database-backed export resolver with memoized lookups."
  []
  (let [export-fk*       (memoize export-fk)
        export-fk-keyed* (memoize export-fk-keyed)
        export-user*     (memoize export-user)
        export-table-fk* (memoize export-table-fk)
        export-field-fk* (memoize export-field-fk)]
    (reify resolve/SerdesExportResolver
      (resolve/export-fk       [_ id model]       (export-fk* id model {}))
      (resolve/export-fk-keyed [_ id model field] (export-fk-keyed* id model field {}))
      (resolve/export-user     [_ id]             (export-user* id))
      (resolve/export-table-fk [_ table-id]       (export-table-fk* table-id {}))
      (resolve/export-field-fk [this field-id]    (export-field-fk* this field-id {})))))

(defn- cached
  "Return the value memoized in `cache` under `k`, computing and memoizing it with `f` when absent. Nil is not memoized."
  [cache k f]
  (if-some [v (get @cache k)]
    v
    (let [v (f)]
      (when (some? v)
        (swap! cache assoc k v))
      v)))

(defn cached-import-resolver
  "Returns a database-backed import resolver with memoized lookups, dropped by [[resolve/reset-cache!]]."
  []
  (let [cache (atom {})]
    (reify
      resolve/SerdesImportResolver
      (import-fk          [_ eid model]            (cached cache [:fk eid model] #(import-fk eid model default-import-opts)))
      (import-fk-keyed    [_ portable model field] (cached cache [:fk-keyed portable model field]
                                                           #(import-fk-keyed portable model field)))
      (import-user        [this email]             (cached cache [:user email] #(import-user this email default-import-opts)))
      (import-database-fk [_ db-name]              (cached cache [:database db-name] #(import-database-fk db-name default-import-opts)))
      (import-table-fk    [this path]              (cached cache [:table path] #(import-table-fk this path default-import-opts)))
      (import-field-fk    [this path]              (cached cache [:field path] #(import-field-fk this path default-import-opts)))

      resolve/ResettableCache
      (reset-cache! [_] (reset! cache {})))))

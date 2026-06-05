(ns metabase.models.serialization.resolve.db
  "Database-backed implementations of the serdes resolver protocols.

  These are the default resolvers used during normal serdes export/import
  against the application database."
  (:require
   [metabase.models.serialization :as serdes]
   [metabase.models.serialization.resolve :as resolve]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ============================================================
;;; Export functions
;;; ============================================================

(defn export-fk
  "Given a numeric foreign key and its model, looks up the entity by ID and gets its entity ID or identity hash."
  [id model]
  (when id
    (let [model-name (name model)
          entity     (t2/select-one model (first (t2/primary-keys model)) id)
          path       (when entity
                       (mapv :id (serdes/generate-path model-name entity)))]
      (cond
        (nil? entity)      (throw (ex-info "FK target not found" {:model model
                                                                  :id    id
                                                                  :skip  true
                                                                  :metabase.models.serialization/type :target-not-found}))
        (= (count path) 1) (first path)
        :else              path))))

(defn export-fk-keyed
  "Given a numeric ID, look up a different identifying field for that entity."
  [id model field]
  (t2/select-one-fn field model :id id))

(defn export-user
  "Export a user as their email address."
  [resolver id]
  (when id (resolve/export-fk-keyed resolver id 'User :email)))

(defn export-table-fk
  "Given a numeric table_id, return a portable table reference [db-name schema table-name]."
  [table-id]
  (when table-id
    (let [{:keys [db_id name schema]} (t2/select-one :model/Table :id table-id)
          db-name                     (t2/select-one-fn :name :model/Database :id db_id)]
      [db-name schema name])))

(defn export-field-fk
  "Given a numeric field_id, return a portable field reference [db-name schema table-name field-name]."
  [resolver field-id]
  (when field-id
    (let [fields                      (serdes/field-hierarchy field-id)
          [db-name schema field-name] (resolve/export-table-fk resolver (:table_id (first fields)))]
      (into [db-name schema field-name] (map :name fields)))))

;;; ============================================================
;;; Import functions
;;; ============================================================

(defn import-fk
  "Given a portable ID and model, return the numeric PK."
  [eid model]
  (when eid
    (let [eid    (if (vector? eid) (last eid) eid)
          entity (serdes/lookup-by-id model eid)]
      (if entity
        (get entity (first (t2/primary-keys model)))
        (throw (ex-info "Could not find foreign key target - bad serdes dependencies or other serialization error"
                        {:entity_id eid :model (name model)}))))))

(defn import-fk-keyed
  "Given a portable identifying field value, return the numeric :id."
  [portable model field]
  (t2/select-one-pk model field portable))

(defn import-user
  "Import a user by email, creating if needed. Returns PK."
  [resolver email]
  (when email
    (or (resolve/import-fk-keyed resolver email 'User :email)
        ;; Need to break a circular dependency here.
        (:id ((clojure.core/resolve 'metabase.users.models.user/serdes-synthesize-user!) {:email email :is_active false})))))

(defn- synthesize-table!
  "Creates a new inactive Table for a deserialized reference whose `[db-name schema table-name]`
  triple doesn't match any existing row. Returns the new table id."
  [db-id schema table-name]
  (:id (t2/insert-returning-instance! :model/Table
                                      {:db_id  db-id
                                       :schema schema
                                       :name   table-name
                                       :active false})))

(defn- synthesize-field!
  "Walks a field path from top-level to deepest, returning each existing field id and creating any
  missing ones as inactive Fields. Returns the leaf field id."
  [table-id field-names]
  (loop [parent-id nil
         remaining field-names]
    (if-let [field-name (first remaining)]
      (let [field-id (or (t2/select-one-pk :model/Field
                                           :table_id  table-id
                                           :name      field-name
                                           :parent_id parent-id)
                         (t2/insert-returning-pk! :model/Field
                                                  {:table_id      table-id
                                                   :parent_id     parent-id
                                                   :name          field-name
                                                   :active        false
                                                   :base_type     :type/*
                                                   :database_type "NULL"}))]
        (recur field-id (rest remaining)))
      parent-id)))

(defn import-table-fk
  "Given [db-name schema table-name], return numeric table_id. If the database exists but the table
  doesn't, synthesize an inactive Table from the path so we can still resolve the reference."
  [[db-name schema table-name :as table-id]]
  (when table-id
    (if-let [db-id (t2/select-one-fn :id :model/Database :name db-name)]
      (or (t2/select-one-fn :id :model/Table :name table-name :schema schema :db_id db-id)
          (synthesize-table! db-id schema table-name))
      (throw (ex-info (format "table id present, but database not found: %s" table-id)
                      {:table-id table-id
                       :database-names (sort (t2/select-fn-vec :name :model/Table))})))))

(defn import-field-fk
  "Given [db-name schema table-name field-name ...], return numeric field_id. If part of the parent
  chain is missing, synthesize inactive Fields for the missing nodes so we can still resolve the
  reference."
  [resolver [db-name schema table-name & fields :as field-id]]
  (when field-id
    (let [table-id (resolve/import-table-fk resolver [db-name schema table-name])
          field-q  (serdes/recursively-find-field-q table-id (reverse fields))]
      (or (t2/select-one-pk :model/Field field-q)
          (synthesize-field! table-id fields)))))

;;; ============================================================
;;; Resolver constructors
;;; ============================================================

(def default-export-resolver
  "A stateless database-backed export resolver."
  (reify resolve/SerdesExportResolver
    (export-fk       [_ id model]       (export-fk id model))
    (export-fk-keyed [_ id model field] (export-fk-keyed id model field))
    (export-user     [this id]          (export-user this id))
    (export-table-fk [_ table-id]       (export-table-fk table-id))
    (export-field-fk [this field-id]    (export-field-fk this field-id))))

(def default-import-resolver
  "A stateless database-backed import resolver."
  (reify resolve/SerdesImportResolver
    (import-fk       [_ eid model]            (import-fk eid model))
    (import-fk-keyed [_ portable model field] (import-fk-keyed portable model field))
    (import-user     [this email]             (import-user this email))
    (import-table-fk [_ path]                (import-table-fk path))
    (import-field-fk [this path]             (import-field-fk this path))))

(defn cached-export-resolver
  "Returns a database-backed export resolver with memoized lookups."
  []
  (let [export-fk*       (memoize export-fk)
        export-fk-keyed* (memoize export-fk-keyed)
        export-user*     (memoize export-user)
        export-table-fk* (memoize export-table-fk)
        export-field-fk* (memoize export-field-fk)]
    (reify resolve/SerdesExportResolver
      (export-fk       [_ id model]       (export-fk* id model))
      (export-fk-keyed [_ id model field] (export-fk-keyed* id model field))
      (export-user     [this id]          (export-user* this id))
      (export-table-fk [_ table-id]       (export-table-fk* table-id))
      (export-field-fk [this field-id]    (export-field-fk* this field-id)))))

(defn cached-import-resolver
  "Returns a database-backed import resolver with memoized lookups."
  []
  (let [import-fk*       (memoize import-fk)
        import-fk-keyed* (memoize import-fk-keyed)
        import-user*     (memoize import-user)
        import-table-fk* (memoize import-table-fk)
        import-field-fk* (memoize import-field-fk)]
    (reify resolve/SerdesImportResolver
      (import-fk       [_ eid model]            (import-fk* eid model))
      (import-fk-keyed [_ portable model field] (import-fk-keyed* portable model field))
      (import-user     [this email]             (import-user* this email))
      (import-table-fk [_ path]                (import-table-fk* path))
      (import-field-fk [this path]             (import-field-fk* this path)))))

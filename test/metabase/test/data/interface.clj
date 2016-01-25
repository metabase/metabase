(ns metabase.test.data.interface
  "`Definition` types for databases, tables, fields; related protocols, helper functions.

   Objects that implement `IDatasetLoader` know how to load a `DatabaseDefinition` into an
   actual physical RDMS database. This functionality allows us to easily test with multiple datasets."
  (:require [clojure.string :as s]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field] :as field]
                             [table :refer [Table]]))
  (:import clojure.lang.Keyword))

(defrecord FieldDefinition [^String  field-name
                            ^Keyword base-type
                            ^Keyword field-type
                            ^Keyword special-type
                            ^Keyword fk])

(defrecord TableDefinition [^String table-name
                            field-definitions
                            rows])

(defrecord DatabaseDefinition [^String database-name
                               table-definitions
                               ;; Optional. Set this to non-nil to let dataset loaders know that we don't intend to keep it
                               ;; for long -- they can adjust connection behavior, e.g. choosing simple connections instead of creating pools.
                               ^Boolean short-lived?])

(defn escaped-name
  "Return escaped version of database name suitable for use as a filename / database name / etc."
  ^String [^DatabaseDefinition database-definition]
  (s/replace (:database-name database-definition) #"\s+" "_"))


(defprotocol IMetabaseInstance
  (metabase-instance [this context]
    "Return the Metabase object associated with this definition, if applicable. CONTEXT should be the parent
     object of the Metabase object to return (e.g., a pass a `Table` to a `FieldDefintion`). For a `DatabaseDefinition`,
     pass the engine keyword."))

(extend-protocol IMetabaseInstance
  FieldDefinition
  (metabase-instance [this table]
    (sel :one Field :table_id (:id table), :name [in #{(s/lower-case (:field-name this)) ; HACKY!
                                                       (s/upper-case (:field-name this))}]))

  TableDefinition
  (metabase-instance [this database]
    (sel :one Table :db_id (:id database), :name [in #{(s/lower-case (:table-name this))
                                                       (s/upper-case (:table-name this))}]))

  DatabaseDefinition
  (metabase-instance [{:keys [database-name]} engine-kw]
    (assert (string? database-name))
    (assert (keyword? engine-kw))
    (setup-db-if-needed :auto-migrate true)
    (sel :one Database :name database-name, :engine (name engine-kw))))


;; ## IDatasetLoader

(defprotocol IDatasetLoader
  "Methods for creating, deleting, and populating *pyhsical* DBMS databases, tables, and fields.
   Methods marked *OPTIONAL* have default implementations in `IDatasetLoaderDefaultsMixin`."
  (engine [this]
    "Return the engine keyword associated with this database, e.g. `:h2` or `:mongo`.")

  (database->connection-details [this ^Keyword context, ^DatabaseDefinition database-definition]
    "Return the connection details map that should be used to connect to this database (i.e. a Metabase `Database` details map)
     CONTEXT is one of:

     *  `:server` - Return details for making the connection in a way that isn't DB-specific (e.g., for creating/destroying databases)
     *  `:db`     - Return details for connecting specifically to the DB.")

  (create-db! [this ^DatabaseDefinition database-definition]
    "Create a new database from DATABASE-DEFINITION, including adding tables, fields, and foreign key constraints,
     and add the appropriate data. This method should drop existing databases with the same name if applicable.
     (This refers to creating the actual *DBMS* database itself, *not* a Metabase `Database` object.)")

  (destroy-db! [this ^DatabaseDefinition database-definition]
    "Destroy database, if any, associated with DATABASE-DEFINITION.
     This refers to destroying a *DBMS* database -- removing an H2 file, dropping a Postgres database, etc.
     This does not need to remove corresponding Metabase definitions -- this is handled by `DatasetLoader`.")

  (default-schema [this]
    "*OPTIONAL* Return the default schema name that tables for this DB should be expected to have.")

  (expected-base-type->actual [this base-type]
    "*OPTIONAL*. Return the base type type that is actually used to store `Fields` of BASE-TYPE.
     The default implementation of this method is an identity fn. This is provided so DBs that don't support a given BASE-TYPE used in the test data
     can specifiy what type we should expect in the results instead.
     For example, Oracle has `INTEGER` data types, so `:IntegerField` test values are instead stored as `NUMBER`, which we map to `:DecimalField`.")

  (format-name [this table-or-field-name]
    "*OPTIONAL* Transform a lowercase string `Table` or `Field` name in a way appropriate for this dataset
     (e.g., `h2` would want to upcase these names; `mongo` would want to use `\"_id\"` in place of `\"id\"`.")

  (has-questionable-timezone-support? [this]
    "*OPTIONAL*. Does this driver have \"questionable\" timezone support? (i.e., does it group things by UTC instead of the `US/Pacific` when we're testing?)
     Defaults to `(not (contains? (metabase.driver/features this) :set-timezone)`")

  (id-field-type [this]
    "*OPTIONAL* Return the `base_type` of the `id` `Field` (e.g. `:IntegerField` or `:BigIntegerField`). Defaults to `:IntegerField`."))

(def IDatasetLoaderDefaultsMixin
  {:expected-base-type->actual         (fn [_ base-type] base-type)
   :default-schema                     (constantly nil)
   :format-name                        (fn [_ table-or-field-name]
                                         table-or-field-name)
   :has-questionable-timezone-support? (fn [driver]
                                         (not (contains? (driver/features driver) :set-timezone)))
   :id-field-type                      (constantly :IntegerField)})


;; ## Helper Functions for Creating New Definitions

(defn create-field-definition
  "Create a new `FieldDefinition`; verify its values."
  ^FieldDefinition [{:keys [field-name base-type field-type special-type fk], :as field-definition-map}]
  (assert (or (contains? field/base-types base-type)
              (and (map? base-type)
                   (string? (:native base-type))))
    (str (format "Invalid field base type: '%s'\n" base-type)
         "Field base-type should be either a valid base type like :TextField or be some native type wrapped in a map, like {:native \"JSON\"}."))
  (when field-type
    (assert (contains? field/field-types field-type)))
  (when special-type
    (assert (contains? field/special-types special-type)))
  (map->FieldDefinition field-definition-map))

(defn create-table-definition
  "Convenience for creating a `TableDefinition`."
  ^TableDefinition [^String table-name field-definition-maps rows]
  (map->TableDefinition {:table-name          table-name
                         :rows                rows
                         :field-definitions   (mapv create-field-definition field-definition-maps)}))

(defn create-database-definition
  "Convenience for creating a new `DatabaseDefinition`."
  ^DatabaseDefinition [^String database-name & table-name+field-definition-maps+rows]
  {:pre [(string? database-name)
         (not (s/blank? database-name))]}
  (map->DatabaseDefinition {:database-name     database-name
                            :table-definitions (mapv (partial apply create-table-definition)
                                                     table-name+field-definition-maps+rows)}))

(defmacro def-database-definition
  "Convenience for creating a new `DatabaseDefinition` named by the symbol DATASET-NAME."
  [^clojure.lang.Symbol dataset-name & table-name+field-definition-maps+rows]
  {:pre [(symbol? dataset-name)]}
  `(def ~(vary-meta dataset-name assoc :tag DatabaseDefinition)
     (create-database-definition ~(name dataset-name)
       ~@table-name+field-definition-maps+rows)))


;;; ## Convenience + Helper Functions
;; TODO - should these go here, or in `metabase.test.data`?

(defn get-tabledef
  "Return `TableDefinition` with TABLE-NAME in DBDEF."
  [^DatabaseDefinition dbdef, ^String table-name]
  (first (for [tabledef (:table-definitions dbdef)
               :when    (= (:table-name tabledef) table-name)]
           tabledef)))

(defn get-fielddefs
  "Return the `FieldDefinitions` associated with table with TABLE-NAME in DBDEF."
  [^DatabaseDefinition dbdef, ^String table-name]
  (:field-definitions (get-tabledef dbdef table-name)))

(defn dbdef->table->id->k->v
  "Return a map of table name -> map of row ID -> map of column key -> value."
  [^DatabaseDefinition dbdef]
  (into {} (for [{:keys [table-name field-definitions rows]} (:table-definitions dbdef)]
             {table-name (let [field-names (map :field-name field-definitions)]
                           (->> rows
                                (map (partial zipmap field-names))
                                (map-indexed (fn [i row]
                                               {(inc i) row}))
                                (into {})))})))

(defn- nest-fielddefs [^DatabaseDefinition dbdef, ^String table-name]
  (let [nest-fielddef (fn nest-fielddef [{:keys [fk field-name], :as fielddef}]
                        (if-not fk
                          [fielddef]
                          (let [fk (name fk)]
                            (for [nested-fielddef (mapcat nest-fielddef (get-fielddefs dbdef fk))]
                              (update nested-fielddef :field-name (partial vector field-name fk))))))]
    (mapcat nest-fielddef (get-fielddefs dbdef table-name))))

(defn- flatten-rows [^DatabaseDefinition dbdef, ^String table-name]
  (let [nested-fielddefs (nest-fielddefs dbdef table-name)
        table->id->k->v  (dbdef->table->id->k->v dbdef)
        resolve-field    (fn resolve-field [table id field-name]
                           (if (string? field-name)
                             (get-in table->id->k->v [table id field-name])
                             (let [[fk-from-name fk-table fk-dest-name] field-name
                                   fk-id                                (get-in table->id->k->v [table id fk-from-name])]
                               (resolve-field fk-table fk-id fk-dest-name))))]
    (for [id (range 1 (inc (count (:rows (get-tabledef dbdef table-name)))))]
      (for [{:keys [field-name]} nested-fielddefs]
        (resolve-field table-name id field-name)))))

(defn- flatten-field-name [field-name]
  (if (string? field-name)
    field-name
    (let [[_ fk-table fk-dest-name] field-name]
      (-> fk-table
          (clojure.string/replace #"ies$" "y")
          (clojure.string/replace #"s$" "")
          (str  \_ (flatten-field-name fk-dest-name))))))

(defn flatten-dbdef
  "Create a flattened version of DBDEF by following resolving all FKs and flattening all rows into the table with TABLE-NAME."
  [^DatabaseDefinition dbdef, ^String table-name]
  (create-database-definition (:database-name dbdef)
    [table-name
     (for [fielddef (nest-fielddefs dbdef table-name)]
       (update fielddef :field-name flatten-field-name))
     (flatten-rows dbdef table-name)]))

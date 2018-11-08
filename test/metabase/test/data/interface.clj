(ns metabase.test.data.interface
  "`Definition` types for databases, tables, fields; related protocols, helper functions.

   Objects that implement `IDriverTestExtensions` know how to load a `DatabaseDefinition` into an
   actual physical RDMS database. This functionality allows us to easily test with multiple datasets."
  (:require [clojure.string :as str]
            [clojure.tools.reader.edn :as edn]
            [environ.core :refer [env]]
            [metabase
             [db :as db]
             [driver :as driver]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [field :as field :refer [Field]]
             [table :refer [Table]]]
            [metabase.util.schema :as su]
            [schema.core :as s])
  (:import clojure.lang.Keyword))

(s/defrecord FieldDefinition [field-name      :- su/NonBlankString
                              base-type       :- (s/cond-pre {:native su/NonBlankString}
                                                             su/FieldType)
                              special-type    :- (s/maybe su/FieldType)
                              visibility-type :- (s/maybe (apply s/enum field/visibility-types))
                              fk              :- (s/maybe s/Keyword)
                              field-comment   :- (s/maybe su/NonBlankString)]
  nil
  :load-ns true)

(s/defrecord TableDefinition [table-name        :- su/NonBlankString
                              field-definitions :- [FieldDefinition]
                              rows              :- [[s/Any]]
                              table-comment     :- (s/maybe su/NonBlankString)]
  nil
  :load-ns true)

(s/defrecord DatabaseDefinition [database-name     :- su/NonBlankString
                                 table-definitions :- [TableDefinition]]
  nil
  :load-ns true)

(defn escaped-name
  "Return escaped version of database name suitable for use as a filename / database name / etc."
  ^String [^DatabaseDefinition {:keys [database-name]}]
  {:pre [(string? database-name)]}
  (str/replace database-name #"\s+" "_"))

(defn db-qualified-table-name
  "Return a combined table name qualified with the name of its database, suitable for use as an identifier.
  Provided for drivers where testing wackiness makes it hard to actually create separate Databases, such as Oracle,
  where this is disallowed on RDS. (Since Oracle can't create seperate DBs, we just create various tables in the same
  DB; thus their names must be qualified to differentiate them effectively.)"
  ^String [^String database-name, ^String table-name]
  {:pre [(string? database-name) (string? table-name)]}
  ;; take up to last 30 characters because databases like Oracle have limits on the lengths of identifiers
  (apply str (take-last 30 (str/replace (str/lower-case (str database-name \_ table-name)) #"-" "_"))))

(defn single-db-qualified-name-components
  "Implementation of `qualified-name-components` for drivers like Oracle and Redshift that must use a single existing
   DB for testing. This implementation simulates separate databases by doing two things:

     1.  Using a \"session schema\" to make sure each test run is isolated from other test runs
     2.  Embedding the name of the database into table names, e.g. to differentiate \"test_data_categories\" and
         \"tupac_sightings_categories\".

   To use this implementation, partially bind this function with a SESSION-SCHEMA:

     {:qualified-name-components (partial i/single-db-qualified-name-components my-session-schema-name)}"
  ([_              _ db-name]                       [db-name])
  ([session-schema _ db-name table-name]            [session-schema (db-qualified-table-name db-name table-name)])
  ([session-schema _ db-name table-name field-name] [session-schema (db-qualified-table-name db-name table-name) field-name]))

(defn default-aggregate-column-info
  "Default implementation of `aggregate-column-info` for drivers using the `IDriverTestExtensionsDefaultsMixin`."
  {:arglists '([driver aggregation-type] [driver aggregation-type field])}
  ([_ aggregation-type]
   ;; TODO - cumulative count doesn't require a FIELD !!!!!!!!!
   (assert (= aggregation-type) :count)
   {:base_type    :type/Integer
    :special_type :type/Number
    :name         "count"
    :display_name "count"
    :source       :aggregation})
  ([driver aggregation-type {:keys [base_type special_type]}]
   {:pre [base_type special_type]}
   (merge
    {:base_type    base_type
     :special_type special_type
     :settings     nil
     :name         (name aggregation-type)
     :display_name (name aggregation-type)
     :source       :aggregation}
    ;; count always gets the same special type regardless
    (when (= aggregation-type :count)
      (default-aggregate-column-info driver :count)))))


(defprotocol IMetabaseInstance
  (metabase-instance [this context]
    "Return the Metabase object associated with this definition, if applicable. CONTEXT should be the parent
     object (the actual instance, *not* the definition) of the Metabase object to return (e.g., a pass a `Table` to a
     `FieldDefintion`). For a `DatabaseDefinition`, pass the engine keyword."))

(extend-protocol IMetabaseInstance
  FieldDefinition
  (metabase-instance [this table]
    (Field :table_id (:id table), :%lower.name (str/lower-case (:field-name this))))

  TableDefinition
  (metabase-instance [this database]
    ;; Look first for an exact table-name match; otherwise allow DB-qualified table names for drivers that need them
    ;; like Oracle
    (or (Table :db_id (:id database), :%lower.name (str/lower-case (:table-name this)))
        (Table :db_id (:id database), :%lower.name (db-qualified-table-name (:name database) (:table-name this)))))

  DatabaseDefinition
  (metabase-instance [{:keys [database-name]} engine-kw]
    (assert (string? database-name))
    (assert (keyword? engine-kw))
    (db/setup-db-if-needed!, :auto-migrate true)
    (Database :name database-name, :engine (name engine-kw))))


;; ## IDriverTestExtensions

(defprotocol IDriverTestExtensions
  "Methods for creating, deleting, and populating *pyhsical* DBMS databases, tables, and fields.
   Methods marked *OPTIONAL* have default implementations in `IDriverTestExtensionsDefaultsMixin`."
  (engine ^clojure.lang.Keyword [this]
    "Return the engine keyword associated with this database, e.g. `:h2` or `:mongo`.")

  ;; TODO - should rename this to `database-definition->connection-details` to avoid confusion
  (database->connection-details [this, ^Keyword context, ^DatabaseDefinition database-definition]
    "Return the connection details map that should be used to connect to this database (i.e. a Metabase `Database`
     details map). CONTEXT is one of:

 *  `:server` - Return details for making the connection in a way that isn't DB-specific (e.g., for
                creating/destroying databases)
 *  `:db`     - Return details for connecting specifically to the DB.")

  (create-db!
    [this, ^DatabaseDefinition database-definition]
    [this, ^DatabaseDefinition database-definition {:keys [skip-drop-db?]}]
    "Create a new database from DATABASE-DEFINITION, including adding tables, fields, and foreign key constraints,
     and add the appropriate data. This method should drop existing databases with the same name if applicable, unless
     the skip-drop-db? arg is true. This is to workaround a scenario where the postgres driver terminates the
     connection before dropping the DB and causes some tests to fail.
     (This refers to creating the actual *DBMS* database itself, *not* a Metabase `Database` object.)

 Optional `options` as third param. Currently supported options include `skip-drop-db?`. If unspecified,`skip-drop-db?`
 should default to `false`.")

  (expected-base-type->actual [this base-type]
    "*OPTIONAL*. Return the base type type that is actually used to store `Fields` of BASE-TYPE.
     The default implementation of this method is an identity fn. This is provided so DBs that don't support a given
     BASE-TYPE used in the test data can specifiy what type we should expect in the results instead. For example,
     Oracle has no `INTEGER` data types, so `:type/Integer` test values are instead stored as `NUMBER`, which we map
     to `:type/Decimal`.")

  (format-name ^String [this, ^String table-or-field-name]
    "*OPTIONAL* Transform a lowercase string `Table` or `Field` name in a way appropriate for this dataset
     (e.g., `h2` would want to upcase these names; `mongo` would want to use `\"_id\"` in place of `\"id\"`.")

  (has-questionable-timezone-support? ^Boolean [this]
    "*OPTIONAL*. Does this driver have \"questionable\" timezone support? (i.e., does it group things by UTC instead
     of the `US/Pacific` when we're testing?).
     Defaults to `(not (contains? (metabase.driver/features this) :set-timezone)`")

  (id-field-type ^clojure.lang.Keyword [this]
    "*OPTIONAL* Return the `base_type` of the `id` `Field` (e.g. `:type/Integer` or `:type/BigInteger`). Defaults to
    `:type/Integer`.")

  (aggregate-column-info [this aggregation-type] [this aggregation-type field]
    "*OPTIONAL*. Return the expected type information that should come back for QP results as part of `:cols` for an
     aggregation of a given type (and applied to a given Field, when applicable)."))

(def IDriverTestExtensionsDefaultsMixin
  "Default implementations for the `IDriverTestExtensions` methods marked *OPTIONAL*."
  {:expected-base-type->actual         (u/drop-first-arg identity)
   :format-name                        (u/drop-first-arg identity)
   :has-questionable-timezone-support? (fn [driver]
                                         (not (contains? (driver/features driver) :set-timezone)))
   :id-field-type                      (constantly :type/Integer)
   :aggregate-column-info              default-aggregate-column-info})


;; ## Helper Functions for Creating New Definitions

(defn create-field-definition
  "Create a new `FieldDefinition`; verify its values."
  ^FieldDefinition [field-definition-map]
  (s/validate FieldDefinition (map->FieldDefinition field-definition-map)))

(defn create-table-definition
  "Convenience for creating a `TableDefinition`."
  ^TableDefinition [^String table-name, field-definition-maps rows]
  (s/validate TableDefinition (map->TableDefinition
                               {:table-name        table-name
                                :rows              rows
                                :field-definitions (mapv create-field-definition field-definition-maps)})))

(defn create-database-definition
  "Convenience for creating a new `DatabaseDefinition`."
  {:style/indent 1}
  ^DatabaseDefinition [^String database-name & table-name+field-definition-maps+rows]
  (s/validate DatabaseDefinition (map->DatabaseDefinition
                                  {:database-name     database-name
                                   :table-definitions (mapv (partial apply create-table-definition)
                                                            table-name+field-definition-maps+rows)})))

(def ^:private ^:const edn-definitions-dir "./test/metabase/test/data/dataset_definitions/")

(defn slurp-edn-table-def [dbname]
  (edn/read-string (slurp (str edn-definitions-dir dbname ".edn"))))

(defn update-table-def
  "Function useful for modifying a table definition before it's applied. Will invoke `UPDATE-TABLE-DEF-FN` on the vector
  of column definitions and `UPDATE-ROWS-FN` with the vector of rows in the database definition. `TABLE-DEF` is the
  database definition (typically used directly in a `def-database-definition` invocation)."
  [table-name-to-update update-table-def-fn update-rows-fn table-def]
  (vec
   (for [[table-name table-def rows :as orig-table-def] table-def]
     (if (= table-name table-name-to-update)
       [table-name
        (update-table-def-fn table-def)
        (update-rows-fn rows)]
       orig-table-def))))

(defmacro def-database-definition
  "Convenience for creating a new `DatabaseDefinition` named by the symbol DATASET-NAME."
  [^clojure.lang.Symbol dataset-name table-name+field-definition-maps+rows]
  {:pre [(symbol? dataset-name)]}
  `(def ~(vary-meta dataset-name assoc :tag DatabaseDefinition)
     (apply create-database-definition ~(name dataset-name) ~table-name+field-definition-maps+rows)))

(defmacro def-database-definition-edn [dbname]
  `(def-database-definition ~dbname
     ~(slurp-edn-table-def (name dbname))))

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
          (str/replace #"ies$" "y")
          (str/replace #"s$" "")
          (str  \_ (flatten-field-name fk-dest-name))))))

(defn flatten-dbdef
  "Create a flattened version of DBDEF by following resolving all FKs and flattening all rows into the table with
  TABLE-NAME."
  [^DatabaseDefinition dbdef, ^String table-name]
  (create-database-definition (:database-name dbdef)
    [table-name
     (for [fielddef (nest-fielddefs dbdef table-name)]
       (update fielddef :field-name flatten-field-name))
     (flatten-rows dbdef table-name)]))

(defn db-test-env-var
  "Look up test environment var `:ENV-VAR` for the given `:DATABASE-NAME` containing connection related parameters.
  If no `:default` param is specified and the var isn't found, throw.

     (db-test-env-var :mysql :user) ; Look up `MB_MYSQL_TEST_USER`"
  ([engine env-var]
   (db-test-env-var engine env-var nil))
  ([engine env-var default]
   (get env
        (keyword (format "mb-%s-test-%s" (name engine) (name env-var)))
        default)))

(defn- to-system-env-var-str
  "Converts the clojure environment variable form (a keyword) to a stringified version that will be specified at the
  system level

  i.e. :foo-bar -> FOO_BAR"
  [env-var-kwd]
  (-> env-var-kwd
      name
      (str/replace "-" "_")
      str/upper-case))

(defn db-test-env-var-or-throw
  "Same as `db-test-env-var` but will throw an exception if the variable is `nil`."
  ([engine env-var]
   (db-test-env-var-or-throw engine env-var nil))
  ([engine env-var default]
   (or (db-test-env-var engine env-var default)
       (throw (Exception. (format "In order to test %s, you must specify the env var MB_%s_TEST_%s."
                                  (name engine)
                                  (str/upper-case (name engine))
                                  (to-system-env-var-str env-var)))))))

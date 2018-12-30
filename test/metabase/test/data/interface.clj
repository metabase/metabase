(ns metabase.test.data.interface
  "`Definition` types for databases, tables, fields; related protocols, helper functions.

   Objects that implement `IDriverTestExtensions` know how to load a `DatabaseDefinition` into an
   actual physical RDMS database. This functionality allows us to easily test with multiple datasets.

   TODO - We should rename this namespace to `metabase.driver.test-extensions` or something like that."
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
            [metabase.plugins.classloader :as classloader]
            [metabase.test.data.env :as tx.env]
            [metabase.util
             [date :as du]
             [schema :as su]]
            [schema.core :as s])
  (:import clojure.lang.Keyword))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Dataset Definition Record Types                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Registering Test Extensions                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(driver/register! ::test-extensions, :abstract? true)

(defn has-test-extensions? [driver]
  (isa? driver/hierarchy driver ::test-extensions))

(defn add-test-extensions! [driver]
  ;; no-op during AOT compilation
  (when-not *compile-files*
    (driver/add-parent! driver ::test-extensions)
    (println "Added test extensions for" driver "💯")))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Loading Test Extensions                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(declare before-run after-run)

(defonce ^:private has-done-before-run (atom #{}))
(defonce ^:private do-before-run-lock (Object.))

;; this gets called below by `load-test-extensions-namespace-if-needed`
(defn- do-before-run-if-needed [driver]
  (when-not (@has-done-before-run driver)
    (locking do-before-run-lock
      (when-not (@has-done-before-run driver)
        (swap! has-done-before-run conj driver)
        (when-not (= (get-method before-run driver) (get-method before-run ::test-extensions))
          (println "doing before-run for" driver))
        (before-run driver)))))

;; after finishing all the tests, call each drivers' `after-run` implementation to do any cleanup needed
(defn- do-after-run
  {:expectations-options :after-run}
  []
  (doseq [driver (descendants driver/hierarchy ::test-extensions)
          :when (tx.env/test-drivers driver)]
    (when-not (= (get-method after-run driver) (get-method after-run ::test-extensions))
      (println "doing after-run for" driver))
    (after-run driver)))


(defonce ^:private require-lock (Object.))

(defn- require-driver-test-extensions-ns [driver & require-options]
  ;; similar to `metabase.driver/require-driver-ns` make sure our context classloader is correct, and that Clojure
  ;; will use it...
  (classloader/the-classloader)
  (binding [*use-context-classloader* true]
    (let [expected-ns (symbol (or (namespace driver)
                                  (str "metabase.test.data." (name driver))))]
      ;; ...and lock to make sure that multithreaded driver test-extension loading (on the off chance that it happens
      ;; in tests) doesn't make Clojure explode
      (locking require-lock
        (println (format "Loading driver %s test extensions %s"
                         (u/format-color 'blue driver) (apply list 'require expected-ns require-options)))
        (apply require expected-ns require-options)))))

(defn- load-test-extensions-namespace-if-needed [driver]
  (when-not (has-test-extensions? driver)
    (du/profile (format "Load %s test extensions" driver)
      (require-driver-test-extensions-ns driver)
      ;; if it doesn't have test extensions yet, it may be because it's relying on a parent driver to add them (e.g.
      ;; Redshift uses Postgres' test extensions). Load parents as appropriate and try again
      (when-not (has-test-extensions? driver)
        (doseq [parent (parents driver/hierarchy driver)
                ;; skip parents like `:metabase.driver/driver` and `:metabase.driver/concrete`
                :when  (not= (namespace parent) "metabase.driver")]
          (u/ignore-exceptions
            (load-test-extensions-namespace-if-needed parent)))
        ;; ok, hopefully it has test extensions now. If not, try again, but reload the entire driver namespace
        (when-not (has-test-extensions? driver)
          (require-driver-test-extensions-ns driver :reload)
          ;; if it *still* does not test extensions, throw an Exception
          (when-not (has-test-extensions? driver)
            (throw (Exception. (str "No test extensions found for " driver))))))))
  ;; do before-run if needed as well
  (do-before-run-if-needed driver))

(defn the-driver-with-test-extensions
  "Like `driver/the-driver`, but guaranteed to return a driver with test extensions loaded, throwing an Exception
  otherwise. Loads driver and test extensions automatically if not already done."
  [driver]
  (let [driver (driver/the-initialized-driver driver)]
    (load-test-extensions-namespace-if-needed driver)
    driver))

(defn dispatch-on-driver-with-test-extensions
  "Like `metabase.driver/dispatch-on-initialized-driver`, but loads test extensions if needed."
  [driver & _]
  (driver/dispatch-on-initialized-driver (the-driver-with-test-extensions driver)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Super-Helpful Util Fns                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn driver
  "Get the driver we should use for the current test (for functions like `data/db` and `data/id`). Defaults to `:h2`
  if no driver is specified. You can test against a different driver by using `driver/with-driver`."
  []
  (the-driver-with-test-extensions (or driver/*driver* :h2)))

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

  To use this implementation, pass a session schema along with other args:

    (defmethod qualified-name-components :my-driver [& args]
      (apply tx/single-db-qualified-name-components my-session-schema-name args))"
  ([_              _ db-name]                       [db-name])
  ([session-schema _ db-name table-name]            [session-schema (db-qualified-table-name db-name table-name)])
  ([session-schema _ db-name table-name field-name] [session-schema (db-qualified-table-name db-name table-name) field-name]))


(defmulti metabase-instance
  "Return the Metabase object associated with this definition, if applicable. CONTEXT should be the parent object (the
  actual instance, *not* the definition) of the Metabase object to return (e.g., a pass a `Table` to a
  `FieldDefintion`). For a `DatabaseDefinition`, pass the driver keyword."
  {:arglists '([db-or-table-or-field-def context])}
  (fn [db-or-table-or-field-def context] (class db-or-table-or-field-def)))

(defmethod metabase-instance FieldDefinition [this table]
  (Field :table_id (:id table), :%lower.name (str/lower-case (:field-name this))))

(defmethod metabase-instance TableDefinition [this database]
  ;; Look first for an exact table-name match; otherwise allow DB-qualified table names for drivers that need them
  ;; like Oracle
  (or (Table :db_id (:id database), :%lower.name (str/lower-case (:table-name this)))
      (Table :db_id (:id database), :%lower.name (db-qualified-table-name (:name database) (:table-name this)))))

(defmethod metabase-instance DatabaseDefinition [{:keys [database-name]} driver-kw]
  (assert (string? database-name))
  (assert (keyword? driver-kw))
  (db/setup-db-if-needed!, :auto-migrate true)
  (Database :name database-name, :engine (name driver-kw)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Interface (Multimethods)                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti before-run
  "Do any initialization needed before running tests for this driver, such as creating shared test databases. Use this
  in place of writing expectations `:before-run` functions, since the driver namespaces are lazily loaded and might
  not be loaded in time to register those functions with expectations.

  Will only be called once for a given driver; only called when running tests against that driver. This method does
  not need to call the implementation for any parent drivers; that is done automatically.

  DO NOT CALL THIS METHOD DIRECTLY; THIS IS CALLED AUTOMATICALLY WHEN APPROPRIATE."
  {:arglists '([driver])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod before-run ::test-extensions [_]) ; default-impl is a no-op


(defmulti after-run
  "Do any cleanup needed after tests are finished running, such as deleting test databases. Use this
  in place of writing expectations `:after-run` functions, since the driver namespaces are lazily loaded and might
  not be loaded in time to register those functions with expectations.

  Will only be called once for a given driver; only called when running tests against that driver. This method does
  not need to call the implementation for any parent drivers; that is done automatically.

  DO NOT CALL THIS METHOD DIRECTLY; THIS IS CALLED AUTOMATICALLY WHEN APPROPRIATE."
  {:arglists '([driver])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod after-run ::test-extensions [_]) ; default-impl is a no-op


(defmulti dbdef->connection-details
  "Return the connection details map that should be used to connect to the Database we will create for
  `database-definition`.

  *  `:server` - Return details for making the connection in a way that isn't DB-specific (e.g., for
                 creating/destroying databases)
  *  `:db`     - Return details for connecting specifically to the DB."
  {:arglists '([driver context database-definition])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)


(defmulti create-db!
  "Create a new database from `database-definition`, including adding tables, fields, and foreign key constraints,
  and add the appropriate data. This method should drop existing databases with the same name if applicable, unless
  the skip-drop-db? arg is true. This is to workaround a scenario where the postgres driver terminates the connection
  before dropping the DB and causes some tests to fail. (This refers to creating the actual *DBMS* database itself,
  *not* a Metabase `Database` object.)

  Optional `options` as third param. Currently supported options include `skip-drop-db?`. If unspecified,
  `skip-drop-db?` should default to `false`."
  {:arglists '([driver database-definition & {:keys [skip-drop-db?]}])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)


(defmulti expected-base-type->actual
  "Return the base type type that is actually used to store Fields of `base-type`. The default implementation of this
  method is an identity fn. This is provided so DBs that don't support a given base type used in the test data can
  specifiy what type we should expect in the results instead. For example, Oracle has no `INTEGER` data types, so
  `:type/Integer` test values are instead stored as `NUMBER`, which we map to `:type/Decimal`."
  {:arglists '([driver base-type])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod expected-base-type->actual ::test-extensions [_ base-type] base-type)


(defmulti format-name
  "Transform a lowercase string Table or Field name in a way appropriate for this dataset (e.g., `h2` would want to
  upcase these names; `mongo` would want to use `\"_id\"` in place of `\"id\"`. This method should return a string.
  Defaults to an identity implementation."
  {:arglists '([driver table-or-field-name])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod format-name ::test-extensions [_ table-or-field-name] table-or-field-name)


(defmulti has-questionable-timezone-support?
  "Does this driver have \"questionable\" timezone support? (i.e., does it group things by UTC instead of the
  `US/Pacific` when we're testing?). Defaults to `(not (driver/supports? driver) :set-timezone)`."
  {:arglists '([driver])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod has-questionable-timezone-support? ::test-extensions [driver]
  (not (driver/supports? driver :set-timezone)))


(defmulti id-field-type
  "Return the `base_type` of the `id` Field (e.g. `:type/Integer` or `:type/BigInteger`). Defaults to `:type/Integer`."
  {:arglists '([driver])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod id-field-type ::test-extensions [_] :type/Integer)


(defmulti aggregate-column-info
  "Return the expected type information that should come back for QP results as part of `:cols` for an aggregation of a
  given type (and applied to a given Field, when applicable)."
  {:arglists '([driver aggregation-type] [driver aggregation-type field])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod aggregate-column-info ::test-extensions
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
      (aggregate-column-info driver :count)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                 Helper Functions for Creating New Definitions                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO - not sure everything below belongs in this namespace

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

(def ^:private edn-definitions-dir "./test/metabase/test/data/dataset_definitions/")

(defn slurp-edn-table-def [dbname]
  ;; disabled for now when AOT compiling tests because this reads the entire file in which results in Method code too
  ;; large errors
  ;;
  ;; The fix would be to delay reading the code until runtime
  (when-not *compile-files*
    (edn/read-string (slurp (str edn-definitions-dir dbname ".edn")))))

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
  ([driver env-var]
   (db-test-env-var driver env-var nil))
  ([driver env-var default]
   (get env
        (keyword (format "mb-%s-test-%s" (name driver) (name env-var)))
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
  ([driver env-var]
   (db-test-env-var-or-throw driver env-var nil))
  ([driver env-var default]
   (or (db-test-env-var driver env-var default)
       (throw (Exception. (format "In order to test %s, you must specify the env var MB_%s_TEST_%s."
                                  (name driver)
                                  (str/upper-case (name driver))
                                  (to-system-env-var-str env-var)))))))

(ns metabase.test.data.interface
  "`Definition` types for databases, tables, fields; related protocols, helper functions.

  Drivers with test extensions know how to load a `DatabaseDefinition` into an actual physical database. This
  functionality allows us to easily test with multiple datasets.

  TODO - We should rename this namespace to `metabase.driver.test-extensions` or something like that.
  Tech debt issue: #39363"
  (:require
   [clojure.string :as str]
   [clojure.tools.reader.edn :as edn]
   [environ.core :as env]
   [mb.hawk.hooks]
   [mb.hawk.init]
   [medley.core :as m]
   [metabase.config :as config]
   [metabase.db :as mdb]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.models.database :refer [Database]]
   [metabase.models.field :as field :refer [Field]]
   [metabase.models.table :refer [Table]]
   [metabase.plugins.classloader :as classloader]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test.data.env :as tx.env]
   [metabase.test.initialize :as initialize]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [potemkin.types :as p.types]
   [pretty.core :as pretty]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                   Dataset Definition Record Types & Protocol                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(p.types/defrecord+ FieldDefinition [field-name base-type effective-type coercion-strategy semantic-type visibility-type fk field-comment])

(p.types/defrecord+ TableDefinition [table-name field-definitions rows table-comment])

(p.types/defrecord+ DatabaseDefinition [database-name table-definitions])

(def ^:private FieldDefinitionSchema
  [:map {:closed true}
   [:field-name                          ms/NonBlankString]
   [:base-type                           [:or
                                          [:map {:closed true}
                                           [:natives [:map-of :keyword ms/NonBlankString]]]
                                          [:map {:closed true}
                                           [:native ms/NonBlankString]]
                                          ms/FieldType]]
    ;; this was added pretty recently (in the 44 cycle) so it might not be supported everywhere. It should work for
    ;; drivers using `:sql/test-extensions` and [[metabase.test.data.sql/field-definition-sql]] but you might need to add
    ;; support for it elsewhere if you want to use it. It only really matters for testing things that modify test
    ;; datasets e.g. [[mt/with-actions-test-data]]
    ;; default is nullable
   [:not-null?         {:optional true} [:maybe :boolean]]
   [:unique?           {:optional true} [:maybe :boolean]]
   [:pk?               {:optional true} [:maybe :boolean]]
   ;; should we create an index for this field?
   [:indexed?          {:optional true} [:maybe :boolean]]
   [:semantic-type     {:optional true} [:maybe ms/FieldSemanticOrRelationType]]
   [:effective-type    {:optional true} [:maybe ms/FieldType]]
   [:coercion-strategy {:optional true} [:maybe ms/CoercionStrategy]]
   [:visibility-type   {:optional true} [:maybe (into [:enum] field/visibility-types)]]
   [:fk                {:optional true} [:maybe ms/KeywordOrString]]
   [:field-comment     {:optional true} [:maybe ms/NonBlankString]]])

(def ^:private ValidFieldDefinition
  [:and FieldDefinitionSchema (ms/InstanceOfClass FieldDefinition)])

(def ^:private ValidTableDefinition
  [:and
   [:map {:closed true}
    [:table-name                     ms/NonBlankString]
    [:field-definitions              [:sequential ValidFieldDefinition]]
    [:rows                           [:sequential [:sequential :any]]]
    [:table-comment {:optional true} [:maybe ms/NonBlankString]]]
   (ms/InstanceOfClass TableDefinition)])

(def ^:private ValidDatabaseDefinition
  [:and
   [:map {:closed true}
    [:database-name ms/NonBlankString] ; this must be unique
    [:table-definitions [:sequential ValidTableDefinition]]]
   (ms/InstanceOfClass DatabaseDefinition)])

;; TODO - this should probably be a protocol instead
;; Tech debt issue: #39350
(defmulti ^DatabaseDefinition get-dataset-definition
  "Return a definition of a dataset, so a test database can be created from it. Returns a map matching
  the [[ValidDatabaseDefinition]] schema."
  {:arglists '([this])}
  class)

(defmethod get-dataset-definition DatabaseDefinition
  [this]
  this)


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
    (log/infof "Added test extensions for %s 💯" driver)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Loading Test Extensions                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(declare before-run)

(defonce ^:private has-done-before-run (atom #{}))

;; this gets called below by [[load-test-extensions-namespace-if-needed]]
(defn- do-before-run-if-needed [driver]
  (when-not (@has-done-before-run driver)
    (locking has-done-before-run
      (when-not (@has-done-before-run driver)
        (when (not= (get-method before-run driver) (get-method before-run ::test-extensions))
          (log/infof "doing before-run for %s" driver))
        ;; avoid using the dispatch fn here because it dispatches on driver with test extensions which would result in
        ;; a circular call back to this function
        ((get-method before-run driver) driver)
        (swap! has-done-before-run conj driver)))))

(defn- require-driver-test-extensions-ns [driver & require-options]
  (let [expected-ns (symbol (or (namespace driver)
                                (str "metabase.test.data." (name driver))))]
    (log/infof "Loading driver %s test extensions %s"
               (u/format-color 'blue driver) (apply list 'require expected-ns require-options))
    (apply classloader/require expected-ns require-options)))

(defonce ^:private has-loaded-extensions (atom #{}))

(defn- load-test-extensions-namespace-if-needed [driver]
  (when-not (contains? @has-loaded-extensions driver)
    (locking has-loaded-extensions
      (when-not (contains? @has-loaded-extensions driver)
        (u/profile (format "Load %s test extensions" driver)
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
                (throw (Exception. (str "No test extensions found for " driver))))))
          ;; do before-run if needed as well
          (do-before-run-if-needed driver))
        (swap! has-loaded-extensions conj driver)))))

(defn the-driver-with-test-extensions
  "Like `driver/the-driver`, but guaranteed to return a driver with test extensions loaded, throwing an Exception
  otherwise. Loads driver and test extensions automatically if not already done."
  [driver]
  (mb.hawk.init/assert-tests-are-not-initializing (pr-str (list 'the-driver-with-test-extensions driver)))
  (initialize/initialize-if-needed! :plugins)
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

(defn escaped-database-name
  "Return escaped version of database name suitable for use as a filename / database name / etc."
  ^String [^DatabaseDefinition {:keys [database-name]}]
  {:pre [(string? database-name)]}
  (str/replace database-name #"\s+" "_"))

(def ^:dynamic *database-name-override*
  "Bind this to a string to override the database name, for the purpose of calculating the qualified table name. The
  purpose of this is to allow for a new Database to clone an existing one with the same details (ex: to test different
  connection methods with syncing, etc.).

  Currently, this only affects `db-qualified-table-name`."
  nil)

(defn- normalize-qualified-name [n]
  (-> n u/lower-case-en (str/replace #"-" "_")))

(defn- db-qualified-table-name-prefix [db-name]
  (str (normalize-qualified-name (or *database-name-override* db-name))
       \_))

(defn qualified-by-db-name?
  "Is `table-name` qualified by the name of its database? See [[db-qualified-table-name]] for more details."
  [db-name table-name]
  (str/starts-with? table-name (db-qualified-table-name-prefix db-name)))

(defn db-qualified-table-name
  "Return a combined table name qualified with the name of its database, suitable for use as an identifier.
  Provided for drivers where testing wackiness makes it hard to actually create separate Databases, such as Oracle,
  where this is disallowed on RDS. (Since Oracle can't create seperate DBs, we just create various tables in the same
  DB; thus their names must be qualified to differentiate them effectively.)

  Asserts that the resulting name has fewer than 30 characters, because databases like Oracle have limits on the
  lengths of identifiers."
  ^String [^String database-name, ^String table-name]
  {:pre [(string? database-name)
         (string? table-name)]
   :post [(qualified-by-db-name? database-name %)
          (<= (count %) 30)]}
  (str (db-qualified-table-name-prefix database-name)
       (normalize-qualified-name table-name)))

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
  "Return the Metabase object associated with this definition, if applicable. `context` should be the parent object (the
  actual instance, *not* the definition) of the Metabase object to return (e.g., a pass a `Table` to a
  `FieldDefintion`). For a `DatabaseDefinition`, pass the driver keyword."
  {:arglists '([db-or-table-or-field-def context])}
  (fn [db-or-table-or-field-def _context] (class db-or-table-or-field-def)))

(defmethod metabase-instance FieldDefinition
  [this table]
  (t2/select-one Field
                 :table_id    (u/the-id table)
                 :%lower.name (u/lower-case-en (:field-name this))
                 {:order-by [[:id :asc]]}))

(defmethod metabase-instance TableDefinition
  [this database]
  ;; Look first for an exact table-name match; otherwise allow DB-qualified table names for drivers that need them
  ;; like Oracle
  (letfn [(table-with-name [table-name]
            (t2/select-one Table
                           :db_id       (:id database)
                           :%lower.name table-name
                           {:order-by [[:id :asc]]}))]
    (or (table-with-name (u/lower-case-en (:table-name this)))
        (table-with-name (db-qualified-table-name (:name database) (:table-name this))))))

(defmethod metabase-instance DatabaseDefinition
  [{:keys [database-name]} driver]
  (assert (string? database-name))
  (assert (keyword? driver))
  (mdb/setup-db! :create-sample-content? false) ; skip sample content for speedy tests. this doesn't reflect production
  (t2/select-one Database
                 :name    database-name
                 :engine (u/qualified-name driver)
                 {:order-by [[:id :asc]]}))

(declare after-run)

(methodical/defmethod mb.hawk.hooks/after-run ::run-drivers-after-run
  "Run [[metabase.test.data.interface/after-run]] methods for drivers."
  [_options]
  (doseq [driver (tx.env/test-drivers)
          :when  (isa? driver/hierarchy driver ::test-extensions)]
    (log/infof "Running after-run hooks for %s..." driver)
    (after-run driver)))


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

(defmethod before-run ::test-extensions [_]) ; default impl is a no-op

(defmulti after-run
  "Do cleanup after the test suite finishes running for a driver, when running from the CLI (this is not done when
  running tests from the REPL). This is a good place to clean up after yourself, e.g. delete any cloud databases you
  no longer need.

  Will only be called once for a given driver; only called when running tests against that driver. This method does
  not need to call the implementation for any parent drivers; that is done automatically.

  DO NOT CALL THIS METHOD DIRECTLY; THIS IS CALLED AUTOMATICALLY WHEN APPROPRIATE."
  {:arglists '([driver]), :added "0.49.0"}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod after-run ::test-extensions
  [driver]
  (log/infof "%s has no after-run hooks." driver))

(defmulti dbdef->connection-details
  "Return the connection details map that should be used to connect to the Database we will create for
  `database-definition`.

  `connection-type` is either:

  *  `:server` - Return details for making the connection in a way that isn't DB-specific (e.g., for
                 creating/destroying databases)
  *  `:db`     - Return details for connecting specifically to the DB."
  {:arglists '([driver connection-type database-definition])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti create-db!
  "Create a new database from `database-definition`, including adding tables, fields, and foreign key constraints,
  and load the appropriate data. (This refers to creating the actual *DBMS* database itself, *not* a Metabase
  `Database` object.)

  Optional `options` as third param. Currently supported options include `skip-drop-db?`. If unspecified,
  `skip-drop-db?` should default to `false`.

  This method should drop existing databases with the same name if applicable, unless the `skip-drop-db?` arg is
  truthy. This is to work around a scenario where the Postgres driver terminates the connection before dropping the DB
  and causes some tests to fail.

  This method is not expected to return anything; use `dbdef->connection-details` to get connection details for this
  database after you create it."
  {:arglists '([driver database-definition & {:keys [skip-drop-db?]}])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti destroy-db!
  "Destroy the database created for `database-definition`, if one exists. This is only called if loading data fails for
  one reason or another, to revert the changes made thus far; implementations should clean up everything related to
  the database in question."
  {:arglists '([driver database-definition])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod ddl.i/format-name ::test-extensions [_ table-or-field-name] table-or-field-name)

(defmulti id-field-type
  "Return the `base_type` of the `id` Field (e.g. `:type/Integer` or `:type/BigInteger`). Defaults to `:type/Integer`."
  {:arglists '([driver])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod id-field-type ::test-extensions [_] :type/Integer)


(defmulti sorts-nil-first?
  "Whether this database will sort nil values (of type `base-type`) before or after non-nil values. Defaults to `true`.
  Of course, in real queries, multiple sort columns can be specified, so considering only one `base-type` isn't 100%
  correct. However, it is good enough for our test cases, which currently don't sort nulls across multiple columns
  having different types."
  {:arglists '([driver base-type])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod sorts-nil-first? ::test-extensions [_ _] true)

(defmulti supports-time-type?
  "Whether this database supports a `TIME` data type or equivalent."
  {:arglists '([driver])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod supports-time-type? ::test-extensions [_driver] true)

(defmulti supports-timestamptz-type?
  "Whether this database supports a `timestamp with time zone` data type or equivalent."
  {:arglists '([driver])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod supports-timestamptz-type? ::test-extensions [_driver] true)

(defmulti aggregate-column-info
  "Return the expected type information that should come back for QP results as part of `:cols` for an aggregation of a
  given type (and applied to a given Field, when applicable)."
  {:arglists '([driver aggregation-type] [driver aggregation-type field])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod aggregate-column-info ::test-extensions
  ([_ aggregation-type]
   (assert (#{:count :cum-count} aggregation-type))
   {:base_type     (case aggregation-type
                     :count     :type/BigInteger
                     :cum-count :type/Decimal)
    :semantic_type :type/Quantity
    :name          "count"
    :display_name  (case aggregation-type
                     :count     "Count"
                     :cum-count "Cumulative count")
    :source        :aggregation
    :field_ref     [:aggregation 0]})

  ([_driver aggregation-type {field-id :id, table-id :table_id}]
   {:pre [(some? table-id)]}
   (merge
    (first (qp.preprocess/query->expected-cols {:database (t2/select-one-fn :db_id Table :id table-id)
                                                :type     :query
                                                :query    {:source-table table-id
                                                           :aggregation  [[aggregation-type [:field-id field-id]]]}}))
    (when (= aggregation-type :cum-count)
      {:base_type     :type/Decimal
       :semantic_type :type/Quantity}))))


(defmulti count-with-template-tag-query
  "Generate a native query for the count of rows in `table` matching a set of conditions where `field-name` is equal to
  a param `value`."
  {:arglists '([driver table-name field-name param-type])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmulti count-with-field-filter-query
  "Generate a native query that returns the count of a Table with `table-name` with a field filter against a Field with
  `field-name`."
  {:arglists '([driver table-name field-name])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                 Helper Functions for Creating New Definitions                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private DatasetFieldDefinition
  "Schema for a Field in a test dataset defined by a `defdataset` form or in a dataset defnition EDN file."
  ;; this is acutally the same schema as the one for `FieldDefinition`, i.e. the format in EDN files is the same as
  ;; the one we use elsewhere
  FieldDefinitionSchema)

(def ^:private DatasetTableDefinition
  "Schema for a Table in a test dataset defined by a `defdataset` form or in a dataset defnition EDN file."
  [:tuple
   ms/NonBlankString
   [:sequential DatasetFieldDefinition]
   [:sequential [:sequential :any]]])

;; TODO - not sure everything below belongs in this namespace
;; Tech debt issue: #39363

(mu/defn ^:private dataset-field-definition :- ValidFieldDefinition
  "Parse a Field definition (from a `defdatset` form or EDN file) and return a FieldDefinition instance for
  comsumption by various test-data-loading methods."
  [field-definition-map :- DatasetFieldDefinition]
  ;; if definition uses a coercion strategy they need to provide the effective-type
  (map->FieldDefinition field-definition-map))

(mu/defn ^:private dataset-table-definition :- ValidTableDefinition
  "Parse a Table definition (from a `defdatset` form or EDN file) and return a TableDefinition instance for
  comsumption by various test-data-loading methods."
  ([tabledef :- DatasetTableDefinition]
   (apply dataset-table-definition tabledef))

  ([table-name :- ms/NonBlankString
    field-definition-maps
    rows]
   (map->TableDefinition
    {:table-name        table-name
     :rows              rows
     :field-definitions (mapv dataset-field-definition field-definition-maps)})))

(mu/defn dataset-definition :- ValidDatabaseDefinition
  "Parse a dataset definition (from a `defdatset` form or EDN file) and return a DatabaseDefinition instance for
  comsumption by various test-data-loading methods."
  [database-name :- ms/NonBlankString & table-definitions]
  (mu/validate-throw
   (ms/InstanceOfClass DatabaseDefinition)
   (map->DatabaseDefinition
    {:database-name     database-name
     :table-definitions (for [table table-definitions]
                          (dataset-table-definition table))})))

(defmacro defdataset
  "Define a new dataset to test against. Definition should be of the format

    [table-def+]

  Where each table-def is of the format

    [table-name [field-def+] [row+]]

  e.g.

  [[\"bird_species\"
    [{:field-name \"name\", :base-type :type/Text}]
    [[\"House Finch\"]
     [\"Mourning Dove\"]]]]

  Refer to the EDN definitions (e.g. `test-data.edn`) for more examples."
  ([dataset-name definition]
   `(defdataset ~dataset-name nil ~definition))

  ([dataset-name docstring definition]
   {:pre [(symbol? dataset-name)]}
   `(~(if config/is-dev? 'def 'defonce) ~(vary-meta dataset-name assoc :doc docstring, :tag `DatabaseDefinition)
      (apply dataset-definition ~(name dataset-name) ~definition))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            EDN Dataset Definitions                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private edn-definitions-dir "./test/metabase/test/data/dataset_definitions/")

(p.types/deftype+ ^:private EDNDatasetDefinition [dataset-name def]
  pretty/PrettyPrintable
  (pretty [_]
    (list `edn-dataset-definition dataset-name)))

(defmethod get-dataset-definition EDNDatasetDefinition
  [^EDNDatasetDefinition this]
  @(.def this))

(mu/defn edn-dataset-definition
  "Define a new test dataset using the definition in an EDN file in the `test/metabase/test/data/dataset_definitions/`
  directory. (Filename should be `dataset-name` + `.edn`.)"
  [dataset-name :- ms/NonBlankString]
  (let [get-def (delay
                  (let [file-contents (edn/read-string
                                       {:eof nil, :readers {'t #'u.date/parse}}
                                       (slurp (str edn-definitions-dir dataset-name ".edn")))]
                    (apply dataset-definition dataset-name file-contents)))]
    (EDNDatasetDefinition. dataset-name get-def)))

(defmacro defdataset-edn
  "Define a new test dataset using the definition in an EDN file in the `test/metabase/test/data/dataset_definitions/`
  directory. (Filename should be `dataset-name` + `.edn`.)"
  [dataset-name & [docstring]]
  `(defonce ~(vary-meta dataset-name assoc :doc docstring, :tag `EDNDatasetDefinition)
     (edn-dataset-definition ~(name dataset-name))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Transformed Dataset Definitions                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(p.types/deftype+ ^:private TransformedDatasetDefinition [new-name wrapped-definition def]
  pretty/PrettyPrintable
  (pretty [_]
    (list `transformed-dataset-definition new-name (pretty/pretty wrapped-definition))))

(mu/defn transformed-dataset-definition
  "Create a dataset definition that is a transformation of an some other one, seqentially applying `transform-fns` to
  it. The results of `transform-fns` are cached."
  [new-name :- ms/NonBlankString wrapped-definition & transform-fns]
  (let [transform-fn (apply comp (reverse transform-fns))
        get-def      (delay
                      (transform-fn
                       (assoc (get-dataset-definition wrapped-definition)
                         :database-name new-name)))]
    (TransformedDatasetDefinition. new-name wrapped-definition get-def)))

(defmethod get-dataset-definition TransformedDatasetDefinition
  [^TransformedDatasetDefinition this]
  @(.def this))

(defn transform-dataset-update-tabledefs [f & args]
  (fn [dbdef]
    (apply update dbdef :table-definitions f args)))

(mu/defn transform-dataset-only-tables :- fn?
  "Create a function for `transformed-dataset-definition` to only keep some subset of Tables from the original dataset
  definition."
  [& table-names]
  (transform-dataset-update-tabledefs
   (let [names (set table-names)]
     (fn [tabledefs]
       (filter
        (fn [{:keys [table-name]}]
          (contains? names table-name))
        tabledefs)))))

(defn transform-dataset-update-table
  "Create a function to transform a single table, for use with `transformed-dataset-definition`. Pass `:table`, `:rows`
  or both functions to transform the entire table definition, or just the rows, respectively."
  {:style/indent 1}
  [table-name & {:keys [table rows], :or {table identity, rows identity}}]
  (transform-dataset-update-tabledefs
   (fn [tabledefs]
     (for [{this-name :table-name, :as tabledef} tabledefs]
       (if (= this-name table-name)
         (update (table tabledef) :rows rows)
         tabledef)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                      Flattening Dataset Definitions (i.e. for timeseries DBs like Druid)                       |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO - maybe this should go in a different namespace
;; Tech debt issue: #39363

(mu/defn ^:private tabledef-with-name :- ValidTableDefinition
  "Return `TableDefinition` with `table-name` in `dbdef`."
  [{:keys [table-definitions]} :- (ms/InstanceOfClass DatabaseDefinition)
   table-name :- ms/NonBlankString]
  (some
   (fn [{this-name :table-name, :as tabledef}]
     (when (= table-name this-name)
       tabledef))
   table-definitions))

(mu/defn ^:private fielddefs-for-table-with-name :- [:sequential ValidFieldDefinition]
  "Return the `FieldDefinitions` associated with table with `table-name` in `dbdef`."
  [dbdef :- (ms/InstanceOfClass DatabaseDefinition)
   table-name :- ms/NonBlankString]
  (:field-definitions (tabledef-with-name dbdef table-name)))

(mu/defn ^:private tabledef->id->row :- [:map-of ms/PositiveInt [:map-of ms/NonBlankString :any]]
  [{:keys [field-definitions rows]} :- (ms/InstanceOfClass TableDefinition)]
  (let [field-names (map :field-name field-definitions)]
    (into {} (for [[i values] (m/indexed rows)]
               [(inc i) (zipmap field-names values)]))))

(mu/defn ^:private dbdef->table->id->row :- [:map-of ms/NonBlankString [:map-of ms/PositiveInt [:map-of ms/NonBlankString :any]]]
  "Return a map of table name -> map of row ID -> map of column key -> value."
  [{:keys [table-definitions]} :- (ms/InstanceOfClass DatabaseDefinition)]
  (into {} (for [{:keys [table-name] :as tabledef} table-definitions]
             [table-name (tabledef->id->row tabledef)])))

(mu/defn ^:private nest-fielddefs
  [dbdef :- (ms/InstanceOfClass DatabaseDefinition)
   table-name :- ms/NonBlankString]
  (let [nest-fielddef (fn nest-fielddef [{:keys [fk field-name], :as fielddef}]
                        (if-not fk
                          [fielddef]
                          (let [fk (name fk)]
                            (for [nested-fielddef (mapcat nest-fielddef (fielddefs-for-table-with-name dbdef fk))]
                              (update nested-fielddef :field-name (partial vector field-name fk))))))]
    (mapcat nest-fielddef (fielddefs-for-table-with-name dbdef table-name))))

(mu/defn ^:private flatten-rows
  [dbdef :- (ms/InstanceOfClass DatabaseDefinition)
   table-name :- ms/NonBlankString]
  (let [nested-fielddefs (nest-fielddefs dbdef table-name)
        table->id->k->v  (dbdef->table->id->row dbdef)
        resolve-field    (fn resolve-field [table id field-name]
                           (if (string? field-name)
                             (get-in table->id->k->v [table id field-name])
                             (let [[fk-from-name fk-table fk-dest-name] field-name
                                   fk-id                                (get-in table->id->k->v [table id fk-from-name])]
                               (resolve-field fk-table fk-id fk-dest-name))))]
    (for [id (range 1 (inc (count (:rows (tabledef-with-name dbdef table-name)))))]
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

(mu/defn flattened-dataset-definition
  "Create a flattened version of `dbdef` by following resolving all FKs and flattening all rows into the table with
  `table-name`. For use with timeseries databases like Druid."
  [dataset-definition
   table-name :- ms/NonBlankString]
  (transformed-dataset-definition table-name dataset-definition
    (fn [dbdef]
      (assoc dbdef
             :table-definitions
             [(map->TableDefinition
               {:table-name        table-name
                :field-definitions (for [fielddef (nest-fielddefs dbdef table-name)]
                                     (update fielddef :field-name flatten-field-name))
                :rows              (flatten-rows dbdef table-name)})]))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 Test Env Vars                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- db-test-env-var-keyword [driver env-var]
  (keyword (format "mb-%s-test-%s" (name driver) (name env-var))))

(defn db-test-env-var
  "Look up test environment var `env-var` for the given `driver` containing connection related parameters.
  If no `:default` param is specified and the var isn't found, throw.

     (db-test-env-var :mysql :user) ; Look up `MB_MYSQL_TEST_USER`

  You can change this value at run time with [[db-test-env-var!]]."
  ([driver env-var]
   (db-test-env-var driver env-var nil))

  ([driver env-var default]
   (or (not-empty (get env/env (db-test-env-var-keyword driver env-var)))
       default)))

(defn db-test-env-var!
  "Update or the value of a test env var. A `nil` new-value removes the env var value."
  [driver env-var new-value]
  (if (some? new-value)
    (alter-var-root #'env/env assoc (db-test-env-var-keyword driver env-var) (str new-value))
    (alter-var-root #'env/env dissoc (db-test-env-var-keyword driver env-var)))
  nil)

(defn- to-system-env-var-str
  "Converts the clojure environment variable form (a keyword) to a stringified version that will be specified at the
  system level

  i.e. :foo-bar -> FOO_BAR"
  [env-var-kwd]
  (-> env-var-kwd
      name
      (str/replace "-" "_")
      u/upper-case-en))

(defn db-test-env-var-or-throw
  "Same as `db-test-env-var` but will throw an exception if the variable is `nil`."
  ([driver env-var]
   (db-test-env-var-or-throw driver env-var nil))

  ([driver env-var default]
   (or (db-test-env-var driver env-var default)
       (throw (Exception. (format "In order to test %s, you must specify the env var MB_%s_TEST_%s."
                                  (name driver)
                                  (u/upper-case-en (str/replace (name driver) #"-" "_"))
                                  (to-system-env-var-str env-var)))))))

(defmulti default-dataset
  "Enable drivers to define default dataset in tests (when not specified by [[metabase.test/dataset]]).

  Problem is that lot of tests that we have do not specify the dataset. `test-data` is used as default.
  But some dbs (Druid) can not use that, even though lot of tests could work with those, if there is a way
  to swap `test-data` for custom dataset.

  At the time of writing eg. [[metabase.driver.sql-jdbc.sync.describe-database-test/dont-leak-resultsets-test]].
  Implementing this method enables code as follows to work, hence tests as mentioned before could pass without further
  changes.

  ``` clj
  (mt/test-driver :druid-jdbc
    (mt/id))
  ```"
  {:arglists '([driver])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defmethod default-dataset ::test-extensions
  [_]
  ;; Following cyclic dependency by that requiring resolve.
  ((requiring-resolve 'metabase.test.data.impl/resolve-dataset-definition)
   'metabase.test.data.dataset-definitions 'test-data))

(defmulti native-query-with-card-template-tag
  "For drivers that support `:native-parameter-card-reference`:

  Return a native `:query` (just the SQL string or equivalent with a `:card` template tag e.g.

    \"SELECT * FROM {{%s}}\""
  {:arglists '([driver card-template-tag-name])}
  dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

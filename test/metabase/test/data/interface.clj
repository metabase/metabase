(ns metabase.test.data.interface
  "`Definition` types for databases, tables, fields; related protocols, helper functions.

  Drivers with test extensions know how to load a `DatabaseDefinition` into an actual physical database. This
  functionality allows us to easily test with multiple datasets.

  TODO - We should rename this namespace to `metabase.driver.test-extensions` or something like that."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.tools.logging :as log]
   [environ.core :refer [env]]
   [metabase.db :as mdb]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.models.database :refer [Database]]
   [metabase.models.table :refer [Table]]
   [metabase.plugins.classloader :as classloader]
   [metabase.query-processor :as qp]
   [metabase.test-runner.init :as test-runner.init]
   [metabase.test.initialize :as initialize]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan.db :as db]
   [yaml.core :as yaml]))

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

;; this gets called below by `load-test-extensions-namespace-if-needed`
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
  (test-runner.init/assert-tests-are-not-initializing (pr-str (list 'the-driver-with-test-extensions driver)))
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
  ^String [{:keys [database-name]}]
  {:pre [(string? database-name)]}
  (str/replace database-name #"\s+" "_"))

(def ^:dynamic *database-name-override*
  "Bind this to a string to override the database name, for the purpose of calculating the qualified table name. The
  purpose of this is to allow for a new Database to clone an existing one with the same details (ex: to test different
  connection methods with syncing, etc.).

  Currently, this only affects `db-qualified-table-name`."
  nil)

(defn db-qualified-table-name
  "Return a combined table name qualified with the name of its database, suitable for use as an identifier.
  Provided for drivers where testing wackiness makes it hard to actually create separate Databases, such as Oracle,
  where this is disallowed on RDS. (Since Oracle can't create seperate DBs, we just create various tables in the same
  DB; thus their names must be qualified to differentiate them effectively.)"
  ^String [^String database-name, ^String table-name]
  {:pre [(string? database-name) (string? table-name)]}
  ;; take up to last 30 characters because databases like Oracle have limits on the lengths of identifiers
  (-> (or *database-name-override* database-name)
      (str \_ table-name)
      str/lower-case
      (str/replace #"-" "_")
      (->>
        (take-last 30)
        (apply str))))

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

(defn existing-database [driver dataset-name]
  (mdb/setup-db!)
  (db/select-one Database
                 :name   (name dataset-name)
                 :engine (u/qualified-name driver)
                {:order-by [[:id :asc]]}))


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

(defmulti ^:deprecated create-db!
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

(methodical/defmulti load-dataset!
  {:arglists '([driver dataset-name])}
  (fn [driver dataset-name]
    [(dispatch-on-driver-with-test-extensions driver)
     (keyword dataset-name)])
  :hierarchy #'driver/hierarchy)

(methodical/defmulti load-dataset-step!
  {:arglists '([driver dataset-name step])}
  (fn [driver dataset-name step]
    (when-not (:type step)
      (throw (ex-info "Step is missing 'type'"
                      {:driver driver, :dataset dataset-name, :step step})))
    [(dispatch-on-driver-with-test-extensions driver)
     (keyword dataset-name)
     (keyword (:type step))])
  :hierarchy #'driver/hierarchy)

(methodical/defmethod load-dataset! :default
  [driver dataset-name]
  (let [recipe-file-name-on-class-path (format "%s/%s.yaml" (name driver) (name dataset-name))]
    (try
      (let [recipe-resource (or (io/resource recipe-file-name-on-class-path)
                                (throw (ex-info "Recipe file does not exist" {})))
            recipe          (yaml/parse-string (slurp recipe-resource))
            steps           (or (not-empty (:steps recipe))
                                (throw (ex-info "Dataset recipe file is missing steps" {:recipe recipe})))]
        (doseq [step steps]
          (try
            (load-dataset-step! driver dataset-name step)
            (catch Throwable e
              (throw (ex-info (str "Error executing load step: " (ex-message e))
                              {:step step}
                              e))))))
      (catch Throwable e
        (throw (ex-info (format "Error loading data from recipe %s: %s"
                                (pr-str recipe-file-name-on-class-path)
                                (ex-message e))
                        {:driver driver, :dataset dataset-name, :file recipe-file-name-on-class-path}
                        e))))))

(defmethod ddl.i/format-name ::test-extensions [_ table-or-field-name] table-or-field-name)

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
   ;; TODO - Can `:cum-count` be used without args as well ??
   (assert (= aggregation-type :count))
   {:base_type     :type/BigInteger
    :semantic_type :type/Quantity
    :name          "count"
    :display_name  "Count"
    :source        :aggregation
    :field_ref     [:aggregation 0]})

  ([_driver aggregation-type {field-id :id, table-id :table_id}]
   {:pre [(some? table-id)]}
   (first (qp/query->expected-cols {:database (db/select-one-field :db_id Table :id table-id)
                                    :type     :query
                                    :query    {:source-table table-id
                                               :aggregation  [[aggregation-type [:field-id field-id]]]}}))))

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
;;; |                                                 Test Env Vars                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn db-test-env-var
  "Look up test environment var `env-var` for the given `driver` containing connection related parameters.
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
                                  (str/upper-case (str/replace (name driver) #"-" "_"))
                                  (to-system-env-var-str env-var)))))))

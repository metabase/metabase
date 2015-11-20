(ns metabase.test.data.datasets
  "Interface + implementations for loading test datasets for different drivers, and getting information about the dataset's tables, fields, etc."
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            [colorize.core :as color]
            [environ.core :refer [env]]
            [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.driver [h2 :refer [map->H2Driver]]
                             [mongo :refer [map->MongoDriver]]
                             [mysql :refer [map->MySQLDriver]]
                             [postgres :refer [map->PostgresDriver]]
                             [sqlite :refer [map->SQLiteDriver]]
                             [sqlserver :refer [map->SQLServerDriver]])
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])
            (metabase.test.data [dataset-definitions :as defs]
                                [h2 :as h2]
                                [mongo :as mongo]
                                [mysql :as mysql]
                                [postgres :as postgres]
                                [sqlite :as sqlite]
                                [sqlserver :as sqlserver])
            [metabase.util :as u])
  (:import metabase.driver.h2.H2Driver
           metabase.driver.mongo.MongoDriver
           metabase.driver.mysql.MySQLDriver
           metabase.driver.postgres.PostgresDriver
           metabase.driver.sqlite.SQLiteDriver
           metabase.driver.sqlserver.SQLServerDriver))

;; # IDataset

(defprotocol IDataset
  "Functions needed to fetch test data for various drivers."
  (load-data! [this]
    "Load the test data for this dataset.")
  (db [this]
    "Return `Database` containing test data for this driver.")
  (default-schema [this]
    "Return the default schema name that tables for this DB should be expected to have.")
  (format-name [this table-or-field-name]
    "Transform a lowercase string `Table` or `Field` name in a way appropriate for this dataset
     (e.g., `h2` would want to upcase these names; `mongo` would want to use `\"_id\"` in place of `\"id\"`.")
  (id-field-type [this]
    "Return the `base_type` of the `id` `Field` (e.g. `:IntegerField` or `:BigIntegerField`).")
  (sum-field-type [this]
    "Return the `base_type` of a aggregate summed field.")
  (timestamp-field-type [this]
    "Return the `base_type` of a `TIMESTAMP` `Field` like `users.last_login`."))


;; # Implementations

(defn- generic-load-data! [{:keys [dbpromise], :as this}]
  (when-not (realized? dbpromise)
    (deliver dbpromise (@(resolve 'metabase.test.data/get-or-create-database!) this defs/test-data)))
  @dbpromise)

(def ^:private IDatasetDefaultsMixin
  {:load-data!     generic-load-data!
   :db             generic-load-data!
   :id-field-type  (constantly :IntegerField)
   :sum-field-type (constantly :IntegerField)
   :default-schema (constantly nil)})

;; ## Mongo

(extend MongoDriver
  IDataset
  (merge IDatasetDefaultsMixin
         {:format-name          (fn [_ table-or-field-name]
                                  (if (= table-or-field-name "id") "_id"
                                      table-or-field-name))
          :timestamp-field-type (constantly :DateField)}))


;; ## Generic SQL

(def ^:private GenericSQLIDatasetMixin
  (merge IDatasetDefaultsMixin
         {:format-name          (fn [_ table-or-field-name]
                                  table-or-field-name)
          :timestamp-field-type (constantly :DateTimeField)}))


;;; ### H2

(extend H2Driver
  IDataset
  (merge GenericSQLIDatasetMixin
         {:default-schema (constantly "PUBLIC")
          :format-name    (fn [_ table-or-field-name]
                            (s/upper-case table-or-field-name))
          :id-field-type  (constantly :BigIntegerField)
          :sum-field-type (constantly :BigIntegerField)}))


;;; ### Postgres

(extend PostgresDriver
  IDataset
  (merge GenericSQLIDatasetMixin
         {:default-schema (constantly "public")}))


;;; ### MySQL

(extend MySQLDriver
  IDataset
  (merge GenericSQLIDatasetMixin
         {:sum-field-type (constantly :BigIntegerField)}))


;;; ### SQLite

(extend SQLiteDriver
  IDataset
  GenericSQLIDatasetMixin)


;;; ### SQLServer

(extend SQLServerDriver
  IDataset
  (merge GenericSQLIDatasetMixin
         {:default-schema (constantly "dbo")
          :sum-field-type (constantly :IntegerField)}))


;; # Concrete Instances

(def ^:private engine->loader*
  "Map of dataset keyword name -> dataset instance (i.e., an object that implements `IDataset`)."
  {:h2        (map->H2Driver        {:dbpromise (promise)})
   :mongo     (map->MongoDriver     {:dbpromise (promise)})
   :mysql     (map->MySQLDriver     {:dbpromise (promise)})
   :postgres  (map->PostgresDriver  {:dbpromise (promise)})
   :sqlite    (map->SQLiteDriver    {:dbpromise (promise)})
   :sqlserver (map->SQLServerDriver {:dbpromise (promise)})})

(def ^:const all-valid-engines
  "Set of names of all valid datasets."
  (set (keys engine->loader*)))

(defn engine->loader [engine]
  (or (engine->loader* engine)
      (throw (Exception.(format "Invalid engine: %s\nMust be one of: %s" engine all-valid-engines)))))


;; # Logic for determining which datasets to test against

;; By default, we'll test against against only the :h2 (H2) dataset; otherwise, you can specify which
;; datasets to test against by setting the env var `ENGINES` to a comma-separated list of dataset names, e.g.
;;
;;    # test against :h2 and :mongo
;;    ENGINES=generic-sql,mongo
;;
;;    # just test against :h2 (default)
;;    ENGINES=generic-sql

(defn- get-engines-from-env
  "Return a set of dataset names to test against from the env var `ENGINES`."
  []
  (when-let [env-engines (some-> (env :engines) s/lower-case)]
    (some->> (s/split env-engines #",")
             (map keyword)
             ;; Double check that the specified datasets are all valid
             (map (fn [engine]
                    (assert (contains? all-valid-engines engine)
                      (format "Invalid dataset specified in ENGINES: %s" (name engine)))
                    engine))
             set)))

(def ^:const test-engines
  "Set of names of drivers we should run tests against.
   By default, this only contains `:h2` but can be overriden by setting env var `ENGINES`."
  (let [engines (or (get-engines-from-env)
                    #{:h2})]
    (log/info (color/green "Running QP tests against these engines: " engines))
    engines))


;; # Helper Macros

(def ^:private ^:const default-engine
  (if (contains? test-engines :h2) :h2
      (first test-engines)))

(def ^:dynamic *engine*
  "Keyword name of the engine that we're currently testing against. Defaults to `:h2`."
  default-engine)

(def ^:dynamic *data-loader*
  "The dataset we're currently testing against, bound by `with-engine`.
   This is just a regular driver, e.g. `MySQLDriver`, with an extra promise keyed by `:dbpromise`
   that is used to store the `test-data` dataset when you call `load-data!`."
  (engine->loader default-engine))



(defmacro with-engine
  "Bind `*data-loader*` to the dataset with ENGINE and execute BODY."
  [engine & body]
  `(let [engine# ~engine]
     (binding [*engine*  engine#
               *data-loader* (engine->loader engine#)]
       ~@body)))

(defmacro when-testing-engine
  "Execute BODY only if we're currently testing against ENGINE."
  [engine & body]
  `(when (contains? test-engines ~engine)
     ~@body))

(defmacro with-engine-when-testing
  "When testing ENGINE, binding `*data-loader*` and executes BODY."
  [engine & body]
  `(when-testing-engine ~engine
     (with-engine ~engine
       ~@body)))

(defmacro expect-when-testing-engine
  "Generate a unit test that only runs if we're currently testing against ENGINE."
  [engine expected actual]
  `(when-testing-engine ~engine
     (expect ~expected
       ~actual)))

(defmacro expect-with-engine
  "Generate a unit test that only runs if we're currently testing against ENGINE, and that binds `*data-loader*` to the current dataset."
  [engine expected actual]
  `(expect-when-testing-engine ~engine
     (with-engine ~engine
       ~expected)
     (with-engine ~engine
       ~actual)))

(defmacro expect-with-engines
  "Generate unit tests for all datasets in ENGINES; each test will only run if we're currently testing the corresponding dataset.
   `*data-loader*` is bound to the current dataset inside each test."
  [engines expected actual]
  `(do ~@(for [engine (eval engines)]
           `(expect-with-engine ~engine ~expected ~actual))))

(defmacro expect-with-all-engines
  "Generate unit tests for all valid datasets; each test will only run if we're currently testing the corresponding dataset.
  `*data-loader*` is bound to the current dataset inside each test."
  [expected actual]
  `(expect-with-engines ~all-valid-engines ~expected ~actual))

(defmacro engine-case
  "Case statement that switches off of the current dataset.

     (engine-case
       :h2       ...
       :postgres ...)"
  [& pairs]
  `(cond ~@(mapcat (fn [[engine then]]
                     (assert (contains? all-valid-engines engine))
                     [`(= *engine* ~engine)
                      then])
                   (partition 2 pairs))))

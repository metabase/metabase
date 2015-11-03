(ns metabase.test.data.datasets
  "Interface + implementations for loading test datasets for different drivers, and getting information about the dataset's tables, fields, etc."
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            [colorize.core :as color]
            [environ.core :refer [env]]
            [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.driver.mongo.test-data :as mongo-data]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])
            (metabase.test.data [data :as data]
                                [h2 :as h2]
                                [mongo :as mongo]
                                [mysql :as mysql]
                                [postgres :as postgres])
            [metabase.util :as u]))

;; # IDataset

(defprotocol IDataset
  "Functions needed to fetch test data for various drivers."
  (load-data! [this]
    "Load the test data for this dataset.")
  (dataset-loader [this]
    "Return a dataset loader (an object that implements `IDatasetLoader`) for this dataset/driver.")
  (db [this]
    "Return `Database` containing test data for this driver.")
  (table-name->table [this table-name]
    "Given a TABLE-NAME keyword like `:venues`, *fetch* the corresponding `Table`.")
  (table-name->id [this table-name]
    "Given a TABLE-NAME keyword like `:venues`, return corresponding `Table` ID.")
  (field-name->id [this table-name field-name]
    "Given keyword TABLE-NAME and FIELD-NAME, return the corresponding `Field` ID.")
  (fks-supported? [this]
    "Does this driver support Foreign Keys?")
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

;; ## Mongo

(deftype MongoDriverData []
  IDataset
  (load-data! [_]
    @mongo-data/mongo-test-db
    (assert (integer? @mongo-data/mongo-test-db-id)))

  (dataset-loader [_]
    (mongo/dataset-loader))

  (db [_]
    @mongo-data/mongo-test-db)

  (table-name->table [_ table-name]
    (mongo-data/table-name->table table-name))

  (table-name->id [_ table-name]
    (mongo-data/table-name->id table-name))

  (field-name->id [_ table-name field-name]
    (mongo-data/field-name->id table-name (if (= field-name :id) :_id
                                              field-name)))
  (format-name [_ table-or-field-name]
    (if (= table-or-field-name "id") "_id"
        table-or-field-name))

  (fks-supported?       [_] false)
  (default-schema       [_] nil)
  (id-field-type        [_] :IntegerField)
  (sum-field-type       [_] :IntegerField)
  (timestamp-field-type [_] :DateField))


;; ## Generic SQL

;; TODO - Mongo implementation (etc.) might find these useful
(def ^:private memoized-table-name->id
  (memoize
   (fn [db-id table-name]
     {:pre  [(string? table-name)]
      :post [(integer? %)]}
     (sel :one :id Table :name table-name, :db_id db-id))))

(def ^:private memoized-field-name->id
  (memoize
   (fn [db-id table-name field-name]
     {:pre  [(string? field-name)]
      :post [(integer? %)]}
     (sel :one :id Field :name field-name, :table_id (memoized-table-name->id db-id table-name)))))

(defn- generic-sql-load-data! [{:keys [dbpromise], :as this}]
  (when-not (realized? dbpromise)
    (deliver dbpromise ((u/runtime-resolved-fn 'metabase.test.data 'get-or-create-database!) (dataset-loader this) data/test-data)))
  @dbpromise)

(def ^:private GenericSQLIDatasetMixin
  {:load-data!           generic-sql-load-data!
   :db                   generic-sql-load-data!
   :table-name->id       (fn [this table-name]
                           (memoized-table-name->id (:id (db this)) (name table-name)))
   :table-name->table    (fn [this table-name]
                           (Table (table-name->id this (name table-name))))
   :field-name->id       (fn [this table-name field-name]
                           (memoized-field-name->id (:id (db this)) (name table-name) (name field-name)))
   :format-name          (fn [_ table-or-field-name]
                           table-or-field-name)
   :fks-supported?       (constantly true)
   :timestamp-field-type (constantly :DateTimeField)
   :id-field-type        (constantly :IntegerField)})


;;; ### H2

(defrecord H2DriverData [dbpromise])

(extend H2DriverData
  IDataset
  (merge GenericSQLIDatasetMixin
         {:dataset-loader    (fn [_]
                               (h2/dataset-loader))
          :table-name->id    (fn [this table-name]
                               (memoized-table-name->id (:id (db this)) (s/upper-case (name table-name))))
          :table-name->table (fn [this table-name]
                               (Table (table-name->id this (s/upper-case (name table-name)))))
          :field-name->id    (fn [this table-name field-name]
                               (memoized-field-name->id (:id (db this)) (s/upper-case (name table-name)) (s/upper-case (name field-name))))
          :default-schema    (constantly "PUBLIC")
          :format-name       (fn [_ table-or-field-name]
                               (clojure.string/upper-case table-or-field-name))
          :id-field-type     (constantly :BigIntegerField)
          :sum-field-type    (constantly :BigIntegerField)}))


;;; ### Postgres

(defrecord PostgresDriverData [dbpromise])

(extend PostgresDriverData
  IDataset
  (merge GenericSQLIDatasetMixin
         {:dataset-loader (fn [_]
                            (postgres/dataset-loader))
          :default-schema (constantly "public")
          :sum-field-type (constantly :IntegerField)}))


;;; ### MySQL

(defrecord MySQLDriverData [dbpromise])

(extend MySQLDriverData
  IDataset
  (merge GenericSQLIDatasetMixin
         {:dataset-loader (fn [_]
                            (mysql/dataset-loader))
          :default-schema (constantly nil)
          :sum-field-type (constantly :BigIntegerField)}))


;; # Concrete Instances

(def dataset-name->dataset
  "Map of dataset keyword name -> dataset instance (i.e., an object that implements `IDataset`)."
  {:mongo    (MongoDriverData.)
   :h2       (H2DriverData. (promise))
   :postgres (PostgresDriverData. (promise))
   :mysql    (MySQLDriverData. (promise))})

(def ^:const all-valid-dataset-names
  "Set of names of all valid datasets."
  (set (keys dataset-name->dataset)))


;; # Logic for determining which datasets to test against

;; By default, we'll test against against only the :h2 (H2) dataset; otherwise, you can specify which
;; datasets to test against by setting the env var `MB_TEST_DATASETS` to a comma-separated list of dataset names, e.g.
;;
;;    # test against :h2 and :mongo
;;    MB_TEST_DATASETS=generic-sql,mongo
;;
;;    # just test against :h2 (default)
;;    MB_TEST_DATASETS=generic-sql

(defn- get-test-datasets-from-env
  "Return a set of dataset names to test against from the env var `MB_TEST_DATASETS`."
  []
  (when-let [env-drivers (some-> (env :mb-test-datasets)
                                 s/lower-case)]
    (some->> (s/split env-drivers #",")
             (map keyword)
             ;; Double check that the specified datasets are all valid
             (map (fn [dataset-name]
                    (assert (contains? all-valid-dataset-names dataset-name)
                            (format "Invalid dataset specified in MB_TEST_DATASETS: %s" (name dataset-name)))
                    dataset-name))
             set)))

(defonce ^:const
  ^{:doc (str "Set of names of drivers we should run tests against. "
              "By default, this only contains `:h2` but can be overriden by setting env var `MB_TEST_DATASETS`.")}
  test-dataset-names
  (let [datasets (or (get-test-datasets-from-env)
                     #{:h2})]
    (log/info (color/green "Running QP tests against these datasets: " datasets))
    datasets))


;; # Helper Macros

(def ^:dynamic *dataset*
  "The dataset we're currently testing against, bound by `with-dataset`.
   Defaults to `:h2`."
  (dataset-name->dataset (if (contains? test-dataset-names :h2) :h2
                             (first test-dataset-names))))

(defmacro with-dataset
  "Bind `*dataset*` to the dataset with DATASET-NAME and execute BODY."
  [dataset-name & body]
  `(binding [*dataset* (dataset-name->dataset ~dataset-name)]
     ~@body))

(defmacro when-testing-dataset
  "Execute BODY only if we're currently testing against DATASET-NAME."
  [dataset-name & body]
  `(when (contains? test-dataset-names ~dataset-name)
     ~@body))

(defmacro with-dataset-when-testing
  "When testing DATASET-NAME, binding `*dataset*` and executes BODY."
  [dataset-name & body]
  `(when-testing-dataset ~dataset-name
     (with-dataset ~dataset-name
       ~@body)))

(defmacro expect-when-testing-dataset
  "Generate a unit test that only runs if we're currently testing against DATASET-NAME."
  [dataset-name expected actual]
  `(expect
       (when-testing-dataset ~dataset-name
         ~expected)
     (when-testing-dataset ~dataset-name
       ~actual)))

(defmacro expect-with-dataset
  "Generate a unit test that only runs if we're currently testing against DATASET-NAME, and that binds `*dataset*` to the current dataset."
  [dataset-name expected actual]
  `(expect-when-testing-dataset ~dataset-name
     (with-dataset ~dataset-name
       ~expected)
     (with-dataset ~dataset-name
       ~actual)))

(defmacro expect-with-datasets
  "Generate unit tests for all datasets in DATASET-NAMES; each test will only run if we're currently testing the corresponding dataset.
   `*dataset*` is bound to the current dataset inside each test."
  [dataset-names expected actual]
  `(do ~@(map (fn [dataset-name]
                `(expect-with-dataset ~dataset-name ~expected ~actual))
              dataset-names)))

(defmacro expect-with-all-datasets
  "Generate unit tests for all valid datasets; each test will only run if we're currently testing the corresponding dataset.
  `*dataset*` is bound to the current dataset inside each test."
  [expected actual]
  `(expect-with-datasets ~all-valid-dataset-names ~expected ~actual))

(defmacro dataset-case
  "Case statement that switches off of the current dataset.

     (dataset-case
       :h2       ...
       :postgres ...)"
  [& pairs]
  `(cond ~@(mapcat (fn [[dataset then]]
                     (assert (contains? all-valid-dataset-names dataset))
                     [`(= *dataset* (dataset-name->dataset ~dataset))
                      then])
                   (partition 2 pairs))))

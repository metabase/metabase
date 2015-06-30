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
  (format-name [this table-or-field-name]
    "Transform a lowercase string `Table` or `Field` name in a way appropriate for this dataset
     (e.g., `h2` would want to upcase these names; `mongo` would want to use `\"_id\"` in place of `\"id\"`.")
  (id-field-type [this]
    "Return the `base_type` of the `id` `Field` (e.g. `:IntegerField` or `:BigIntegerField`).")
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
  (fks-supported? [_]
    false)
  (format-name [_ table-or-field-name]
    (if (= table-or-field-name "id") "_id"
        table-or-field-name))
  (id-field-type [_]
    :IntegerField)
  (timestamp-field-type [_]
    :DateField))


;; ## Generic SQL (H2)

;; TODO - Mongo implementation (etc.) might find these useful
(def ^:private memoized-table-name->id
  (memoize
   (fn [db-id table-name]
     (sel :one :id Table :name (s/upper-case (name table-name)), :db_id db-id))))

(def ^:private memoized-field-name->id
  (memoize
   (fn [db-id table-name field-name]
     (sel :one :id Field :name (s/upper-case (name field-name)), :table_id (memoized-table-name->id db-id table-name)))))

(def ^:private generic-sql-db
  (delay ))

(deftype GenericSqlDriverData [dataset-loader-fn
                               dbpromise]
  IDataset
  (dataset-loader [_]
    (dataset-loader-fn))

  (load-data! [this]
    (when-not (realized? dbpromise)
      (deliver dbpromise ((u/runtime-resolved-fn 'metabase.test.data 'get-or-create-database!) (dataset-loader this) data/test-data)))
    @dbpromise)

  (db [this]
    (load-data! this))

  (table-name->id [this table-name]
    (memoized-table-name->id (:id (db this)) table-name))

  (table-name->table [this table-name]
    (sel :one Table :id (table-name->id this table-name)))

  (field-name->id [this table-name field-name]
    (memoized-field-name->id (:id (db this)) table-name field-name))

  (fks-supported? [_]
    true)

  (format-name [_ table-or-field-name]
    (clojure.string/upper-case table-or-field-name))

  (id-field-type [_]
    :BigIntegerField)

  (timestamp-field-type [_]
    :DateTimeField))


;; # Concrete Instances

(def dataset-name->dataset
  "Map of dataset keyword name -> dataset instance (i.e., an object that implements `IDataset`)."
  {:mongo       (MongoDriverData.)
   :generic-sql (GenericSqlDriverData. h2/dataset-loader (promise))

   ;; TODO - make sure we have pg connection info
   :postgres    (GenericSqlDriverData. postgres/dataset-loader (promise))})

(def ^:const all-valid-dataset-names
  "Set of names of all valid datasets."
  (set (keys dataset-name->dataset)))


;; # Logic for determining which datasets to test against

;; By default, we'll test against against only the :generic-sql (H2) dataset; otherwise, you can specify which
;; datasets to test against by setting the env var `MB_TEST_DATASETS` to a comma-separated list of dataset names, e.g.
;;
;;    # test against :generic-sql and :mongo
;;    MB_TEST_DATASETS=generic-sql,mongo
;;
;;    # just test against :generic-sql (default)
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

(def test-dataset-names
  "Delay that returns set of names of drivers we should run tests against.
   By default, this returns only `:generic-sql`, but can be overriden by setting env var `MB_TEST_DATASETS`."
  (delay (let [datasets (or (get-test-datasets-from-env)
                            #{:generic-sql})]
           (log/info (color/green "Running QP tests against these datasets: " datasets))
           datasets)))


;; # Helper Macros

(def ^:dynamic *dataset*
  "The dataset we're currently testing against, bound by `with-dataset`.
   Defaults to `:generic-sql`."
  (dataset-name->dataset :generic-sql))

(defmacro with-dataset
  "Bind `*dataset*` to the dataset with DATASET-NAME and execute BODY."
  [dataset-name & body]
  `(binding [*dataset* (dataset-name->dataset ~dataset-name)]
     ~@body))

(defmacro when-testing-dataset
  "Execute BODY only if we're currently testing against DATASET-NAME."
  [dataset-name & body]
  `(when (contains? @test-dataset-names ~dataset-name)
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

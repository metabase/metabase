(ns metabase.test.data.datasets
  "Interface + implementations for loading test datasets for different drivers, and getting information about the dataset's tables, fields, etc."
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            [colorize.core :as color]
            [environ.core :refer [env]]
            [metabase.driver.mongo.test-data :as mongo-data]
            [metabase.test-data :as generic-sql-data]))

;; # IDataset

(defprotocol IDataset
  "Functions needed to fetch test data for various drivers."
  (load-data! [this]
    "Load the test data for this dataset.")
  (db [this]
    "Return `Database` containing test data for this driver.")
  (table-name->table [this table-name]
    "Given a TABLE-NAME keyword like `:venues`, *fetch* the corresponding `Table`.")
  (field-name->id [this table-name field-name]
    "Given keyword TABLE-NAME and FIELD-NAME, return the corresponding `Field` ID.")
  (fks-supported? [this]
    "Does this driver support Foreign Keys?")
  (format-name [this table-or-field-name]
    "Transform a lowercase string `Table` or `Field` name in a way appropriate for this dataset
     (e.g., `h2` would want to upcase these names; `mongo` would want to use `\"_id\"` in place of `\"id\"`.")
  (id-field-type [this]
    "Return the `base_type` of the `id` `Field` (e.g. `:IntegerField` or `:BigIntegerField`)."))


;; # Implementations

;; ## Mongo

(deftype MongoDriverData []
  IDataset
  (load-data! [_]
    (mongo-data/destroy!)
    @mongo-data/mongo-test-db
    (assert (integer? @mongo-data/mongo-test-db-id)))

  (db [_]
    @mongo-data/mongo-test-db)
  (table-name->table [_ table-name]
    (mongo-data/table-name->table table-name))
  (field-name->id [_ table-name field-name]
    (mongo-data/field-name->id table-name (if (= field-name :id) :_id
                                              field-name)))
  (fks-supported? [_]
    false)
  (format-name [_ table-or-field-name]
    (if (= table-or-field-name "id") "_id"
        table-or-field-name))

  (id-field-type [_]
    :IntegerField))


;; ## Generic SQL

(deftype GenericSqlDriverData []
  IDataset
  (load-data! [_]
    @generic-sql-data/test-db
    (assert (integer? @generic-sql-data/db-id)))

  (db [_]
    @generic-sql-data/test-db)
  (table-name->table [_ table-name]
    (generic-sql-data/table-name->table table-name))
  (field-name->id [_ table-name field-name]
    (generic-sql-data/field->id table-name field-name))

  (fks-supported? [_]
    true)
  (format-name [_ table-or-field-name]
    (clojure.string/upper-case table-or-field-name))

  (id-field-type [_]
    :BigIntegerField))


;; # Concrete Instances

(def ^:const dataset-name->dataset
  "Map of dataset keyword name -> dataset instance (i.e., an object that implements `IDataset`)."
  {:mongo       (MongoDriverData.)
   :generic-sql (GenericSqlDriverData.)})

(def ^:const all-valid-dataset-names
  "Set of names of all valid datasets."
  (set (keys dataset-name->dataset)))


;; # Logic for determining which datasets to test against

;; By default, we'll test against *all* datasets; otherwise, you can test against only a
;; subset of them by setting the env var `MB_TEST_DATASETS` to a comma-separated list of driver names, e.g.
;;
;;    # test against :generic-sql and :mongo
;;    MB_TEST_DATASETS=generic-sql,mongo
;;
;;    # just test against :generic-sql
;;    MB_TEST_DATASETS=generic-sql

(defn- get-test-datasets-from-env
  "Return a set of dataset names to test against from the env var `MB_TEST_DATASETS`."
  []
  (when-let [env-drivers (some-> (env :mb-test-datasets)
                                 s/lower-case)]
    (->> (s/split env-drivers #",")
         (map keyword)
         ;; Double check that the specified datasets are all valid
         (map (fn [dataset-name]
                (assert (contains? all-valid-dataset-names dataset-name)
                        (format "Invalid dataset specified in MB_TEST_DATASETS: %s" (name dataset-name)))
                dataset-name))
         set)))

(def test-dataset-names
  "Delay that returns set of names of drivers we should run tests against.
   By default, this returns *all* drivers, but can be overriden by setting env var `MB_TEST_DATASETS`."
  (delay (let [datasets (or (get-test-datasets-from-env)
                            all-valid-dataset-names)]
           (log/info (color/green "Running QP tests against these datasets: " datasets))
           datasets)))

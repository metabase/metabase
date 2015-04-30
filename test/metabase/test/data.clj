(ns metabase.test.data
  "Eventual replacement for `metabase.test-data`.
  Designed to handle multiple test data sets more nicely."
  (:require [clojure.tools.logging :as log]
            [colorize.core :as color]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.models [database :refer [Database]]
                             [org :refer [Org]])
            (metabase.test.data [interface :as i]))
  (:import metabase.test.data.h2.H2TestData
           metabase.test.data.mongo.MongoTestData))

;; ## Test Org

(def ^:const ^:private test-org-name "Test Organization")

(def test-org
  (delay (or (sel :one Org :name test-org-name)
             (ins Org
               :name test-org-name
               :slug "test"
               :inherits true))))

(def test-org-id
  (delay (:id @test-org)))


;; ## Test Data Instances

(def h2    (H2TestData.))
(def mongo (MongoTestData.))

(def engine-name->test-data
  {:h2    h2
   :mongo mongo})

(def ^:dynamic *engine*
  :h2)

(defn test-data []
  (engine-name->test-data *engine*))

(defmacro with-test-data [engine-name & body]
  `(binding [*engine*    ~engine-name]
     (assert (test-data))
     ~@body))


;; ## Implementation-Agnostic Fns

(defn load! []
  (log/debug (color/cyan (format "Loading %s test data..." (name *engine*))))
  (i/load! (test-data))
  (let [db (ins Database
             :engine          *engine*
             :organization_id @test-org-id
             :name            (db-name (test-data))
             :details         {:conn_str (connection-str (test-data))})]
    (driver/sync-database! db)
    (log/debug (color/green "Done."))
    db))

(defn db []
  (let [db (or (sel :one Database :name (i/db-name (test-data)))
               (load!))]
    (assert (map? db))
    db))

(def db-id
  (let [engine-name->db-id (memoize
                            (fn [engine-name]
                              {:post [(integer? engine-name)]}
                              (with-test-data engine-name
                                (:id (db)))))])
  (fn []
    (engine-name->db-id *engine*)))

(defn destroy! []
  (cascade-delete Database :name (db-name (test-data))))

(defn table-name->table [table-name]
  {:pre [(keyword? table-name)]
   :post [(map? %)]}
  (i/table-name->table (test-data) (db-id) table-name))

(def table-name->id
  (let [engine+table-name->id (memoize
                               (fn [engine-name table-name]
                                 {:pre [(keyword? table-name)]
                                  :post [(integer? %)]}
                                 (with-test-data engine-name
                                   (i/table-name->id (test-data) (db-id) table-name))))]
    (fn [table-name]
      (engine+table-name->id *engine* table-name))))

(defn field-name->field [table-name field-name]
  {:pre [(keyword? table-name)
         (keyword? field-name)]
   :post [(map? %)]}
  (i/field-name->field (test-data) table-name field-name))

(defn field-name->id [table-name field-name]
  {:pre [(keyword? table-name)
         (keyword? field-name)]
   :post [(integer? %)]}
  (i/field-name->id (test-data) table-name field-name))


;; ## Fns that Run Across *All* Test Datasets

(defn load-all! []
  (doseq [[engine test-data] engine-name->test-data]

    (i/load! test-data)
    (log/debug (color/green "Ok."))))

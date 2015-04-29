(ns metabase.driver.mongo.test-data
  "Functionality related to creating / loading a test database for the Mongo driver."
  (:require [colorize.core :as color]
            [medley.core :as m]
            (monger [collection :as mc]
                    [core :as mg])
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.mongo.util :refer [with-mongo-connection]]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.test-data :refer :all]
            [metabase.test-data.data :as data]))

(declare load-data)

;; ## CONSTANTS

(def ^:private ^:const mongo-test-db-conn-str
  "Connection string for the Metabase Mongo Test DB." ; TODO - this needs to come from env var or something so we can get tests working in CircleCI too
  "mongodb://localhost/metabase-test")

(def ^:private ^:const mongo-test-db-name
  "Name of the Mongo test database."
  "Mongo Test")


;; ## MONGO-TEST-DB + OTHER DELAYS

(def mongo-test-db
  "A delay that fetches or creates the Mongo test `Database`.
   If DB is created, `load-data` and `sync-database!` are called to get the DB in a state that we can use for testing."
  (delay (or (sel :one Database :name mongo-test-db-name)
             (let [db (ins Database
                        :organization_id @org-id
                        :name mongo-test-db-name
                        :engine :mongo
                        :details {:conn_str mongo-test-db-conn-str})]
               (load-data)
               (driver/sync-database! db)
               db))))

(def mongo-test-db-id
  "A Delay that returns the ID of `mongo-test-db`, forcing creation of it if needed."
  (delay (:id @mongo-test-db)))


;; ## FNS FOR GETTING RELEVANT TABLES / FIELDS

(def ^{:arglists '([table-name])} table-name->table
  "Return Mongo test database `Table` with given name.

     (table-name->table :users)
       -> {:id 10, :name \"users\", ...}"
  (let [-table-name->table (delay (m/map-keys keyword (sel :many :field->obj [Table :name] :db_id @mongo-test-db-id)))]
    (fn [table-name]
      {:pre [(or (keyword? table-name)
                 (string? table-name))]
       :post [(map? %)]}
      (@-table-name->table (keyword table-name)))))

(defn table-name->id [table-name]
  {:pre [(or (keyword? table-name)
             (string? table-name))]
   :post [(integer? %)]}
  (:id (table-name->table (keyword table-name))))

(defn table-name->field-name->field [table-name]
  (let [table (table-name->table table-name)]))


;; ## LOADING STUFF

(defn- load-data
  "Load the data for the Mongo test database. This can safely be called multiple times; duplicate documents will *not* be inserted."
  []
  (with-mongo-connection [mongo-db @mongo-test-db]
    (doseq [[collection {fields :fields rows :rows}] data/test-data]
      (let [fields (map :name fields)
            rows (map-indexed (partial vector) rows)]
        (doseq [[i row] rows]
          (try
            (mc/insert mongo-db (name collection) (assoc (zipmap fields row)
                                                         :_id (inc i)))
            (catch com.mongodb.MongoException$DuplicateKey _)))
        (println (color/cyan (format "Loaded data for collection '%s'." (name collection))))))))

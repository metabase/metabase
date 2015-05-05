(ns metabase.driver.mongo.test-data
  "Functionality related to creating / loading a test database for the Mongo driver."
  (:require [clojure.tools.logging :as log]
            [colorize.core :as color]
            [medley.core :as m]
            (monger [collection :as mc]
                    [core :as mg])
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.mongo.util :refer [with-mongo-connection]]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.test-data :refer [org-id]]
            [metabase.test-data.data :as data]))

(declare load-data
         set-field-special-types!)

;; ## CONSTANTS

(def ^:private ^:const mongo-test-db-conn-str
  "Connection string for the Metabase Mongo Test DB." ; TODO - does this need to come from an env var so it works in CircleCI?
  "mongodb://localhost/metabase-test")

(def ^:private ^:const mongo-test-db-name
  "Name of the Mongo test database."
  "Mongo Test")


;; ## MONGO-TEST-DB + OTHER DELAYS

(defn destroy!
  "Remove `Database`, `Tables`, and `Fields` for the Mongo test DB."
  []
  #_(cascade-delete Database :name mongo-test-db-name))

(defonce
  ^{:doc "A delay that fetches or creates the Mongo test `Database`.
          If DB is created, `load-data` and `sync-database!` are called to get the DB in a state that we can use for testing."}
  mongo-test-db
  (delay (let [db (or (sel :one Database :name mongo-test-db-name)
                      (let [db (ins Database
                                 :organization_id @org-id
                                 :name mongo-test-db-name
                                 :engine :mongo
                                 :details {:conn_str mongo-test-db-conn-str})]
                        (log/info (color/cyan "Loading Mongo test data..."))
                        (load-data)
                        (driver/sync-database! db)
                        (set-field-special-types!)
                        (log/info (color/cyan "Done."))
                        db))]
           (assert (and (map? db)
                        (integer? (:id db))
                        (exists? Database :id (:id db))))
           db)))

(defonce
  ^{:doc "A Delay that returns the ID of `mongo-test-db`, forcing creation of it if needed."}
  mongo-test-db-id
  (delay (let [id (:id @mongo-test-db)]
           (assert (integer? id))
           id)))


;; ## FNS FOR GETTING RELEVANT TABLES / FIELDS

(defn table-name->table
  "Fetch `Table` for Mongo test database.

    (table-name->table :users) -> {:id 100, :name \"users\", ...}"
  [table-name]
  {:pre [(keyword? table-name)]
   :post [(map? %)]}
  (assert (exists? Database :id @mongo-test-db-id)
          (format "Database with ID %d no longer exists!?" @mongo-test-db-id))
  (sel :one Table :db_id @mongo-test-db-id :name (name table-name)))

(def ^{:arglists '([table-name])} table-name->id
  "Return ID of `Table` for Mongo test database (memoized).

    (table-name->id :users) -> 10"
  (memoize
   (fn [table-name]
     {:pre [(keyword? table-name)]
      :post [(integer? %)]}
     (:id (table-name->table table-name)))))

(defn table-name->field-name->field
  "Return a map of `field-name -> field` for `Table` for Mongo test database."
  [table-name]
  (m/map-keys keyword (sel :many :field->obj [Field :name] :table_id (table-name->id table-name))))

(defn field-name->field
  "Fetch `Field` for Mongo test database.

    (field-name->field :users :name) -> {:id 292, :name \"name\", ...}"
  [table-name field-name]
  {:pre [(keyword? table-name)
         (keyword? field-name)]
   :post [(map? %)]}
  ((table-name->field-name->field table-name) field-name))

(def ^{:arglists '([table-name field-name])} field-name->id
  "Return ID of `Field` for Mongo test Database (memoized).

    (field-name->id :users :name) -> 292"
  (memoize
   (fn [table-name field-name]
     {:pre [(keyword? table-name)
            (keyword? field-name)]
      :post [(integer? %)]}
     (:id (field-name->field table-name field-name)))))


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
        (log/info (color/cyan (format "Loaded data for collection '%s'." (name collection))))))))

(defn- set-field-special-types! []
  (doseq [[collection-name {fields :fields}] data/test-data]
    (doseq [{:keys [special-type] :as field} fields]
      (when special-type
        (let [table-id (sel :one :id Table :name (name collection-name))
              _        (assert (integer? table-id))
              field-id (sel :one :id Field :table_id table-id :name (name (:name field)))
              _        (assert (integer? table-id))]
          (log/info (format "SET SPECIAL TYPE %s.%s -> %s..." collection-name (:name field) special-type))
          (upd Field field-id :special_type special-type))))))

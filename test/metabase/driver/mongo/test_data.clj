(ns metabase.driver.mongo.test-data
  "Functionality related to creating / loading a test database for the Mongo driver."
  (:require [medley.core :as m]
            [metabase.db :refer :all]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.test.data :refer [get-or-create-database!]]
            (metabase.test.data [data :as data]
                                [mongo :as loader])))

;; ## MONGO-TEST-DB + OTHER DELAYS

(defonce
  ^{:doc "A delay that fetches or creates the Mongo test `Database`.
          If DB is created, `load-data` and `sync-database!` are called to get the DB in a state that we can use for testing."}
  mongo-test-db
  (delay (get-or-create-database! (loader/dataset-loader) data/test-data)))

(defonce
  ^{:doc "A Delay that returns the ID of `mongo-test-db`, forcing creation of it if needed."}
  mongo-test-db-id
  (delay (let [id (:id @mongo-test-db)]
           (assert (integer? id))
           id)))


;; ## FNS FOR GETTING RELEVANT TABLES / FIELDS
;; TODO - This seems like it's duplicated a bit with the functions in metabase.test.data

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

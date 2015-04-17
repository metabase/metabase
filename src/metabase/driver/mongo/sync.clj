(ns metabase.driver.mongo.sync
  (:require [clojure.core.reducers :as r]
            [clojure.set :as set]
            (monger [collection :as mc]
                    [command :as cmd]
                    [conversion :as conv]
                    [core :as mg]
                    [db :as mdb]
                    [query :as q])
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.mongo.util :refer [with-db-connection]]
            [metabase.driver.sync :as common]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]])))

(def -db (delay (sel :one Database :name "Mongo Test DB")))
(def -conn-str (delay (:conn_str (:details @-db))))

(defn get-collection-names
  "Return a set of the string names of all collections in database specified by DETAILS-MAP."
  {:arglists '([database])}
  [{{connection-string :conn_str} :details}]
  (with-db-connection [db connection-string]
    (-> (mdb/get-collection-names db)
        (set/difference #{"system.indexes"}))))

(defn get-column-names
  "This is *slow* (!)

    (get-columns-names @-db \"zips\") -> #{:_id :pop :city :state :loc}"
  [database collection-name]
  (with-db-connection [db (:conn_str (:details database))]
    (->> (mc/find-maps db collection-name)
         (r/map keys)            ; core.reducers makes this *slightly* faster
         (r/map set)             ; but still *slow*
         (r/reduce set/union))))


(defn get-num-items-in-collection
  "Return the number of items (i.e., rows) in a collection.

    (get-num-items-in-collection @-db \"zips\") -> 29353"
  {:arglists '([database collection-name])}
  [{{connection-string :conn_str} :details} collection-name]
  (with-db-connection [db connection-string]
    (-> (cmd/collection-stats db collection-name)
        (conv/from-db-object :keywordize)
        :count)))

;; METHOD IMPLEMENTATIONS

(declare sync-collection)

(defmethod driver/sync-database :mongo
  [{{connection-string :conn_str} :details db-id :id :as database}]
  ;; Use top-level with-db-connection so subsequent calls will re-use same connection
  (with-db-connection [_ connection-string]
    ;; Create new Tables as needed + mark old ones as inactive
    (common/sync-database-create-tables database (get-collection-names database))

    ;; Now sync all the active tables
    (common/sync-active-tables database
      (fn [table]
        (sync-collection database table)))))

(defn- table-active-field-name->base-type
  "Return a map of active Field names -> Field base types for TABLE."
  [database {table-name :name}]
  (->> (get-column-names database table-name)
       (map (fn [column-name]
              {(name column-name) :UnknownField})) ; TODO - obviously these aren't supposed to be :UnknownField
       (into {})))

(defn- sync-collection [database {table-id :id table-name :name :as table}]
  ;; Update Fields for the collection
  (common/sync-table-create-fields table (table-active-field-name->base-type database table))

  ;; Sync Metadata
  (common/sync-table-metadata table :row-count-fn #(get-num-items-in-collection database (:name %))))

(defmethod driver/sync-table :mongo [{database :db :as table}]
  (sync-collection @database table))

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
    ;; Create Collections we need to create
    ;; TODO: Need to mark inactive collections
    ;; TODO: This is inefficient (1 DB call per collection name) -- do a single call the way we do w/ generic SQL
    (->> (get-collection-names database)
         (map (fn [collection-name]
                (or (sel :one Table :db_id db-id :name collection-name)
                    (ins Table :db_id db-id :name collection-name :active true))))
         dorun)
    ;; Now sync all the active tables
    (->> (sel :many Table :db_id db-id :active true)
         (pmap (partial sync-collection database))
         dorun)))

(defn- sync-collection [database {collection-name :name table-id :id :as table}]
  ;; Update # items in collection
  (upd Table table-id :rows (get-num-items-in-collection database collection-name))

  ;; Update Fields for the collection
  (let [column-names (get-column-names database collection-name)
        existing-column-names (set (sel :many :field [Field :name] :table_id table-id))]
    ;; Create new Fields as needed
    (->> column-names
         (map name)
         (filter (partial (complement contains?) existing-column-names))
         (map (fn [column-name]
                (ins Field
                  :name (name column-name)
                  :table_id table-id
                  :active true
                  :base_type :UnknownField)
                )) ; TODO - Obviously these aren't supposed to all be :UnknownField
         dorun)
    ;; TODO - need to mark inactive fields
    ))

(defmethod driver/sync-table :mongo [table]
  "TODO")

(ns metabase.driver.mongo
  "MongoDB Driver."
  (:require [clojure.core.reducers :as r]
            [clojure.set :as set]
            [clojure.tools.logging :as log]
            [colorize.core :as color]
            [medley.core :as m]
            (monger [collection :as mc]
                    [command :as cmd]
                    [conversion :as conv]
                    [core :as mg]
                    [db :as mdb]
                    [query :as mq])
            [metabase.driver :as driver]
            [metabase.driver.interface :refer :all]
            (metabase.driver.mongo [query-processor :as qp]
                                   [util :refer [*mongo-connection* with-mongo-connection values->base-type]])))

(declare driver)

;;; ### Driver Helper Fns

(defn- table->column-names
  "Return a set of the column names for TABLE."
  [table]
  (with-mongo-connection [^com.mongodb.DBApiLayer conn @(:db table)]
    (->> (mc/find-maps conn (:name table))
         (take 10000)                      ; it's probably enough to only consider the first 10,000 docs in the collection instead of iterating over potentially millions of them
         (map keys)
         (map set)
         (reduce set/union))))

(defn- field->base-type
  "Determine the base type of FIELD in the most ghetto way possible, via `values->base-type`."
  [field]
  {:pre [(map? field)]
   :post [(keyword? %)]}
  (with-mongo-connection [_ @(:db @(:table field))]
    (values->base-type (field-values-lazy-seq driver field))))


;;; ## MongoDriver

(def ^:const ^:private mongo-driver-features
  "Optional features supported by the Mongo driver."
  #{:nested-fields})

(deftype MongoDriver []
  IDriver
;;; ### Features
  (supports? [_ feature]
    (contains? mongo-driver-features feature))

;;; ### Connection
  (can-connect? [_ database]
    (with-mongo-connection [^com.mongodb.DBApiLayer conn database]
      (= (-> (cmd/db-stats conn)
             (conv/from-db-object :keywordize)
             :ok)
         1.0)))

  (can-connect-with-details? [this details]
    (can-connect? this {:details details}))

;;; ### QP
  (process-query [_ query]
    (qp/process-and-run query))

;;; ### Syncing
  (sync-in-context [_ database do-sync-fn]
      (with-mongo-connection [_ database]
        (do-sync-fn)))

  (active-table-names [_ database]
    (with-mongo-connection [^com.mongodb.DBApiLayer conn database]
      (-> (mdb/get-collection-names conn)
          (set/difference #{"system.indexes"}))))

  (active-column-names->type [_ table]
    (with-mongo-connection [_ @(:db table)]
      (into {} (for [column-name (table->column-names table)]
                 {(name column-name)
                  (field->base-type {:name  (name column-name)
                                     :table (delay table)})}))))

  (table-pks [_ _]
    #{"_id"})

  ISyncDriverFieldValues
  (field-values-lazy-seq [_ {:keys [qualified-name-components table], :as field}]
    {:pre [(map? field)
           (delay? qualified-name-components)
           (delay? table)]}
    (lazy-seq
     (assert *mongo-connection*
             "You must have an open Mongo connection in order to get lazy results with field-values-lazy-seq.")
     (let [table           @table
           name-components (rest @qualified-name-components)]
       (map #(get-in % (map keyword name-components))
            (mq/with-collection *mongo-connection* (:name table)
              (mq/fields [(apply str (interpose "." name-components))]))))))

  ISyncDriverFieldNestedFields
  (active-nested-field-name->type [this field]
    ;; Build a map of nested-field-key -> type -> count
    ;; TODO - using an atom isn't the *fastest* thing in the world (but is the easiest); consider alternate implementation
    (let [field->type->count (atom {})]
      ;; Look at the first 1000 values
      (doseq [val (take 1000 (field-values-lazy-seq this field))]
        (when (map? val)
          (doseq [[k v] val]
            (swap! field->type->count update-in [k (type v)] #(if % (inc %) 1)))))
      ;; (seq types) will give us a seq of pairs like [java.lang.String 500]
      (->> @field->type->count
           (m/map-vals (fn [type->count]
                         (->> (seq type->count) ; convert to pairs of [type count]
                              (sort-by second)  ; source by count
                              last    ; take last item (highest count)
                              first   ; keep just the type
                              (#(or (driver/class->base-type %) ; convert to corresponding Field base_type if possible
                                    :UnknownField))))))))) ; fall back to :UnknownField for things like clojure.lang.PersistentVector

(def driver
  "Concrete instance of the MongoDB driver."
  (MongoDriver.))

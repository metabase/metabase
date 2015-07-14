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
                                   [util :refer [*mongo-connection* with-mongo-connection values->base-type]])
            [metabase.util :as u]))

(declare driver)

;; TODO - this isn't necessarily Mongo-specific
(def ^:private ^:const document-scanning-limit
  "The maximum number of documents to scan to look for Fields.
   We can't feasibly scan every document in a million+ document collection, so scan the first `document-scanning-limit`
   documents and hope that the rest follow the same schema."
  10000)

;;; ### Driver Helper Fns

(defn- table->column-names
  "Return a set of the column names for TABLE."
  [table]
  (with-mongo-connection [^com.mongodb.DBApiLayer conn @(:db table)]
    (->> (mc/find-maps conn (:name table))
         (take document-scanning-limit)
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
  (wrap-process-query-middleware [_ qp]
    (fn [query]
      (with-mongo-connection [^com.mongodb.DBApiLayer conn (:database query)]
        (qp query))))

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
                  (field->base-type {:name                      (name column-name)
                                     :table                     (delay table)
                                     :qualified-name-components (delay [(:name table) (name column-name)])})}))))

  (table-pks [_ _]
    #{"_id"})

  ISyncDriverFieldValues
  (field-values-lazy-seq [_ {:keys [qualified-name-components table], :as field}]
    (assert (and (map? field)
                 (delay? qualified-name-components)
                 (delay? table))
            (format "Field is missing required information:\n%s" (u/pprint-to-str 'red field)))
    (lazy-seq
     (assert *mongo-connection*
             "You must have an open Mongo connection in order to get lazy results with field-values-lazy-seq.")
     (let [table           @table
           name-components (rest @qualified-name-components)]
       (assert (seq name-components))
       (map #(get-in % (map keyword name-components))
            (mq/with-collection *mongo-connection* (:name table)
              (mq/fields [(apply str (interpose "." name-components))]))))))

  ISyncDriverFieldNestedFields
  (active-nested-field-name->type [this field]
    ;; Build a map of nested-field-key -> type -> count
    ;; TODO - using an atom isn't the *fastest* thing in the world (but is the easiest); consider alternate implementation
    (let [field->type->count (atom {})]
      (doseq [val (take document-scanning-limit (field-values-lazy-seq this field))]
        (when (map? val)
          (doseq [[k v] val]
            (swap! field->type->count update-in [k (type v)] #(if % (inc %) 1)))))
      ;; (seq types) will give us a seq of pairs like [java.lang.String 500]
      (->> @field->type->count
           (m/map-vals (fn [type->count]
                         (->> (seq type->count)                 ; convert to pairs of [type count]
                              (sort-by second)                  ; source by count
                              last                              ; take last item (highest count)
                              first                             ; keep just the type
                              driver/class->base-type)))))))    ; get corresponding Field base_type

(def driver
  "Concrete instance of the MongoDB driver."
  (MongoDriver.))

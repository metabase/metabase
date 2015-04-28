(ns metabase.driver.mongo
  "MongoDB Driver."
  (:require [clojure.core.reducers :as r]
            [clojure.set :as set]
            [clojure.tools.logging :as log]
            [colorize.core :as color]
            (monger [collection :as mc]
                    [command :as cmd]
                    [conversion :as conv]
                    [core :as mg]
                    [db :as mdb]
                    [query :as mq])
            [metabase.driver :as driver]
            [metabase.driver.interface :refer :all]
            (metabase.driver.mongo [query-processor :as qp]
                                   [util :refer [*mongo-connection* with-mongo-connection]])))

(declare driver)

;;; ### Driver Helper Fns

(defn- table->column-names
  "Return a set of the column names for TABLE."
  [table]
  (with-mongo-connection [conn @(:db table)]
    (->> (mc/find-maps conn (:name table))
         (r/map keys)
         (r/map set)
         (r/reduce set/union))))

(defn- field->base-type
  "Determine the base type of FIELD in the most ghetto way possible.
   This just gets counts the types of *every* value of FIELD and returns the class whose count was highest."
  [field]
  {:pre [(map? field)]
   :post [(keyword? %)]}
  (with-mongo-connection [_ @(:db @(:table field))]
    (or (->> (field-values-lazy-seq driver field)
             (filter identity)
             (group-by type)
             (map (fn [[type valus]]
                    [type (count valus)]))
             (sort-by second)
             first
             first
             driver/class->base-type)
        :UnknownField)))


;;; ## MongoDriver

(deftype MongoDriver []
  IDriver
;;; ### Connection
  (can-connect? [_ database]
    (with-mongo-connection [conn database]
      (= (-> (cmd/db-stats conn)
             (conv/from-db-object :keywordize)
             :ok)
         1.0)))

  (can-connect-with-details? [this {:keys [user password host port dbname]}]
    (can-connect? this (str "mongodb://"
                            user
                            (when password
                              (assert user "Can't have a password without a user!")
                              (str ":" password))
                            (when user "@")
                            host
                            (when port
                              (str ":" port))
                            "/"
                            dbname)))

;;; ### QP
  (process-query [_ query]
    (qp/process-and-run query))

;;; ### Syncing
  (sync-in-context [_ database do-sync-fn]
      (with-mongo-connection [_ database]
        (do-sync-fn)))

  (active-table-names [_ database]
    (with-mongo-connection [conn database]
      (-> (mdb/get-collection-names conn)
          (set/difference #{"system.indexes"}))))

  (active-column-names->type [this table]
    (with-mongo-connection [_ @(:db table)]
      (->> (table->column-names table)
           (map (fn [column-name]
                  {(name column-name)
                   (field->base-type {:name (name column-name)
                                      :table (delay table)})}))
           (into {}))))

  (table-pks [_ _]
    #{"_id"})

  ISyncDriverFieldValues
  (field-values-lazy-seq [_ field]
    (lazy-seq
     (let [table @(:table field)]
       (with-mongo-connection [conn @(:db table)]
         (mq/with-collection conn (:name table)
           (mq/fields [(:name field)])))))))

(def ^:const driver
  "Concrete instance of the MongoDB driver."
  (MongoDriver.))

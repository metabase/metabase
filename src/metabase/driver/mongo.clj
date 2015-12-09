(ns metabase.driver.mongo
  "MongoDB Driver."
  (:require [clojure.set :as set]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            (monger [collection :as mc]
                    [command :as cmd]
                    [conversion :as conv]
                    [core :as mg]
                    [db :as mdb]
                    [query :as mq])
            [metabase.driver :as driver]
            [metabase.driver.util :as driver-util]
            (metabase.driver.mongo [query-processor :as qp]
                                   [util :refer [*mongo-connection* with-mongo-connection]])
            [metabase.util :as u]))

(declare driver field-values-lazy-seq)

;;; ### Driver Helper Fns

(defn- table->column-names
  "Return a set of the column names for TABLE."
  [_ table]
  (with-mongo-connection [^com.mongodb.DB conn @(:db table)]
    (->> (mc/find-maps conn (:name table))
         (take driver/max-sync-lazy-seq-results)
         (map keys)
         (map set)
         (reduce set/union))))

(defn- field->base-type
  "Determine the base type of FIELD in the most ghetto way possible, via `values->base-type`."
  [driver field]
  (with-mongo-connection [_ @(:db @(:table field))]
    (driver-util/field->base-type driver field)))


;;; ## MongoDriver

(defn- can-connect? [_ details]
  (with-mongo-connection [^com.mongodb.DB conn details]
    (= (-> (cmd/db-stats conn)
           (conv/from-db-object :keywordize)
           :ok)
       1.0)))

(defn- humanize-connection-error-message [_ message]
  (condp re-matches message
    #"^Timed out after \d+ ms while waiting for a server .*$"
    (driver/connection-error-messages :cannot-connect-check-host-and-port)

    #"^host and port should be specified in host:port format$"
    (driver/connection-error-messages :invalid-hostname)

    #"^Password can not be null when the authentication mechanism is unspecified$"
    (driver/connection-error-messages :password-required)

    #".*"                               ; default
    message))

(defn- process-query-in-context [_ qp]
  (fn [query]
    (with-mongo-connection [^com.mongodb.DB conn (:database query)]
      (qp query))))


;;; ### Syncing

(defn- sync-in-context [_ database do-sync-fn]
  (with-mongo-connection [_ database]
    (do-sync-fn)))

(defn- active-tables [_ database]
  (with-mongo-connection [^com.mongodb.DB conn database]
    (set (for [collection (set/difference (mdb/get-collection-names conn) #{"system.indexes"})]
           {:name collection}))))


(defn- field-values-lazy-seq [_ {:keys [qualified-name-components table], :as field}]
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

(defn- active-nested-field-name->type [_ field]
  ;; Build a map of nested-field-key -> type -> count
  ;; TODO - using an atom isn't the *fastest* thing in the world (but is the easiest); consider alternate implementation
  (let [field->type->count (atom {})]
    (doseq [val (take driver/max-sync-lazy-seq-results (field-values-lazy-seq nil field))]
      (when (map? val)
        (doseq [[k v] val]
          (swap! field->type->count update-in [k (type v)] #(if % (inc %) 1)))))
    ;; (seq types) will give us a seq of pairs like [java.lang.String 500]
    (->> @field->type->count
         (m/map-vals (fn [type->count]
                       (->> (seq type->count)             ; convert to pairs of [type count]
                            (sort-by second)              ; source by count
                            last                          ; take last item (highest count)
                            first                         ; keep just the type
                            driver-util/class->base-type))))))

(defrecord MongoDriver []
  clojure.lang.Named
  (getName [_] "MongoDB"))

(extend MongoDriver
  driver-util/IDriverTableToColumnNames
  {:table->column-names table->column-names}

  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:active-column-names->type         driver-util/ghetto-active-column-names->type
          :active-nested-field-name->type    active-nested-field-name->type
          :active-tables                     active-tables
          :can-connect?                      can-connect?
          :details-fields                    (constantly [{:name         "host"
                                                           :display-name "Host"
                                                           :default      "localhost"}
                                                          {:name         "port"
                                                           :display-name "Port"
                                                           :type         :integer
                                                           :default      27017}
                                                          {:name         "dbname"
                                                           :display-name "Database name"
                                                           :placeholder  "carrierPigeonDeliveries"
                                                           :required     true}
                                                          {:name         "user"
                                                           :display-name "Database username"
                                                           :placeholder  "What username do you use to login to the database?"}
                                                          {:name         "pass"
                                                           :display-name "Database password"
                                                           :type         :password
                                                           :placeholder  "******"}
                                                          {:name         "ssl"
                                                           :display-name "Use a secure connection (SSL)?"
                                                           :type         :boolean
                                                           :default      false}])
          :features                          (constantly #{:nested-fields})
          :field-values-lazy-seq             field-values-lazy-seq
          :humanize-connection-error-message humanize-connection-error-message
          :process-native                    qp/process-and-run-native
          :process-structured                qp/process-and-run-structured
          :process-query-in-context          process-query-in-context
          :sync-in-context                   sync-in-context
          :table-pks                         (constantly #{"_id"})}))

(driver/register-driver! :mongo (MongoDriver.))

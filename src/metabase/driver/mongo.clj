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
            [metabase.driver :as driver, :refer [defdriver]]
            (metabase.driver.mongo [query-processor :as qp]
                                   [util :refer [*mongo-connection* with-mongo-connection values->base-type]])
            [metabase.util :as u]))

(declare driver
         field-values-lazy-seq)

;;; ### Driver Helper Fns

(defn- table->column-names
  "Return a set of the column names for TABLE."
  [table]
  (with-mongo-connection [^com.mongodb.DB conn @(:db table)]
    (->> (mc/find-maps conn (:name table))
         (take driver/max-sync-lazy-seq-results)
         (map keys)
         (map set)
         (reduce set/union))))

(defn- field->base-type
  "Determine the base type of FIELD in the most ghetto way possible, via `values->base-type`."
  [field]
  {:pre [(map? field)]
   :post [(keyword? %)]}
  (with-mongo-connection [_ @(:db @(:table field))]
    (values->base-type (field-values-lazy-seq field))))


;;; ## MongoDriver

(defn- can-connect? [details]
  (with-mongo-connection [^com.mongodb.DB conn details]
    (= (-> (cmd/db-stats conn)
           (conv/from-db-object :keywordize)
           :ok)
       1.0)))

(defn- humanize-connection-error-message [message]
  (condp re-matches message
    #"^Timed out after \d+ ms while waiting for a server .*$"
    (driver/connection-error-messages :cannot-connect-check-host-and-port)

    #"^host and port should be specified in host:port format$"
    (driver/connection-error-messages :invalid-hostname)

    #"^Password can not be null when the authentication mechanism is unspecified$"
    (driver/connection-error-messages :password-required)

    #".*"                               ; default
    message))

(defn- process-query-in-context [qp]
  (fn [query]
    (with-mongo-connection [^com.mongodb.DB conn (:database query)]
      (qp query))))

(defn- process-query [query]
  (qp/process-and-run query))

;;; ### Syncing
(defn- sync-in-context [database do-sync-fn]
  (with-mongo-connection [_ database]
    (do-sync-fn)))

(defn- active-table-names [database]
  (with-mongo-connection [^com.mongodb.DB conn database]
    (-> (mdb/get-collection-names conn)
        (set/difference #{"system.indexes"}))))

(defn- active-column-names->type [table]
  (with-mongo-connection [_ @(:db table)]
    (into {} (for [column-name (table->column-names table)]
               {(name column-name)
                (field->base-type {:name                      (name column-name)
                                   :table                     (delay table)
                                   :qualified-name-components (delay [(:name table) (name column-name)])})}))))

(defn- field-values-lazy-seq [{:keys [qualified-name-components table], :as field}]
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

(defn- active-nested-field-name->type [field]
  ;; Build a map of nested-field-key -> type -> count
  ;; TODO - using an atom isn't the *fastest* thing in the world (but is the easiest); consider alternate implementation
  (let [field->type->count (atom {})]
    (doseq [val (take driver/max-sync-lazy-seq-results (field-values-lazy-seq field))]
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
                            driver/class->base-type))))))

(defdriver mongo
  {:driver-name                       "MongoDB"
   :details-fields                    [{:name         "host"
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
                                        :default      false}]
   :features                          #{:nested-fields}
   :can-connect?                      can-connect?
   :active-table-names                active-table-names
   :field-values-lazy-seq             field-values-lazy-seq
   :active-column-names->type         active-column-names->type
   :table-pks                         (constantly #{"_id"})
   :process-query                     process-query
   :process-query-in-context          process-query-in-context
   :sync-in-context                   sync-in-context
   :humanize-connection-error-message humanize-connection-error-message
   :active-nested-field-name->type    active-nested-field-name->type})

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
            (metabase.driver.mongo [query-processor :as qp]
                                   [util :refer [*mongo-connection* with-mongo-connection values->base-type]])
            [metabase.util :as u]
            [cheshire.core :as json]))

(declare driver field-values-lazy-seq)


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

(defmacro swallow-exceptions [& body]
  `(try ~@body (catch Exception e#)))

(defn- val->special-type [val]
  (cond
    ;; 1. url?
    (and (string? val)
         (u/is-url? val)) :url
    ;; 2. json?
    (and (string? val)
         (or (.startsWith "{" val)
             (.startsWith "[" val))) (when-let [j (swallow-exceptions (json/parse-string val))]
                                           (when (or (map? j)
                                                     (sequential? j))
                                             :json))))

(defn- update-field-attrs [field-value field]
  (let [safe-inc #(inc (or % 0))]
    (-> field
        (update :count safe-inc)
        (update :len #(if (string? field-value)
                       (+ (or % 0) (.length field-value))
                       %))
        (update :types (fn [types]
                         (update types (type field-value) safe-inc)))
        (update :special-types (fn [special-types]
                                 (if-let [st (val->special-type field-value)]
                                   (update special-types st safe-inc)
                                   special-types))))))

;; TODO: nesting?
(defn- describe-table-field [field-kw field-def]
  ;; TODO: indicate preview-display status based on :len
  (cond-> {:name      (name field-kw)
           :base-type (->> (into [] (:types field-def))
                           (sort-by second)
                           last
                           first
                           driver/class->base-type)}
          (= :_id field-kw) (assoc :pk? true)
          (:special-types field-def) (assoc :special-type (->> (into [] (:special-types field-def))
                                                               (filter #(not (nil? (first %))))
                                                               (sort-by second)
                                                               last
                                                               first))))

(defn describe-database
  [_ database]
  (with-mongo-connection [^com.mongodb.DB conn database]
    {:tables (set (for [collection (set/difference (mdb/get-collection-names conn) #{"system.indexes"})]
                    {:name collection}))}))

(defn describe-table
  [_ table]
  (with-mongo-connection [^com.mongodb.DB conn @(:db table)]
    (let [parsed-rows (->> (mc/find-maps conn (:name table))
                           (take driver/max-sync-lazy-seq-results)
                           (reduce
                             (fn [field-defs row]
                               (loop [[k & more-keys] (keys row)
                                      fields field-defs]
                                 (if-not k
                                   fields
                                   (recur more-keys (update fields k (partial update-field-attrs (k row)))))))
                             {}))]
      ;; TODO: handle nested dictionaries
      {:name   (:name table)
       :fields (set (for [field (keys parsed-rows)]
                      (describe-table-field field (field parsed-rows))))})))

(defn analyze-table
  [driver table]
  {})

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
                            driver/class->base-type))))))

(defrecord MongoDriver []
  clojure.lang.Named
  (getName [_] "MongoDB"))

(extend MongoDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:active-nested-field-name->type    active-nested-field-name->type
          :analyze-table                     analyze-table
          :can-connect?                      can-connect?
          :describe-database                 describe-database
          :describe-table                    describe-table
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
          :sync-in-context                   sync-in-context}))

(driver/register-driver! :mongo (MongoDriver.))

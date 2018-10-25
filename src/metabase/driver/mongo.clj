(ns metabase.driver.mongo
  "MongoDB Driver."
  (:require [cheshire.core :as json]
            [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.mongo
             [query-processor :as qp]
             [util :refer [with-mongo-connection]]]
            [metabase.models.database :refer [Database]]
            [metabase.util.ssh :as ssh]
            [monger
             [collection :as mc]
             [command :as cmd]
             [conversion :as conv]
             [db :as mdb]]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import com.mongodb.DB))

;;; ## MongoDriver

(defn- can-connect? [details]
  (with-mongo-connection [^DB conn, details]
    (= (float (-> (cmd/db-stats conn)
                  (conv/from-db-object :keywordize)
                  :ok))
       1.0)))

(defn- humanize-connection-error-message [message]
  (condp re-matches message
    #"^Timed out after \d+ ms while waiting for a server .*$"
    (driver/connection-error-messages :cannot-connect-check-host-and-port)

    #"^host and port should be specified in host:port format$"
    (driver/connection-error-messages :invalid-hostname)

    #"^Password can not be null when the authentication mechanism is unspecified$"
    (driver/connection-error-messages :password-required)

    #"^com.jcraft.jsch.JSchException: Auth fail$"
    (driver/connection-error-messages :ssh-tunnel-auth-fail)

    #".*JSchException: java.net.ConnectException: Connection refused.*"
    (driver/connection-error-messages :ssh-tunnel-connection-fail)

    #".*"                               ; default
    message))

(defn- process-query-in-context [qp]
  (fn [{database-id :database, :as query}]
    (with-mongo-connection [_ (db/select-one [Database :details], :id database-id)]
      (qp query))))


;;; ### Syncing

(declare update-field-attrs)

(defn- sync-in-context [database do-sync-fn]
  (with-mongo-connection [_ database]
    (do-sync-fn)))

(defn- val->special-type [field-value]
  (cond
    ;; 1. url?
    (and (string? field-value)
         (u/url? field-value))
    :type/URL

    ;; 2. json?
    (and (string? field-value)
         (or (.startsWith "{" field-value)
             (.startsWith "[" field-value)))
    (when-let [j (u/ignore-exceptions (json/parse-string field-value))]
      (when (or (map? j)
                (sequential? j))
        :type/SerializedJSON))))

(defn- find-nested-fields [field-value nested-fields]
  (loop [[k & more-keys] (keys field-value)
         fields nested-fields]
    (if-not k
      fields
      (recur more-keys (update fields k (partial update-field-attrs (k field-value)))))))

(defn- update-field-attrs [field-value field-def]
  (-> field-def
      (update :count u/safe-inc)
      (update :len #(if (string? field-value)
                      (+ (or % 0) (count field-value))
                      %))
      (update :types (fn [types]
                       (update types (type field-value) u/safe-inc)))
      (update :special-types (fn [special-types]
                               (if-let [st (val->special-type field-value)]
                                 (update special-types st u/safe-inc)
                                 special-types)))
      (update :nested-fields (fn [nested-fields]
                               (if (map? field-value)
                                 (find-nested-fields field-value nested-fields)
                                 nested-fields)))))

(s/defn ^:private ^Class most-common-object-type :- (s/maybe Class)
  "Given a sequence of tuples like [Class <number-of-occurances>] return the Class with the highest number of
  occurances. The basic idea here is to take a sample of values for a Field and then determine the most common type
  for its values, and use that as the Metabase base type. For example if we have a Field called `zip_code` and it's a
  number 90% of the time and a string the other 10%, we'll just call it a `:type/Number`."
  [field-types :- [(s/pair (s/maybe Class) "Class", s/Int "Int")]]
  (->> field-types
       (sort-by second)
       last
       first))

(defn- describe-table-field [field-kw field-info]
  (let [most-common-object-type (most-common-object-type (vec (:types field-info)))]
    (cond-> {:name          (name field-kw)
             :database-type (some-> most-common-object-type .getName)
             :base-type     (driver/class->base-type most-common-object-type)}
      (= :_id field-kw)           (assoc :pk? true)
      (:special-types field-info) (assoc :special-type (->> (vec (:special-types field-info))
                                                            (filter #(some? (first %)))
                                                            (sort-by second)
                                                            last
                                                            first))
      (:nested-fields field-info) (assoc :nested-fields (set (for [field (keys (:nested-fields field-info))]
                                                               (describe-table-field field (field (:nested-fields field-info)))))))))

(defn- describe-database [database]
  (with-mongo-connection [^com.mongodb.DB conn database]
    {:tables (set (for [collection (disj (mdb/get-collection-names conn) "system.indexes")]
                    {:schema nil, :name collection}))}))

(defn- table-sample-column-info
  "Sample the rows (i.e., documents) in `table` and return a map of information about the column keys we found in that
   sample. The results will look something like:

      {:_id      {:count 200, :len nil, :types {java.lang.Long 200}, :special-types nil, :nested-fields nil},
       :severity {:count 200, :len nil, :types {java.lang.Long 200}, :special-types nil, :nested-fields nil}}"
  [^com.mongodb.DB conn, table]
  (try
    (->> (mc/find-maps conn (:name table))
         (take driver/max-sample-rows)
         (reduce
          (fn [field-defs row]
            (loop [[k & more-keys] (keys row), fields field-defs]
              (if-not k
                fields
                (recur more-keys (update fields k (partial update-field-attrs (k row)))))))
          {}))
    (catch Throwable t
      (log/error (format "Error introspecting collection: %s" (:name table)) t))))

(defn- describe-table [database table]
  (with-mongo-connection [^com.mongodb.DB conn database]
    (let [column-info (table-sample-column-info conn table)]
      {:schema nil
       :name   (:name table)
       :fields (set (for [[field info] column-info]
                      (describe-table-field field info)))})))


(defrecord MongoDriver []
  :load-ns true
  clojure.lang.Named
  (getName [_] "MongoDB"))

(u/strict-extend MongoDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:can-connect?                      (u/drop-first-arg can-connect?)
          :describe-database                 (u/drop-first-arg describe-database)
          :describe-table                    (u/drop-first-arg describe-table)
          :details-fields                    (constantly (ssh/with-tunnel-config
                                                           [driver/default-host-details
                                                            (assoc driver/default-port-details :default 27017)
                                                            (assoc driver/default-dbname-details
                                                              :placeholder  (tru "carrierPigeonDeliveries"))
                                                            (assoc driver/default-user-details :required false)
                                                            (assoc driver/default-password-details :name "pass")
                                                            {:name         "authdb"
                                                             :display-name (tru "Authentication Database")
                                                             :placeholder  (tru "Optional database to use when authenticating")}
                                                            driver/default-ssl-details
                                                            (assoc driver/default-additional-options-details
                                                              :display-name (tru "Additional Mongo connection string options")
                                                              :placeholder  "readPreference=nearest&replicaSet=test")]))
          :execute-query                     (u/drop-first-arg qp/execute-query)
          :features                          (constantly #{:basic-aggregations :nested-fields})
          :humanize-connection-error-message (u/drop-first-arg humanize-connection-error-message)
          :mbql->native                      (u/drop-first-arg qp/mbql->native)
          :process-query-in-context          (u/drop-first-arg process-query-in-context)
          :sync-in-context                   (u/drop-first-arg sync-in-context)}))

(defn -init-driver
  "Register the MongoDB driver"
  []
  (driver/register-driver! :mongo (MongoDriver.)))

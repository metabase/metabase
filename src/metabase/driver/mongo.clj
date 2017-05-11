(ns metabase.driver.mongo
  "MongoDB Driver."
  (:require [cheshire.core :as json]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.mongo
             [query-processor :as qp]
             [util :refer [*mongo-connection* with-mongo-connection]]]
            [metabase.models
             [database :refer [Database]]
             [field :as field]
             [table :as table]]
            [metabase.sync-database.analyze :as analyze]
            [metabase.util.ssh :as ssh]
            [monger
             [collection :as mc]
             [command :as cmd]
             [conversion :as conv]
             [db :as mdb]
             [query :as mq]]
            [toucan.db :as db])
  (:import com.mongodb.DB))

;;; ## MongoDriver

(defn- can-connect? [details]
  (with-mongo-connection [^DB conn, details]
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

    #"^com.jcraft.jsch.JSchException: Auth fail$"
    (driver/connection-error-messages :ssh-tunnel-auth-fail)

    #"j^ava.net.ConnectException: Connection refused (Connection refused)$"
    (driver/connection-error-messages :ssh-tunnel-connection-fail)

    #".*"                               ; default
    message))

(defn- process-query-in-context [qp]
  (fn [{database-id :database, :as query}]
    (with-mongo-connection [^DB conn, (db/select-one [Database :details], :id database-id)]
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
         (u/is-url? field-value)) :type/URL
    ;; 2. json?
    (and (string? field-value)
         (or (.startsWith "{" field-value)
             (.startsWith "[" field-value))) (when-let [j (u/try-apply json/parse-string field-value)]
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

(defn- describe-table-field [field-kw field-info]
  ;; TODO: indicate preview-display status based on :len
  (cond-> {:name      (name field-kw)
           :base-type (->> (vec (:types field-info))
                           (sort-by second)
                           last
                           first
                           driver/class->base-type)}
    (= :_id field-kw)           (assoc :pk? true)
    (:special-types field-info) (assoc :special-type (->> (vec (:special-types field-info))
                                                          (filter #(not (nil? (first %))))
                                                          (sort-by second)
                                                          last
                                                          first))
    (:nested-fields field-info) (assoc :nested-fields (set (for [field (keys (:nested-fields field-info))]
                                                             (describe-table-field field (field (:nested-fields field-info))))))))

(defn- describe-database [database]
  (with-mongo-connection [^com.mongodb.DB conn database]
    {:tables (set (for [collection (disj (mdb/get-collection-names conn) "system.indexes")]
                    {:schema nil, :name collection}))}))

(defn- describe-table [database table]
  (with-mongo-connection [^com.mongodb.DB conn database]
    ;; TODO: ideally this would take the LAST set of rows added to the table so we could ensure this data changes on reruns
    (let [parsed-rows (try
                        (->> (mc/find-maps conn (:name table))
                             (take driver/max-sync-lazy-seq-results)
                             (reduce
                               (fn [field-defs row]
                                 (loop [[k & more-keys] (keys row)
                                        fields field-defs]
                                   (if-not k
                                     fields
                                     (recur more-keys (update fields k (partial update-field-attrs (k row)))))))
                               {}))
                        (catch Throwable t
                          (log/error (format "Error introspecting collection: %s" (:name table)) t)))]
      {:schema nil
       :name   (:name table)
       :fields (set (for [field (keys parsed-rows)]
                      (describe-table-field field (field parsed-rows))))})))

(defn- analyze-table [table new-field-ids]
  ;; We only care about 1) table counts and 2) field values
  {:row_count (analyze/table-row-count table)
   :fields    (for [{:keys [id] :as field} (table/fields table)
                    :when (analyze/test-for-cardinality? field (contains? new-field-ids (:id field)))]
                (analyze/test:cardinality-and-extract-field-values field {:id id}))})

(defn- field-values-lazy-seq [{:keys [qualified-name-components table], :as field}]
  (assert (and (map? field)
               (delay? qualified-name-components)
               (delay? table))
    (format "Field is missing required information:\n%s" (u/pprint-to-str 'red field)))
  (lazy-seq
   (assert *mongo-connection*
     "You must have an open Mongo connection in order to get lazy results with field-values-lazy-seq.")
   (let [table           (field/table field)
         name-components (rest (field/qualified-name-components field))]
     (assert (seq name-components))
     (for [row (mq/with-collection *mongo-connection* (:name table)
                 (mq/fields [(s/join \. name-components)]))]
       (get-in row (map keyword name-components))))))


(defrecord MongoDriver []
  clojure.lang.Named
  (getName [_] "MongoDB"))

(u/strict-extend MongoDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:analyze-table                     (u/drop-first-arg analyze-table)
          :can-connect?                      (u/drop-first-arg can-connect?)
          :describe-database                 (u/drop-first-arg describe-database)
          :describe-table                    (u/drop-first-arg describe-table)
          :details-fields                    (constantly (ssh/with-tunnel-config
                                                           [{:name         "host"
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
                                                            {:name         "authdb"
                                                             :display-name "Authentication Database"
                                                             :placeholder  "Optional database to use when authenticating"}
                                                            {:name         "ssl"
                                                             :display-name "Use a secure connection (SSL)?"
                                                             :type         :boolean
                                                             :default      false}
                                                            {:name         "additional-options"
                                                             :display-name "Additional Mongo connection string options"
                                                             :placeholder  "readPreference=nearest&replicaSet=test"}]))
          :execute-query                     (u/drop-first-arg qp/execute-query)
          :features                          (constantly #{:basic-aggregations :dynamic-schema :nested-fields})
          :field-values-lazy-seq             (u/drop-first-arg field-values-lazy-seq)
          :humanize-connection-error-message (u/drop-first-arg humanize-connection-error-message)
          :mbql->native                      (u/drop-first-arg qp/mbql->native)
          :process-query-in-context          (u/drop-first-arg process-query-in-context)
          :sync-in-context                   (u/drop-first-arg sync-in-context)}))


(driver/register-driver! :mongo (MongoDriver.))

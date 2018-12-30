(ns metabase.driver.mongo
  "MongoDB Driver."
  (:require [cheshire
             [core :as json]
             [generate :as json.generate]]
            [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver.common :as driver.common]
            [metabase.driver.mongo
             [query-processor :as qp]
             [util :refer [with-mongo-connection]]]
            [metabase.query-processor.store :as qp.store]
            [monger
             [collection :as mc]
             [command :as cmd]
             [conversion :as conv]
             [db :as mdb]]
            [schema.core :as s])
  (:import com.mongodb.DB
           org.bson.BsonUndefined))

;; JSON Encoding (etc.)

;; Encode BSON undefined like `nil`
(json.generate/add-encoder org.bson.BsonUndefined json.generate/encode-nil)

(driver/register! :mongo)

;;; ## MongoDriver

(defmethod driver/can-connect? :mongo [_ details]
  (with-mongo-connection [^DB conn, details]
    (= (float (-> (cmd/db-stats conn)
                  (conv/from-db-object :keywordize)
                  :ok))
       1.0)))

(defmethod driver/humanize-connection-error-message :mongo [_ message]
  (condp re-matches message
    #"^Timed out after \d+ ms while waiting for a server .*$"
    (driver.common/connection-error-messages :cannot-connect-check-host-and-port)

    #"^host and port should be specified in host:port format$"
    (driver.common/connection-error-messages :invalid-hostname)

    #"^Password can not be null when the authentication mechanism is unspecified$"
    (driver.common/connection-error-messages :password-required)

    #"^com.jcraft.jsch.JSchException: Auth fail$"
    (driver.common/connection-error-messages :ssh-tunnel-auth-fail)

    #".*JSchException: java.net.ConnectException: Connection refused.*"
    (driver.common/connection-error-messages :ssh-tunnel-connection-fail)

    #".*"                               ; default
    message))

(defmethod driver/process-query-in-context :mongo [_ qp]
  (fn [{database-id :database, :as query}]
    (with-mongo-connection [_ (qp.store/database)]
      (qp query))))


;;; ### Syncing

(declare update-field-attrs)

(defmethod driver/sync-in-context :mongo [_ database do-sync-fn]
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

(defn- class->base-type [^Class klass]
  (if (isa? klass org.bson.types.ObjectId)
    :type/MongoBSONID
    (driver.common/class->base-type klass)))

(defn- describe-table-field [field-kw field-info]
  (let [most-common-object-type (most-common-object-type (vec (:types field-info)))]
    (cond-> {:name          (name field-kw)
             :database-type (some-> most-common-object-type .getName)
             :base-type     (class->base-type most-common-object-type)}
      (= :_id field-kw)           (assoc :pk? true)
      (:special-types field-info) (assoc :special-type (->> (vec (:special-types field-info))
                                                            (filter #(some? (first %)))
                                                            (sort-by second)
                                                            last
                                                            first))
      (:nested-fields field-info) (assoc :nested-fields (set (for [field (keys (:nested-fields field-info))]
                                                               (describe-table-field field (field (:nested-fields field-info)))))))))

(defmethod driver/describe-database :mongo [_ database]
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
         (take metadata-queries/max-sample-rows)
         (reduce
          (fn [field-defs row]
            (loop [[k & more-keys] (keys row), fields field-defs]
              (if-not k
                fields
                (recur more-keys (update fields k (partial update-field-attrs (k row)))))))
          {}))
    (catch Throwable t
      (log/error (format "Error introspecting collection: %s" (:name table)) t))))

(defmethod driver/describe-table :mongo [_ database table]
  (with-mongo-connection [^com.mongodb.DB conn database]
    (let [column-info (table-sample-column-info conn table)]
      {:schema nil
       :name   (:name table)
       :fields (set (for [[field info] column-info]
                      (describe-table-field field info)))})))

(defmethod driver/supports? [:mongo :basic-aggregations] [_ _] true)
(defmethod driver/supports? [:mongo :nested-fields]      [_ _] true)

(defmethod driver/mbql->native :mongo [_ query]
  (qp/mbql->native query))

(defmethod driver/execute-query :mongo [_ query]
  (qp/execute-query query))

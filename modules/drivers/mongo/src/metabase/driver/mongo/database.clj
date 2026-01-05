(ns metabase.driver.mongo.database
  "This namespace contains functions for work with mongo specific database and database details."
  (:refer-clojure :exclude [empty? not-empty])
  (:require
   [metabase.driver-api.core :as driver-api]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.performance :refer [empty? not-empty]])
  (:import
   (com.mongodb ConnectionString)))

(set! *warn-on-reflection* true)

(defn- fqdn?
  "A very simple way to check if a hostname is fully-qualified:
   Check if there are two or more periods in the name."
  [host]
  (<= 2 (-> host frequencies (get \. 0))))

(defn- validate-db-details! [{:keys [use-conn-uri conn-uri use-srv host] :as _db-details}]
  (when (and use-srv (not (fqdn? host)))
    (throw (ex-info (tru "Using DNS SRV requires a FQDN for host")
                    {:host host})))
  (when (and use-conn-uri (empty? (-> (ConnectionString. conn-uri) .getDatabase)))
    (throw (ex-info (tru "No database name specified in URI.")
                    {:host host}))))

(defn- update-ssl-db-details
  [db-details]
  ;; Must capture secret value BEFORE cleaning, as clean-secret-properties-from-details
  ;; will remove the secret properties (client-ssl-key-value or client-ssl-key-id)
  (let [client-ssl-key (driver-api/secret-value-as-string :mongo db-details "client-ssl-key")]
    (-> db-details
        (driver-api/clean-secret-properties-from-details :mongo)
        (assoc :client-ssl-key client-ssl-key))))

(defn details-normalized
  "Gets db-details for `database`. Details are then validated and ssl related keys are updated."
  [database]
  (let [db-details
        (cond
          (integer? database)             (driver-api/with-metadata-provider database
                                            (:details (driver-api/database (driver-api/metadata-provider))))
          (string? database)              {:dbname database}
          (:dbname (:details database))   (:details database) ; entire Database obj
          (:dbname database)              database            ; connection details map only
          (:conn-uri database)            database            ; connection URI has all the parameters
          (:conn-uri (:details database)) (:details database)
          :else
          (throw (ex-info (tru "Unable to to get database details.")
                          {:database database})))]
    (validate-db-details! db-details)
    (update-ssl-db-details db-details)))

(defn details->db-name
  "Get database name from database `:details`."
  ^String [{:keys [dbname conn-uri] :as _db-details}]
  (or (not-empty dbname) (-> (com.mongodb.ConnectionString. conn-uri) .getDatabase)))

(defn db-name
  "Get db-name from `database`. `database` value is something normalizable to database details."
  [database]
  (-> database details-normalized details->db-name))

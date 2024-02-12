(ns metabase.driver.mongo.database
  "This namespace contains functions for work with mongo specific database and database details."
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.models.secret :as secret]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]])
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
  (-> db-details
      (assoc :client-ssl-key (secret/get-secret-string db-details "client-ssl-key"))
      (dissoc :client-ssl-key-creator-id
              :client-ssl-key-created-at
              :client-ssl-key-id
              :client-ssl-key-source)))

(defn details-normalized
  "Gets db-details for `database`. Details are then validated and ssl related keys are updated."
  [database]
  (let [db-details
        (cond
          (integer? database)             (qp.store/with-metadata-provider database
                                            (:details (lib.metadata.protocols/database (qp.store/metadata-provider))))
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

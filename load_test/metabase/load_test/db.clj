(ns metabase.load-test.db
  "Setups a connection to an initialized db that can be used to create test fixtures"
  (:require
   [metabase.db.connection :as mdb.connection]
   [metabase.db.data-source :as mdb.data-source]
   [metabase.load-test.containers :as lt.containers]))

(defn- app-db-from-container
  [{:keys [db-config container-info]}]
  (prn container-info)
  (prn (:mapped-ports container-info))
  (mdb.connection/application-db
   (:db-type db-config)
   (mdb.data-source/broken-out-details->DataSource
    (:db-type db-config)
    (assoc db-config
           :host "localhost"
           :port (get (:mapped-ports container-info) (Integer/parseInt (:port db-config)))))))

(defn do-with-db-connection-from-system
  [thunk]
  (if-let [db-container (->> lt.containers/*container-system* (filter (fn [[k _]] (= "db" (namespace k)))) first second)]
    (binding [mdb.connection/*application-db* (app-db-from-container db-container)]
      (thunk))
    (throw (ex-info "Can't find db container" {:system lt.containers/*container-system*}))))

(defmacro with-container-db
  [& body]
  `(do-with-db-connection-from-system (fn [] ~@body)))

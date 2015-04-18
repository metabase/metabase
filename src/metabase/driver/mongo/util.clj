(ns metabase.driver.mongo.util
  (:require (monger [core :as mg])))

(def ^:dynamic *db-connection*
  "Bound by top-level `with-db-connection` so it may be reused within its body."
  nil)

(defmacro with-db-connection
  "Open a new MongoDB connection to CONNECTION-STRING, bind db to BINDING, execute BODY, and close the connection.

   The DB connection is re-used by subsequent calls to `with-db-connection` within BODY.

    (with-db-connection [db \"mongodb://127.0.0.1:27017/test\"]
      ...)"
  [[binding connection-string] & body]
  `(let [f# (fn [~binding]
              ~@body)]
     (if *db-connection* (f# *db-connection*)
         (let [connection-string# ~connection-string
               _ (assert connection-string# "with-db-connection failed: connection-string is nil.")
               {conn# :conn db-connection# :db} (mg/connect-via-uri connection-string#)]
           (println "<< OPENED NEW MONGODB CONNECTION >>") ; TODO - log/debug
           (try
             (binding [*db-connection* db-connection#]
               (f# *db-connection*))
             (finally
               (mg/disconnect conn#)))))))

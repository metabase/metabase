(ns metabase.driver.cassandra.util
  "`*cassandra-connection*`, `with-cassandra-connection`, and other functions shared between several Cassandra driver namespaces."
  (:require [clojure.tools.logging :as log]
            [clojurewerkz.cassaforte.client :as cc]
            [clojurewerkz.cassaforte.cql    :as cql]
            [clojurewerkz.cassaforte.query :refer :all]
            (metabase [driver :as driver]
                      [util :as u])))

(def ^:dynamic ^com.datastax.driver.core.SessionManager *cassandra-connection*
  "Connection to a Cassandra cluster.
   Bound by top-level `with-cassandra-connection` so it may be reused within its body."
  nil)

(defn -with-cassandra-connection
  "Run F with a new connection (bound to `*cassandra-connection*`) to DATABASE.
   Don't use this directly; use `with-cassandra-connection`."
  [f database]
  (println "Try Cassandra connect")
  (let [{:keys [dbname host port user pass ssl authdb]
         :or   {port 9042, pass "", ssl false}} (cond
                                                   (string? database)            {:dbname database}
                                                   (:dbname (:details database)) (:details database) ; entire Database obj
                                                   (:dbname database)            database            ; connection details map only
                                                   :else                         (throw (Exception. (str "with-mongo-connection failed: bad connection details:" (:details database)))))
        ; user             (when (seq user) ; ignore empty :user and :pass strings
        ;                    user)
        ; pass             (when (seq pass)
        ;                    pass)
        ; authdb           (if (seq authdb)
        ;                    authdb
        ;                    dbname)
        ; server-address   (mg/server-address host port)
        ; credentials      (when user
        ;                    (mcred/create user authdb pass))
        ; connect          (partial mg/connect server-address (build-connection-options :ssl? ssl))
        
        ; HOW TO
        ; (cc/connect ["127.0.0.1"])
        ; (cc/connect ["127.0.0.1"] {:keyspace "system"})

        ; conn             (if credentials
        ;                    (connect credentials)
        ;                    (connect))

        ; mongo-connection (mg/get-db conn dbname)

        conn (if dbname
                 (cc/connect [host] {:port port :keyspace dbname})
                 (cc/connect [host] {:port port}))
        ]
    (log/debug (u/format-color 'cyan "<< OPENED NEW CASSANDRA CONNECTION >>"))
    (try
      (binding [*cassandra-connection* conn]
        (f *cassandra-connection*))
      (finally
        (cc/disconnect conn)))))

(defmacro with-cassandra-connection
  [[binding database] & body]
  `(let [f# (fn [~binding]
              ~@body)]
     (if *cassandra-connection*
       (f# *cassandra-connection*)
       (-with-cassandra-connection f# ~database))))




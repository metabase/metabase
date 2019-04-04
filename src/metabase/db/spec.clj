(ns metabase.db.spec
  "Functions for creating JDBC DB specs for a given engine.
  Only databases that are supported as application DBs should have functions in this namespace;
  otherwise, similar functions are only needed by drivers, and belong in those namespaces.")

(defn h2
  "Create a Clojure JDBC database specification for a H2 database."
  [{:keys [db]
    :or   {db "h2.db"}
    :as   opts}]
  (merge {:classname   "org.h2.Driver"
          :subprotocol "h2"
          :subname     db}
         (dissoc opts :db)))

(defn- make-subname [host port db]
  (str "//" host ":" port "/" db))

(defn postgres
  "Create a Clojure JDBC database specification for a Postgres database."
  [{:keys [host port db]
    :or   {host "localhost", port 5432, db ""}
    :as   opts}]
  (merge
   {:classname                     "org.postgresql.Driver"
    :subprotocol                   "postgresql"
    :subname                       (make-subname host (or port 5432) db)
    ;; I think this is done to prevent conflicts with redshift driver registering itself to handle postgres://
    :OpenSourceSubProtocolOverride true}
   (dissoc opts :host :port :db)))

(defn mysql
  "Create a Clojure JDBC database specification for a MySQL or MariaDB database."
  [{:keys [host port db]
    :or   {host "localhost", port 3306, db ""}
    :as   opts}]
  (merge
   {:classname   "org.mariadb.jdbc.Driver"
    :subprotocol "mysql"
    :subname     (make-subname host (or port 3306) db)}
   (dissoc opts :host :port :db)))


;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;; !!                                                                                                               !!
;; !!   Don't put database spec functions for new drivers in this namespace. These ones are only here because they  !!
;; !!  can also be used for the application DB in metabase.driver. Put functions like these for new drivers in the  !!
;; !!                                            driver namespace itself.                                           !!
;; !!                                                                                                               !!
;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

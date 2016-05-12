(ns metabase.db.spec
  "Functions for creating various DB specs. These are adapted from `korma.db`.")

(defn h2
  "Create a database specification for an H2 database."
  [{:keys [db make-pool?]
    :or   {db "h2.db", make-pool? true}
    :as   opts}]
  (merge {:classname   "org.h2.Driver"
          :subprotocol "h2"
          :subname     db
          :make-pool?  make-pool?}
         (dissoc opts :db)))

(defn postgres
  "Create a database specification for a Postgres database."
  [{:keys [host port db make-pool?]
    :or   {host "localhost", port 5432, db "", make-pool? true}
    :as   opts}]
  (merge {:classname   "org.postgresql.Driver" ; must be in classpath
          :subprotocol "postgresql"
          :subname     (str "//" host ":" port "/" db)
          :make-pool?  make-pool?}
         (dissoc opts :host :port :db)))

(defn mysql
  "Create a database specification for a MySQL database."
  [{:keys [host port db make-pool?]
    :or   {host "localhost", port 3306, db "", make-pool? true}
    :as   opts}]
  (merge {:classname   "com.mysql.jdbc.Driver" ; must be in classpath
          :subprotocol "mysql"
          :subname     (str "//" host ":" port "/" db)
          :delimiters  "`"
          :make-pool?  make-pool?}
         (dissoc opts :host :port :db)))

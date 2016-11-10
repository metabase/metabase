(ns metabase.db.spec
  "Functions for creating JDBC DB specs for a given engine.")

(defn h2
  "Create a database specification for a h2 database. Opts should include a key
  for :db which is the path to the database file."
  [{:keys [db make-pool?]
    :or {db "h2.db", make-pool? true}
    :as opts}]
  (merge {:classname "org.h2.Driver" ; must be in classpath
          :subprotocol "h2"
          :subname db
          :make-pool? make-pool?}
         (dissoc opts :db)))

(defn postgres
  "Create a database specification for a postgres database. Opts should include
  keys for :db, :user, and :password. You can also optionally set host and
  port."
  [{:keys [host port db make-pool?]
    :or {host "localhost", port 5432, db "", make-pool? true}
    :as opts}]
  (merge {:classname "org.postgresql.Driver" ; must be in classpath
          :subprotocol "postgresql"
          :subname (str "//" host ":" port "/" db)
          :make-pool? make-pool?}
         (dissoc opts :host :port :db)))

(defn mysql
  "Create a database specification for a mysql database. Opts should include keys
  for :db, :user, and :password. You can also optionally set host and port.
  Delimiters are automatically set to \"`\"."
  [{:keys [host port db make-pool?]
    :or {host "localhost", port 3306, db "", make-pool? true}
    :as opts}]
  (merge {:classname "com.mysql.jdbc.Driver" ; must be in classpath
          :subprotocol "mysql"
          :subname (str "//" host ":" port "/" db)
          :delimiters "`"
          :make-pool? make-pool?}
         (dissoc opts :host :port :db)))


;; TODO - These other ones can acutally be moved directly into their respective drivers themselves since they're not supported as backing DBs

(defn mssql
  "Create a database specification for a mssql database. Opts should include keys
  for :db, :user, and :password. You can also optionally set host and port."
  [{:keys [user password db host port make-pool?]
    :or {user "dbuser", password "dbpassword", db "", host "localhost", port 1433, make-pool? true}
    :as opts}]
  (merge {:classname "com.microsoft.sqlserver.jdbc.SQLServerDriver" ; must be in classpath
          :subprotocol "sqlserver"
          :subname (str "//" host ":" port ";database=" db ";user=" user ";password=" password)
          :make-pool? make-pool?}
         (dissoc opts :host :port :db)))

(defn sqlite3
  "Create a database specification for a SQLite3 database. Opts should include a
  key for :db which is the path to the database file."
  [{:keys [db make-pool?]
    :or {db "sqlite.db", make-pool? true}
    :as opts}]
  (merge {:classname "org.sqlite.JDBC" ; must be in classpath
          :subprotocol "sqlite"
          :subname db
          :make-pool? make-pool?}
         (dissoc opts :db)))

(defn oracle
  "Create a database specification for an Oracle database. Opts should include keys
  for :user and :password. You can also optionally set host and port."
  [{:keys [host port]
    :or {host "localhost", port 1521}
    :as opts}]
  (merge {:subprotocol "oracle:thin"
          :subname     (str "@" host ":" port)}
         (dissoc opts :host :port)))


(defn impala
  "Create a database specification for a Impala database. Opts should include keys
  for :db, :user, and :password and authentication mechanism."
  [{:keys [host port db make-pool? authMech user password connProperties]
    :or {host "localhost", port 21050, db "default", make-pool? true, authMech "0" connProperties ""}
    :as opts}]
  (merge {:classname "com.cloudera.impala.jdbc41.Driver" ; must be in plugins directory
          :subprotocol "impala"
          :subname (str "//" host ":" port "/" db ";AuthMech=" authMech ";UID=" user ";PWD=" password  connProperties ";UseNativeQuery=1")  ;;Use UseNativeQuery=1 to prevent SQL rewriting by the JDBC driver
          :make-pool? make-pool?}
         (dissoc opts :host :port :db :connProperties)))

(ns dev
  "Put everything needed for REPL development within easy reach"
  (:require [clojure.java.jdbc :as jdbc]
            [metabase
             [core :as mbc]
             [db :as mdb]
             [driver :as driver]
             [handler :as handler]
             [plugins :as pluguns]
             [server :as server]
             [util :as u]]
            [metabase.api.common :as api-common]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]]
            [metabase.test.data :as data]
            [metabase.test.data.impl :as data.impl]))

(defn init!
  []
  (mbc/init!))

(defn start!
  []
  (metabase.server/start-web-server! #'metabase.handler/app)
  (metabase.db/setup-db!)
  (metabase.plugins/load-plugins!)
  (metabase.core.initialization-status/set-complete!))

(defn stop!
  []
  (metabase.server/stop-web-server!))

(defn restart!
  []
  (stop!)
  (start!))

(defn ns-unmap-all
  "Unmap all interned vars in a namespace. Reset the namespace to a blank slate! Perfect for when you rename everything
  and want to make sure you didn't miss a reference or when you redefine a multimethod.

    (ns-unmap-all *ns*)"
  ([]
   (ns-unmap-all *ns*))

  ([a-namespace]
   (doseq [[symb] (ns-interns a-namespace)]
     (ns-unmap a-namespace symb))))

(defn ns-unalias-all
  "Remove all aliases for other namespaces from the current namespace.

    (ns-unalias-all *ns*)"
  ([]
   (ns-unalias-all *ns*))

  ([a-namespace]
   (doseq [[symb] (ns-aliases a-namespace)]
     (ns-unalias a-namespace symb))))

(defmacro require-model
  "Rather than requiring all models inn the ns declaration, make it easy to require the ones you need for your current
  session"
  [model-sym]
  `(require [(symbol (str "metabase.models." (quote ~model-sym))) :as (quote ~model-sym)]))

(defmacro with-permissions
  [permissions & body]
  `(binding [api-common/*current-user-permissions-set* (delay ~permissions)]
     ~@body))

(defn query-jdbc-db
  "Execute a SQL query against a JDBC database. Useful for testing SQL syntax locally.

    (query-jdbc-db :oracle SELECT to_date('1970-01-01', 'YYYY-MM-DD') FROM dual\")

  `sql-args` can be either a SQL string or a tuple with a SQL string followed by any prepared statement args. By
  default this method uses the same methods to set prepared statement args and read columns from results as used by
  the `:sql-jdbc` Query Processor, but you pass the optional third arg `options`, as `nil` to use the driver's default
  behavior.

  You can query against a dataset other than the default test data DB by passing in a `[driver dataset]` tuple as the
  first arg:

    (dev/query-jdbc-db
     [:sqlserver 'test-data-with-time]
     [\"SELECT * FROM dbo.users WHERE dbo.users.last_login_time > ?\" (java-time/offset-time \"16:00Z\")])"
  {:arglists     '([driver sql-args]         [[driver dataset] sql-args]
                   [driver sql-args options] [[driver dataset] sql-args options])}
  ([driver-or-driver+dataset sql-args]
   (let [[driver dataset] (u/one-or-many driver-or-driver+dataset)]
     (query-jdbc-db
      driver-or-driver+dataset
      sql-args
      {:read-columns   (partial sql-jdbc.execute/read-columns driver)
       :set-parameters (partial sql-jdbc.execute/set-parameters driver)})))


  ([driver-or-driver+dataset sql-args options]
   (let [[driver dataset] (u/one-or-many driver-or-driver+dataset)]
     (driver/with-driver driver
       (letfn [(thunk []
                 (let [spec (sql-jdbc.conn/db->pooled-connection-spec (data/db))]
                   (jdbc/query spec sql-args options)))]
         (if dataset
           (data.impl/do-with-dataset (data.impl/resolve-dataset-definition *ns* dataset) thunk)
           (thunk)))))))

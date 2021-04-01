(ns dev
  "Put everything needed for REPL development within easy reach"
  (:require [clojure.core.async :as a]
            [dev.debug-qp :as debug-qp]
            [honeysql.core :as hsql]
            [metabase.api.common :as api-common]
            [metabase.core :as mbc]
            [metabase.core.initialization-status :as init-status]
            [metabase.db :as mdb]
            [metabase.db.connection :as mdb.connection]
            [metabase.db.setup :as mdb.setup]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.plugins :as plugins]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.server :as server]
            [metabase.server.handler :as handler]
            [metabase.test :as mt]
            [metabase.test.data.impl :as data.impl]
            [metabase.util :as u]
            [potemkin :as p]))

(comment debug-qp/keep-me)

(defn tap>-spy [x]
  (doto x tap>))

(p/import-vars
 [debug-qp process-query-debug])

(def initialized?
  (atom nil))

(defn init!
  []
  (mbc/init!)
  (reset! initialized? true))

(defn start!
  []
  (when-not @initialized?
    (init!))
  (server/start-web-server! #'handler/app)
  (mdb/setup-db!)
  (plugins/load-plugins!)
  (init-status/set-complete!))

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
     (ns-unmap a-namespace symb))
   (doseq [[symb varr] (ns-refers a-namespace)
           :when (not= (the-ns (:ns (meta varr)))
                       (the-ns 'clojure.core))]
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
  {:arglists '([driver sql]            [[driver dataset] sql]
               [driver honeysql-form]  [[driver dataset] honeysql-form]
               [driver [sql & params]] [[driver dataset] [sql & params]])}
  [driver-or-driver+dataset sql-args]
  (let [[driver dataset] (u/one-or-many driver-or-driver+dataset)
        [sql & params]   (if (map? sql-args)
                           (hsql/format sql-args)
                           (u/one-or-many sql-args))
        canceled-chan    (a/promise-chan)]
    (try
      (driver/with-driver driver
        (letfn [(thunk []
                  (with-open [conn (sql-jdbc.execute/connection-with-timezone driver (mt/db) (qp.timezone/report-timezone-id-if-supported))
                              stmt (sql-jdbc.execute/prepared-statement driver conn sql params)
                              rs   (sql-jdbc.execute/execute-prepared-statement! driver stmt)]
                    (let [rsmeta (.getMetaData rs)]
                      {:cols (sql-jdbc.execute/column-metadata driver rsmeta)
                       :rows (reduce conj [] (sql-jdbc.execute/reducible-rows driver rs rsmeta canceled-chan))})))]
          (if dataset
            (data.impl/do-with-dataset (data.impl/resolve-dataset-definition *ns* dataset) thunk)
            (thunk))))
      (catch InterruptedException e
        (a/>!! canceled-chan :cancel)
        (throw e)))))

(defn migrate!
  "Run migrations for the Metabase application database."
  []
  (mdb.setup/migrate! (mdb.connection/jdbc-spec) :up))

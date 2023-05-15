(ns dev
  "Put everything needed for REPL development within easy reach"
  (:require
   [clojure.core.async :as a]
   [dev.model-tracking :as model-tracking]
   [dev.debug-qp :as debug-qp]
   [honeysql.core :as hsql]
   [malli.dev :as malli-dev]
   [metabase.api.common :as api]
   [metabase.config :as config]
   [metabase.core :as mbc]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.env :as mdb.env]
   [metabase.db.setup :as mdb.setup]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.models.database :refer [Database]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.server :as server]
   [metabase.server.handler :as handler]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data.impl :as data.impl]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan.db :as db]
   [toucan2.core :as t2]
   [toucan2.connection :as t2.connection]
   [toucan2.pipeline :as t2.pipeline]))

(set! *warn-on-reflection* true)

(comment
  debug-qp/keep-me
  model-tracking/keep-me)

(defn tap>-spy [x]
  (doto x tap>))

(p/import-vars
 [debug-qp process-query-debug]
 [model-tracking
  track!
  untrack!
  untrack-all!
  reset-changes!
  changes])

(def initialized?
  (atom nil))

(defn init!
  []
  (mbc/init!)
  (reset! initialized? true))

(defn start!
  []
  (server/start-web-server! #'handler/app)
  (when config/is-dev?
    (with-out-str (malli-dev/start!)))
  (when-not @initialized?
    (init!)))

(defn stop!
  []
  (malli-dev/stop!)
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
  "Rather than requiring all models in the ns declaration, make it easy to require the ones you need for your current
  session"
  [model-sym]
  `(require [(symbol (str "metabase.models." (quote ~model-sym))) :as (quote ~model-sym)]))

(defmacro with-permissions
  "Execute the body with the given permissions."
  [permissions & body]
  `(binding [api/*current-user-permissions-set* (delay ~permissions)]
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
                  (with-open [conn (sql-jdbc.execute/connection-with-timezone driver (mt/db) (qp.timezone/report-timezone-id-if-supported driver (mt/db)))
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
  "Run migrations for the Metabase application database. Possible directions are `:up` (default), `:force`, `:down`, and
  `:release-locks`. When migrating `:down` pass along a version to migrate to (44+)."
  ([]
   (migrate! :up))
  ([direction & [version]]
   (mdb.setup/migrate! (mdb.connection/db-type) (mdb.connection/data-source)
                       direction version)))

(methodical/defmethod t2.connection/do-with-connection :metabase.models.database/Database
  "Support running arbitrary queries against data warehouse DBs for easy REPL debugging. Only works for SQL+JDBC drivers
  right now!

    ;; use Honey SQL
    (t2/query (t2/select-one Database :engine :postgres, :name \"test-data\")
              {:select [:*], :from [:venues]})

    ;; use it with `select`
    (t2/select :conn (t2/select-one Database :engine :postgres, :name \"test-data\")
               \"venues\")

    ;; use it with raw SQL
    (t2/query (t2/select-one Database :engine :postgres, :name \"test-data\")
              \"SELECT * FROM venues;\")"
  [database f]
  (t2.connection/do-with-connection (sql-jdbc.conn/db->pooled-connection-spec database) f))

(methodical/defmethod t2.pipeline/build [#_query-type     :default
                                         #_model          :default
                                         #_resolved-query :mbql]
  [_query-type _model _parsed-args resolved-query]
  resolved-query)

(methodical/defmethod t2.pipeline/compile [#_query-type  :default
                                           #_model       :default
                                           #_built-query :mbql]
  "Run arbitrary MBQL queries. Only works for SQL right now!

    ;; Run a query against a Data warehouse DB
    (t2/query (t2/select-one Database :name \"test-data\")
              (mt/mbql-query venues))

    ;; Run MBQL queries against the application database
    (t2/query (dev/with-app-db (mt/mbql-query core_user {:aggregation [[:min [:get-year $date_joined]]]})))
    =>
    [{:min 2023}]"
  [_query-type _model built-query]
  ;; make sure we use the application database when compiling the query and not something goofy like a connection for a
  ;; Data warehouse DB, if we're using this in combination with a Database as connectable
  (let [{:keys [query params]} (binding [t2.connection/*current-connectable* nil]
                                 (qp/compile built-query))]
    (into [query] params)))

(defn app-db-as-data-warehouse
  "Add the application database as a Database. Currently only works if your app DB uses broken-out details!"
  []
  (binding [t2.connection/*current-connectable* nil]
    (or (t2/select-one Database :name "Application Database")
        (let [details (#'metabase.db.env/broken-out-details
                       (mdb.connection/db-type)
                       @#'metabase.db.env/env)
              app-db  (first (t2/insert-returning-instances! Database
                                                             {:name    "Application Database"
                                                              :engine  (mdb.connection/db-type)
                                                              :details details}))]
          (sync/sync-database! app-db)
          app-db))))

(defmacro with-app-db
  "Use the app DB as a `Database` and bind it so [[metabase.test/db]], [[metabase.test/mbql-query]], and the like use
  it."
  [& body]
  `(let [db# (app-db-as-data-warehouse)]
     (mt/with-driver (:engine db#)
       (mt/with-db db#
         ~@body))))

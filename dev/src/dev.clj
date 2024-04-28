;; # Metabase Backend Developer Documentation
;;
;; Welcome to Metabase! Here are links to useful resources.
;;
;; ## Project Management
;;
;; - [Engineering and Product Playbook](https://www.notion.so/metabase/Engineering-and-Product-Playbook-cd4bc1c0b8744470bebc0b979f8f5268)
;; - [Weekly Tactical Board: how to](https://www.notion.so/metabase/Weekly-Tactical-Board-how-to-6e81f994a792493ba7ae430f2afa1673)
;; - [The Escalations Process](https://www.notion.so/Escalating-a-bug-b876f78c801345f3bda8504d4a63ba80)
;;
;; ## Dev Environment
;;
;; - [Getting started with backend development](https://github.com/metabase/metabase/blob/master/docs/developers-guide/devenv.md#backend-development)
;; - [Additional notes on using tools.deps](https://github.com/metabase/metabase/wiki/Migrating-from-Leiningen-to-tools.deps)
;; - [Use the dev-scripts repo to run various local DBs](https://github.com/metabase/dev-scripts)
;; - If you're on a Mac and need a VM to run Windows or Linux, [check out UTM](https://mac.getutm.app/)
;;
;; ## Important Parts of the Codebase
;;
;; - [API Endpoints](#metabase.api.common)
;; - [Drivers](#metabase.driver)
;; - [Permissions](#metabase.models.permissions)
;; - [The Query Processor](#metabase.query-processor)
;; - [Application Settings](#metabase.models.setting)
;;
;; ## Important Libraries
;;
;; - [Toucan 2](https://github.com/camsaul/toucan2/) to work with models
;; - [Honey SQL](https://github.com/seancorfield/honeysql) (version 2) for SQL queries
;; - [Liquibase](https://docs.liquibase.com/concepts/changelogs/changeset.html) for database migrations
;; - [Compojure](https://github.com/weavejester/compojure) on top of [Ring](https://github.com/ring-clojure/ring) for our API
;;
;; ## Other Helpful Things
;;
;; [Tips on our Github wiki](https://github.com/metabase/metabase/wiki/Metabase-Backend-Dev-Secrets)
;;
;; ### The Dev Debug Page
;; If you want an easy way to GET/POST to an endpoint and display the results in a webpage, check out the [Dev Debug
;; Page](https://github.com/metabase/metabase/pull/40580). Cherry-pick the commit from that PR, modify `DevDebug.jsx` as
;; you see fit ([here](https://github.com/metabase/metabase/commit/4c5723f44424dca2a68a753b83e31ec8129da0fb) is an
;; example from the ParseSQL project), and then play with the results at `/dev_debug`. *Don't forget to remove the
;; commit before merging to `master`!*
;;
;; ### Lifecycle of a Query
;; Dan wrote a nice guide [here](https://www.notion.so/metabase/Lifecycle-of-a-query-58e212402b7e444d937aba7757f9ec06?pvs=4)
;;
;; <hr />


(ns dev
  "Put everything needed for REPL development within easy reach"
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [clojure.test]
   [dev.debug-qp :as debug-qp]
   [dev.explain :as dev.explain]
   [dev.model-tracking :as model-tracking]
   [hashp.core :as hashp]
   [honey.sql :as sql]
   [java-time.api :as t]
   [malli.dev :as malli-dev]
   [metabase.api.common :as api]
   [metabase.config :as config]
   [metabase.core :as mbc]
   [metabase.db :as mdb]
   [metabase.db.env :as mdb.env]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.models.database :refer [Database]]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.server :as server]
   [metabase.server.handler :as handler]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test-runner]
   [metabase.test.data.impl :as data.impl]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan2.connection :as t2.connection]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.tools.hydrate :as t2.hydrate]))

(set! *warn-on-reflection* true)

(comment
  debug-qp/keep-me
  model-tracking/keep-me)

#_:clj-kondo/ignore
(defn tap>-spy [x]
  (doto x tap>))

(p/import-vars
 [debug-qp
  pprint-sql]
 [dev.explain
  explain-query]
 [model-tracking
  track!
  untrack!
  untrack-all!
  reset-changes!
  changes]
 [mt
  set-ns-log-level!])

(def initialized?
  "Was Metabase already initialized? Used in `init!` to prevent calling `core/init!`
   more than once (during `start!`, for example)."
  (atom nil))

(defn init!
  "Trigger general initialization, but only once."
  []
  (when-not @initialized?
    (mbc/init!)
    (reset! initialized? true)))

(defn migration-timestamp
  "Returns a UTC timestamp in format `yyyy-MM-dd'T'HH:mm:ss` that you can used to postfix for migration ID."
  []
  (t/format (t/formatter "yyyy-MM-dd'T'HH:mm:ss") (t/zoned-date-time (t/zone-id "UTC"))))

(defn deleted-inmem-databases
  "Finds in-memory Databases for which the underlying in-mem h2 db no longer exists."
  []
  (let [h2-dbs (t2/select :model/Database :engine :h2)
        in-memory? (fn [db] (some-> db :details :db (str/starts-with? "mem:")))
        can-connect? (fn [db]
                       #_:clj-kondo/ignore
                       (binding [metabase.driver.h2/*allow-testing-h2-connections* true]
                         (try
                           (driver/can-connect? :h2 (:details db))
                           (catch org.h2.jdbc.JdbcSQLNonTransientConnectionException _
                             false)
                           (catch Exception e
                             (log/error e "Error checking in-memory database for deletion")
                             ;; we don't want to delete these, so just pretend we could connect
                             true))))]
    (remove can-connect? (filter in-memory? h2-dbs))))

(defn prune-deleted-inmem-databases!
  "Delete any in-memory Databases to which we can't connect (in order to trigger cleanup of their related tasks, which
  will otherwise spam logs)."
  []
  (when-let [outdated-ids (seq (map :id (deleted-inmem-databases)))]
    (t2/delete! :model/Database :id [:in outdated-ids])))

(defn start!
  "Start Metabase"
  []
  (server/start-web-server! #'handler/app)
  (init!)
  (when config/is-dev?
    (prune-deleted-inmem-databases!)
    (with-out-str (malli-dev/start!))))

(defn stop!
  "Stop Metabase"
  []
  (malli-dev/stop!)
  (server/stop-web-server!))

(defn restart!
  "Restart Metabase"
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
     [:sqlserver 'time-test-data]
     [\"SELECT * FROM dbo.users WHERE dbo.users.last_login_time > ?\" (java-time/offset-time \"16:00Z\")])"
  {:arglists '([driver sql]            [[driver dataset] sql]
               [driver honeysql-form]  [[driver dataset] honeysql-form]
               [driver [sql & params]] [[driver dataset] [sql & params]])}
  [driver-or-driver+dataset sql-args]
  (let [[driver dataset] (u/one-or-many driver-or-driver+dataset)
        [sql & params]   (if (map? sql-args)
                           (sql/format sql-args)
                           (u/one-or-many sql-args))
        canceled-chan    (a/promise-chan)]
    (try
      (driver/with-driver driver
        (letfn [(thunk []
                  (let [db (mt/db)]
                    (sql-jdbc.execute/do-with-connection-with-options
                     driver
                     db
                     {:session-timezone (qp.timezone/report-timezone-id-if-supported driver db)}
                     (fn [conn]
                       (with-open [stmt (sql-jdbc.execute/prepared-statement driver conn sql params)
                                   rs   (sql-jdbc.execute/execute-prepared-statement! driver stmt)]
                         (let [rsmeta (.getMetaData rs)]
                           {:cols (sql-jdbc.execute/column-metadata driver rsmeta)
                            :rows (reduce conj [] (sql-jdbc.execute/reducible-rows driver rs rsmeta canceled-chan))}))))))]
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
   (mdb/migrate! (mdb/data-source) direction version)))

(methodical/defmethod t2.connection/do-with-connection :model/Database
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
                                 (qp.compile/compile built-query))]
    (into [query] params)))

(methodical/defmethod t2.hydrate/hydrate-with-strategy :around ::t2.hydrate/multimethod-simple
  "Throws an error if do simple hydrations that make DB call on a sequence."
  [model strategy k instances]
  (if (or config/is-prod?
          (< (count instances) 2)
          ;; we skip checking these keys because most of the times its call count
          ;; are from deferencing metabase.api.common/*current-user-permissions-set*
          (#{:can_write :can_read} k))
    (next-method model strategy k instances)
    (t2/with-call-count [call-count]
      (let [res (next-method model strategy k instances)
            ;; if it's a lazy-seq then we need to realize it so call-count is counted
            res (if (instance? clojure.lang.LazySeq res)
                  (doall res)
                  res)]
        ;; only throws an exception if the simple hydration makes a DB call
        (when (pos-int? (call-count))
          (throw (ex-info (format "N+1 hydration detected!!! Model %s, key %s]" (pr-str model) k)
                          {:model model :strategy strategy :k k :items-count (count instances) :db-calls (call-count)})))
        res))))

(defn app-db-as-data-warehouse
  "Add the application database as a Database. Currently only works if your app DB uses broken-out details!"
  []
  (binding [t2.connection/*current-connectable* nil]
    (or (t2/select-one Database :name "Application Database")
        #_:clj-kondo/ignore
        (let [details (#'metabase.db.env/broken-out-details
                       (mdb/db-type)
                       @#'metabase.db.env/env)
              app-db  (first (t2/insert-returning-instances! Database
                                                             {:name    "Application Database"
                                                              :engine  (mdb/db-type)
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

(defmacro p
  "#p, but to use in pipelines like `(-> 1 inc dev/p inc)`.

  See https://github.com/weavejester/hashp"
  [form]
  (hashp/p* form))

(defn- tests-in-var-ns [test-var]
  (->> test-var meta :ns ns-interns vals
       (filter (comp :test meta))))

(defn find-root-test-failure!
  "Sometimes tests fail due to another test not cleaning up after itself properly (e.g. leaving permissions in a dirty
  state). This is a common cause of tests failing in CI, or when run via `find-and-run-tests`, but not when run alone.

  This helper allows you to pass in a test var for a test that fails only after other tests run. It finds and runs all
  tests, running your passed test after each.

  When the passed test starts failing, it throws an exception notifying you of the test that caused it to start
  failing. At that point, you can start investigating what pleasant surprises that test is leaving behind in the
  database."
  [failing-test-var & {:keys [scope] :or {scope :same-ns}}]
  (let [failed? (fn []
                  (not= [0 0] ((juxt :fail :error) (clojure.test/run-test-var failing-test-var))))]
    (when (failed?)
      (throw (ex-info "Test is already failing! Better go fix it." {:failed-test failing-test-var})))
    (let [tests (case scope
                  :same-ns (tests-in-var-ns failing-test-var)
                  :full-suite (metabase.test-runner/find-tests))]
      (doseq [test tests]
        (clojure.test/run-test-var test)
        (when (failed?)
          (throw (ex-info (format "Test failed after running: `%s`" test)
                          {:test test})))))))

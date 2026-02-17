(ns metabase.task.tracing
  "Quartz scheduler tracing instrumentation.

   Provides two levels of observability for Quartz internals:

   1. **Lifecycle spans** — a JobListener wraps each job execution in a parent span,
      making Quartz scheduling overhead (lock acquisition, trigger state transitions)
      visible as the gap between the listener span and the defjob child span.

   2. **JDBC-level spans** — a ConnectionProvider interceptor wraps JDBC connections
      so that every SQL query Quartz runs (against QRTZ_* tables) gets its own span
      with the full SQL statement text.

   Both are gated on the `:quartz` trace group — zero overhead when disabled."
  (:require
   [clojure.string :as str]
   [metabase.task.bootstrap :as task.bootstrap]
   [metabase.task.core :as task]
   [metabase.tracing.core :as tracing]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (io.opentelemetry.api.trace Span StatusCode)
   (io.opentelemetry.context Scope)
   (java.lang.reflect InvocationHandler InvocationTargetException Method Proxy)
   (java.sql Connection PreparedStatement Statement)
   (org.quartz JobListener)))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- JDBC Proxy -------------------------------------------------------

(defn- sql-operation
  "Extract the SQL verb (SELECT, UPDATE, INSERT, DELETE) from a SQL string."
  ^String [^String sql]
  (when sql
    (let [trimmed (str/trim sql)
          space   (.indexOf trimmed " ")]
      (if (pos? space)
        (u/upper-case-en (subs trimmed 0 space))
        (u/upper-case-en trimmed)))))

(defn- invoke-or-unwrap
  "Invoke a method on target, unwrapping InvocationTargetException to preserve
   checked exception semantics (e.g. SQLException)."
  [^Method method target ^objects args]
  (try
    (.invoke method target args)
    (catch InvocationTargetException e
      (throw (.getCause e)))))

(def ^:private execute-method-names
  #{"executeQuery" "executeUpdate" "execute" "executeBatch"
    "executeLargeUpdate" "executeLargeBatch"})

(defn- traced-prepared-statement
  "Wrap a PreparedStatement in a proxy that creates a :quartz span around execute* methods."
  [^PreparedStatement stmt ^String sql]
  (let [operation (sql-operation sql)]
    (Proxy/newProxyInstance
     (.getClassLoader PreparedStatement)
     (into-array Class [PreparedStatement])
     (reify InvocationHandler
       (invoke [_ _ method args]
         (if (execute-method-names (.getName ^Method method))
           (tracing/with-span :quartz "quartz.db.execute"
             {:db/statement sql
              :db/operation (or operation "UNKNOWN")}
             (invoke-or-unwrap method stmt args))
           (invoke-or-unwrap method stmt args)))))))

(def ^:private statement-execute-with-sql
  "Statement execute methods that take SQL as the first argument."
  #{"execute" "executeQuery" "executeUpdate"})

(defn- traced-statement
  "Wrap a Statement in a proxy that creates a :quartz span around execute* methods.
   Unlike PreparedStatement, Statement receives SQL at execute time."
  [^Statement stmt]
  (Proxy/newProxyInstance
   (.getClassLoader Statement)
   (into-array Class [Statement])
   (reify InvocationHandler
     (invoke [_ _ method args]
       (let [method-name (.getName ^Method method)]
         (if (and (statement-execute-with-sql method-name)
                  args
                  (pos? (alength ^objects args))
                  (instance? String (aget ^objects args 0)))
           (let [sql       (aget ^objects args 0)
                 operation (sql-operation sql)]
             (tracing/with-span :quartz "quartz.db.execute"
               {:db/statement sql
                :db/operation (or operation "UNKNOWN")}
               (invoke-or-unwrap method stmt args)))
           ;; executeBatch and other non-SQL methods — pass through
           (if (execute-method-names method-name)
             (tracing/with-span :quartz "quartz.db.execute"
               {:db/operation "BATCH"}
               (invoke-or-unwrap method stmt args))
             (invoke-or-unwrap method stmt args))))))))

(defn- traced-connection
  "Wrap a Connection in a proxy that intercepts prepareStatement, createStatement,
   rollback, and commit to provide full JDBC-level tracing."
  [^Connection conn]
  (Proxy/newProxyInstance
   (.getClassLoader Connection)
   (into-array Class [Connection])
   (reify InvocationHandler
     (invoke [_ _ method args]
       (let [method-name (.getName ^Method method)]
         (case method-name
           "prepareStatement"
           (if (and args
                    (pos? (alength ^objects args))
                    (instance? String (aget ^objects args 0)))
             (let [sql  (aget ^objects args 0)
                   stmt (invoke-or-unwrap method conn args)]
               (traced-prepared-statement stmt sql))
             (invoke-or-unwrap method conn args))

           "createStatement"
           (let [stmt (invoke-or-unwrap method conn args)]
             (traced-statement stmt))

           "rollback"
           (tracing/with-span :quartz "quartz.db.rollback" {}
             (invoke-or-unwrap method conn args))

           "commit"
           (tracing/with-span :quartz "quartz.db.commit" {}
             (invoke-or-unwrap method conn args))

           ;; default — pass through
           (invoke-or-unwrap method conn args)))))))

(defn- connection-interceptor
  "Connection wrapping function installed into bootstrap's ConnectionProvider.
   Checks `:quartz` group at call time — wraps only when enabled."
  [^Connection conn]
  (if (tracing/group-enabled? :quartz)
    (traced-connection conn)
    conn))

;;; ---------------------------------------------- Job Listener ------------------------------------------------------

;; ThreadLocal storage for span state between jobToBeExecuted and jobWasExecuted callbacks.
;; All callbacks for the same job execution run on the same Quartz worker thread.
(def ^:private ^ThreadLocal listener-state (ThreadLocal.))

(defn- create-tracing-job-listener
  "Create a JobListener that wraps each job execution in a :quartz span.
   The span becomes the parent of the defjob span (via OTel context propagation)."
  ^JobListener []
  (reify JobListener
    (getName [_]
      "metabase.task.tracing/quartz-tracing-listener")

    (jobToBeExecuted [_ ctx]
      (when (tracing/group-enabled? :quartz)
        (try
          (let [job-name  (.. ctx getJobDetail getKey getName)
                ^Span span (-> (tracing/get-tracer "metabase.quartz")
                               (.spanBuilder "quartz.job.execute")
                               (.setAttribute "quartz.job/name" job-name)
                               (.startSpan))
                ^Scope scope (.makeCurrent span)]
            (.set listener-state {:span span :scope scope}))
          (catch Throwable t
            (log/error t "Error starting quartz tracing span")))))

    (jobExecutionVetoed [_ _])

    (jobWasExecuted [_ _ job-exception]
      (when-let [{:keys [^Span span ^Scope scope]} (.get listener-state)]
        (.remove listener-state)
        (try
          (when job-exception
            (.setStatus span StatusCode/ERROR (.getMessage ^Exception job-exception))
            (.recordException span ^Throwable job-exception))
          (.close scope)
          (.end span)
          (catch Throwable t
            (log/error t "Error ending quartz tracing span")))))))

;;; ------------------------------------------- Initialization -------------------------------------------------------

(defn init-quartz-tracing!
  "Register the Quartz tracing JobListener and JDBC connection interceptor.
   Must be called after the scheduler is initialized."
  []
  (log/info "Initializing Quartz tracing instrumentation")
  (task/add-job-listener! (create-tracing-job-listener))
  (task.bootstrap/set-connection-interceptor! connection-interceptor))

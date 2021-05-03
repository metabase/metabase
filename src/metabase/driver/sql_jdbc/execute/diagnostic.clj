(ns metabase.driver.sql-jdbc.execute.diagnostic
  "Code related to capturing diagnostic information for JDBC connection pools at execution time."
  (:import com.mchange.v2.c3p0.PoolBackedDataSource))

(def ^:private ^:dynamic *diagnostic-info*
  "Atom used to hold diagnostic info for the current query execution, to be made available via a helper macro/fn below."
  nil)

(defn do-with-diagnostic-info
  "Execute `f` with diagnostic info capturing enabled. `f` is passed a single argument, a function that can be used to
  retrieve the current diagnostic info. Prefer to use the macro form instead: `capturing-diagnostic-info`."
  {:style/indent 0}
  [f]
  (binding [*diagnostic-info* (atom {})]
    (f (partial deref *diagnostic-info*))))

(defmacro capturing-diagnostic-info
  "Execute `body` and store diagnostic info related to the query execution. `diagnostic-info-fn-binding` is bound to a
  zero-arity function that can be used to fetch the current diagnostic info.

  ```
  (sql-jdbc.execute.diagnostic/capturing-diagnostic-info [diag-info-fn]
    ;; various body forms
    ;; fetch the diagnostic info, which should be available if execute code called `record-diagnostic-info-for-pool`
    (diag-info-fn))
  ```"
  {:style/indent 1}
  [[diagnostic-info-fn-binding] & body]
  `(do-with-diagnostic-info (fn [~diagnostic-info-fn-binding] ~@body)))

(defn record-diagnostic-info-for-pool
  "Captures diagnostic info related to the given `driver`, `database-id`, and `datasource` (which are all related).
  The current information that is captured (in a map whose keys are namespaced keywords in this ns) is:

  * `::database-id`: the database ID (from the parameter value)
  * `::driver`: the driver (from the parameter value)
  * `::active-connections`: the number of active connections in the given datasource's pool
  * `::total-connections`: the number of total connections in the given datasource's pool
  * `::threads-waiting`: the number of threads waiting to get a connection to the given datasource's pool (which happens
                         when the number of active connections has reached the max size)."
  [driver database-id ^PoolBackedDataSource datasource]
  (when *diagnostic-info*
    (swap! *diagnostic-info* #(assoc % ::database-id        database-id
                                       ::driver             driver
                                       ::active-connections (.getNumBusyConnectionsAllUsers datasource)
                                       ::total-connections  (.getNumConnectionsAllUsers datasource)
                                       ::threads-waiting    (.getNumThreadsAwaitingCheckoutDefaultUser datasource)))))

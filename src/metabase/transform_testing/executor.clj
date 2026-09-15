(ns metabase.transform-testing.executor
  "The one place warehouse I/O lives. Given a single test-run connection (from
  `driver/do-with-test-connection`), it creates temp tables from compiled queries, drops them, and
  runs read-back queries. It knows nothing about transform tests, expectations, or judgment — it takes
  compiled queries and table names and talks to the connection.

  Kept separate from the runner (orchestration) and the compiler (pure SQL) so the module's I/O is
  in one auditable namespace. No plan object is marshaled between stages — callers pass ordinary
  arguments (driver, conn, compiled-query, table name)."
  (:require
   [metabase.driver :as driver]
   [metabase.transform-testing.compile :as transform-testing.compile]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(mu/defn create-temp-table!
  "Create the temp table `table` from the compiled `query` on `conn`."
  [driver :- :keyword
   conn   :- :some
   table  :- :string
   query  :- ::transform-testing.compile/compiled-query]
  (driver/execute-on-connection! driver conn (driver/compile-create-temp-table driver {:table table :query query})))

(mu/defn drop-temp-table!
  "Drop the temp table `table` on `conn` if it exists, logging a failure instead of throwing it."
  [driver :- :keyword
   conn   :- :some
   table  :- :string]
  (try
    (let [[sql & params] (driver/compile-drop-table driver table)]
      (driver/execute-on-connection! driver conn [sql params]))
    (catch Exception e
      (log/warnf "Failed to drop transform test temp table %s: %s" table (ex-message e)))))

(mu/defn run-query
  "Run the compiled `[sql params]` `query` on `conn`, returning at most `max-rows` rows as vectors."
  [driver   :- :keyword
   conn     :- :some
   query    :- [:tuple :string [:sequential :any]]
   max-rows :- :int]
  (driver/query-on-connection driver conn query {:max-rows max-rows}))

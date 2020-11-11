(ns metabase.driver.sql-jdbc.sync.common
  (:require [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.util.honeysql-extensions :as hx])
  (:import [java.sql Connection PreparedStatement]))

(defn simple-select-probe-query
  "Simple (ie. cheap) SELECT on a given table to test for access and get column metadata. By default doesn't return
  anything useful (only used to check whether we can execute a SELECT query) but you can override this by passing
  `clause-overrides`.

    (simple-select-probe-query :postgres \"public\" \"my_table\")
    ;; -> [\"SELECT TRUE FROM public.my_table WHERE 1 <> 1 LIMIT 0\"]

    (simple-select-probe-query :postgres \"public\" \"my_table\" {:select [:*]})
    ;; -> [\"SELECT * FROM public.my_table WHERE 1 <> 1 LIMIT 0\"]"
  [driver schema table & [clause-overrides]]
  {:pre [(string? table)]}
  ;; Using our SQL compiler here to get portable LIMIT
  (let [honeysql (sql.qp/apply-top-level-clause driver :limit
                   (merge
                    {:select [(sql.qp/->honeysql driver true)]
                     :from   [(sql.qp/->honeysql driver (hx/identifier :table schema table))]
                     :where  [:not= 1 1]}
                    clause-overrides)
                   {:limit 0})]
    (sql.qp/format-honeysql driver honeysql)))

(defn prepare-statement
  "Create a PreparedStatement for metadata queries; set `TYPE_FORWARD_ONLY`/`CONCUR_READ_ONLY`/`FETCH_FORWARD` options
  if possible. These queries return no rows."
  ^PreparedStatement [driver ^Connection conn ^String sql params]
  ;; `sql-jdbc.execute/prepared-statement` will set `TYPE_FORWARD_ONLY`/`CONCUR_READ_ONLY`/`FETCH_FORWARD` if
  ;; possible, although I'm not sure if that will make a difference if we don't actually realize the ResultSet
  (doto ^PreparedStatement (sql-jdbc.execute/prepared-statement driver conn sql params)
    (.setMaxRows 0)))

(ns metabase.driver.sql-jdbc.sync.common
  (:require [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.util.honeysql-extensions :as hx])
  (:import [java.sql Connection PreparedStatement ResultSet]))

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

(defn reducible-results
  "Creates an `IReduceInit` for a function that returns a `ResultSet`, and a function that is called once for each row.
  `rs-thunk` should return a `ResultSet`; `rs->row-thunk` has the signature

    (rs->row-thunk rs)-> row-thunk

  `rs->row-thunk` is called once with the ResultSet, and should return a thunk; the resulting thunk is called once for
  each row. Example:

    (reducible-results
     ;; `rs-thunk` should return a `ResultSet`
     #(.getSchemas metadata)
     ;; `rs->row-thunk` is called once with the `ResultSet`, and returns a thunk
     (fn [rs]
       ;; the thunk is called once for each row to get results
       (fn []
         (.getString rs \"TABLE_SCHEM\"))))"
  [rs-thunk rs->row-thunk]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (with-open [^ResultSet rs (rs-thunk)]
        (reduce
         ((take-while some?) rf)
         init
         (let [row-thunk (rs->row-thunk rs)]
           (repeatedly #(when (.next rs)
                          (row-thunk)))))))))

(ns metabase.driver.sql-jdbc.sync.common
  (:require
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute])
  (:import
   (java.sql Connection PreparedStatement ResultSet)))

(set! *warn-on-reflection* true)

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

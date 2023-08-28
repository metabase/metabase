(ns metabase.db.insert
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.insert :as mdb.insert]
   [metabase.driver.sql.query-processor :as sql.qp])
  (:import
   (java.io StringReader)
   (org.postgresql.copy CopyManager)
   (org.postgresql.jdbc PgConnection)))

(set! *warn-on-reflection* true)

(defmulti bulk-insert!*
  "The driver-specific part of the implementation of `bulk-insert`."
  {:arglists '([driver conn table+schema column-names values])}
  (fn [driver _conn _table+schema _column-names _values]
    driver))

(defn bulk-insert!
  "Insert many rows into the application DB at once.
   This is a performance optimization over toucan2.core/insert! for drivers that support it."
  [table+schema column-names values]
  (let [driver (:db-type mdb.connection/*application-db*)
        conn   (.getConnection mdb.connection/*application-db*)]
    (bulk-insert!* driver conn table+schema column-names values)))

(sql/register-clause!
 ::copy
 (fn
   [_clause table]
   [(str "COPY " (sql/format-entity table))]) :insert-into)

(sql/register-clause!
 ::from-stdin
 (fn format-from-stdin
   [_clause delimiter]
   [(str "FROM STDIN NULL " delimiter)])
 :from)

(defmethod bulk-insert!* :postgres
  [driver ^java.sql.Connection conn table+schema column-names values]
  (let [copy-manager (CopyManager. (.unwrap conn PgConnection))
        [sql & _]    (sql/format {::copy       (keyword table+schema)
                                  :columns     (map keyword column-names)
                                  ::from-stdin "''"}
                                 :quoted true
                                 :dialect (sql.qp/quote-style driver))]
    ;; There's nothing magic about 100, but it felt good in testing. There could well be a better number.
    (doseq [slice-of-values (partition-all 100 values)]
      (let [tsvs (->> slice-of-values
                      (map #(str/join "\t" %))
                      (str/join "\n")
                      (StringReader.))]
        (.copyIn copy-manager ^String sql tsvs)))
    (count values)))

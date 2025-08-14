(ns ^{:clj-kondo/ignore :discouraged-var} ; jdbc/active-tx?
 metabase-enterprise.semantic-search.db.util
  (:require
   [next.jdbc :as jdbc]))

(defn tx-or-throw!
  [conn]
  (when-not (jdbc/active-tx? (.unwrap ^java.sql.Connection conn java.sql.Connection))
    (throw (Exception. "Not in transaction."))))

(defn not-tx-or-throw!
  [conn]
  (when (jdbc/active-tx? (.unwrap ^java.sql.Connection conn java.sql.Connection))
    (throw (Exception. "In transaction."))))
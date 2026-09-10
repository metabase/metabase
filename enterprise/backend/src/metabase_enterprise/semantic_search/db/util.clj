(ns metabase-enterprise.semantic-search.db.util
  (:require
   [next.jdbc :as jdbc]))

(set! *warn-on-reflection* true)

(defn tx-or-throw!
  "Throw if not in transaction."
  [conn]
  ;; checks the pgvector conn, not the app DB; app-db in-transaction? only tracks app-db tx depth
  (when-not #_{:clj-kondo/ignore [:discouraged-var]} (jdbc/active-tx? (.unwrap ^java.sql.Connection conn java.sql.Connection))
            (throw (Exception. "Not in transaction."))))

;; Unused now, may be handy for with-write-tx, acquire-write-lock
#_(defn not-tx-or-throw!
    [conn]
    (when (jdbc/active-tx? (.unwrap ^java.sql.Connection conn java.sql.Connection))
      (throw (Exception. "In transaction."))))

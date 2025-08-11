(ns metabase-enterprise.semantic-search.db.connection
  (:require
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.db.locking :as semantic.db.locking]
   [metabase-enterprise.semantic-search.db.util :as semantic.db.util]
   [next.jdbc :as jdbc]))

(defn- connection
  []
  (jdbc/get-connection (semantic.db.datasource/ensure-initialized-data-source!)))

(defn do-with-migrate-tx
  [conn thunk]
  (if (nil? conn)
    (jdbc/with-transaction [tx (semantic.db.datasource/ensure-initialized-data-source!)]
      (semantic.db.locking/acquire-migraiton-lock! tx)
      (thunk tx))
    (do
      (semantic.db.util/tx-or-throw! conn)
      (semantic.db.locking/acquire-migraiton-lock! conn)
      (thunk conn))))

(defmacro with-migrate-tx
  [[conn-sym & [conn-expr]] & body]
  `(do-with-migrate-tx ~conn-expr (fn [~conn-sym] ~@body)))

(defn do-with-write-tx
  [conn thunk]
  (if (nil? conn)
    (jdbc/with-transaction [tx (semantic.db.datasource/ensure-initialized-data-source!)]
      (semantic.db.locking/acquire-write-lock! tx)
      (thunk tx))
    (do
      (semantic.db.util/not-tx-or-throw! conn)
      (jdbc/with-transaction [tx conn]
        (semantic.db.locking/acquire-write-lock! tx)
        (thunk tx)))))

(defmacro with-write-tx
  [[conn-sym & [conn-expr]] & body]
  `(do-with-write-tx ~conn-expr (fn [~conn-sym] ~@body)))

;; This is just for the completeness, ie unified interface
(defn do-with-read-connection
  [thunk]
  (with-open [conn (connection)]
    (thunk conn)))

(defmacro with-read-connection
  [[conn-sym] & body]
  `(do-with-read-connection (fn [~conn-sym] ~@body)))
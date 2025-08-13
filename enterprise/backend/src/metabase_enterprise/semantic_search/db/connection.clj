(ns metabase-enterprise.semantic-search.db.connection
  (:require
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.db.locking :as semantic.db.locking]
   [metabase-enterprise.semantic-search.db.util :as semantic.db.util]
   [next.jdbc :as jdbc]))

;; not needed as attempting approach with yolo writes during migration
#_(defn- connection
    []
    (jdbc/get-connection (semantic.db.datasource/ensure-initialized-data-source!)))

(defn do-with-migrate-tx
  [conn-or-ds thunk]
  (jdbc/with-transaction [tx (or conn-or-ds
                                 (semantic.db.datasource/ensure-initialized-data-source!))]
    (semantic.db.locking/acquire-migration-lock! tx)
    (thunk tx)))

(defmacro with-migrate-tx
  [[conn-sym & [conn-expr]] & body]
  `(do-with-migrate-tx ~conn-expr (fn [~conn-sym] ~@body)))

#_(defn do-with-write-tx
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

#_(defmacro with-write-tx
    [[conn-sym & [conn-expr]] & body]
    `(do-with-write-tx ~conn-expr (fn [~conn-sym] ~@body)))

;; This is just for the completeness, ie unified interface
#_(defn do-with-read-connection
    [thunk]
    (with-open [conn (connection)]
      (thunk conn)))

#_(defmacro with-read-connection
    [[conn-sym] & body]
    `(do-with-read-connection (fn [~conn-sym] ~@body)))
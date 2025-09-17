(ns metabase-enterprise.semantic-search.db.connection
  (:require
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.db.locking :as semantic.db.locking]
   [next.jdbc :as jdbc]))

(defn do-with-migrate-tx
  "Impl. for [[with-migrate-tx]]."
  [conn-or-ds thunk]
  (jdbc/with-transaction [tx (or conn-or-ds
                                 (semantic.db.datasource/ensure-initialized-data-source!))]
    (semantic.db.locking/acquire-migration-lock! tx)
    (thunk tx)))

(defmacro with-migrate-tx
  "Provide connection with migration advisory lock. Blocking."
  [[conn-sym & [conn-expr]] & body]
  `(do-with-migrate-tx ~conn-expr (fn [~conn-sym] ~@body)))

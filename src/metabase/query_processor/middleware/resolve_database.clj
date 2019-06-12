(ns metabase.query-processor.middleware.resolve-database
  (:require [metabase.mbql.schema :as mbql.s]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]))

(defn- resolve-database* [{database-id :database, :as query}]
  (u/prog1 query
    (when-not (= database-id mbql.s/saved-questions-virtual-database-id)
      (qp.store/fetch-and-store-database! database-id))))

(defn resolve-database
  "Middleware that resolves the Database referenced by the query under that `:database` key and stores it in the QP
  Store."
  [qp]
  (comp qp resolve-database*))

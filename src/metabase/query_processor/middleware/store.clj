(ns metabase.query-processor.middleware.store
  "The store middleware is responsible for initializing a fresh QP Store, which caches resolved objects for the duration
  of a query execution. See `metabase.query-processor.store` for more details."
  (:require [metabase.query-processor.store :as qp.store]))

(defn initialize-store
  "Initialize the QP Store (resolved objects cache) for this query execution."
  [qp]
  (fn [query]
    (qp.store/with-store
      (qp query))))

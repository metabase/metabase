(ns metabase.query-processor.middleware.resolve-driver
  "Middleware for resolving the appropriate driver to use for processing a query."
  (:require [metabase.driver :as driver]
            [metabase.query-processor.interface :as i]))

(defn resolve-driver
  "Middleware that resolves the driver associated with a query, binds it to `*driver*`, and associates it in the query
  under the key `:driver`."
  [qp]
  (fn [query]
    (let [driver (or (driver/database-id->driver (:database query))
                     (throw (Exception. "Unable to resolve driver for query.")))
          query  (assoc query :driver driver)]
      (binding [i/*driver* driver]
        (qp query)))))

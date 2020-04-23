(ns metabase.query-processor.middleware.resolve-database-and-driver
  (:require [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.util :as driver.u]
            [metabase.mbql.schema :as mbql.s]
            [metabase.query-processor
             [error-type :as error-type]
             [store :as qp.store]]
            [metabase.util.i18n :refer [tru]]))

(defn- resolve-database* [{database-id :database, :as query}]
  (u/prog1 query
    (when-not (= database-id mbql.s/saved-questions-virtual-database-id)
      (qp.store/fetch-and-store-database! database-id))))

(defn resolve-database-and-driver
  "Middleware that resolves the Database referenced by the query under that `:database` key and stores it in the QP
  Store."
  [qp]
  (fn [{database-id :database, :as query} rff context]
    (when-not ((every-pred integer? pos?) database-id)
      (throw (ex-info (tru "Unable to resolve database for query: missing or invalid `:database` ID.")
               {:database database-id
                :type     error-type/invalid-query})))
    (resolve-database* query)
    (driver/with-driver (try
                          (driver/the-initialized-driver (driver.u/database->driver (qp.store/database)))
                          (catch Throwable e
                            (throw (ex-info (tru "Unable to resolve driver for query")
                                            {:type error-type/invalid-query}
                                            e))))
      (qp query rff context))))

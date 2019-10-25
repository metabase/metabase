(ns metabase.query-processor.middleware.resolve-driver
  "Middleware for resolving the appropriate driver to use for processing a query."
  (:require [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]
            [metabase.util.i18n :refer [tru]]))

(defn resolve-driver
  "Middleware that resolves the driver associated with a query, binds it to `*driver*`, and associates it in the query
  under the key `:driver`."
  [qp]
  (fn [{:keys [database], :as query}]
    ;; Make sure the `:database` key is present and that it's a positive int (the nested query placeholder should have
    ;; been replaced by relevant middleware by now)
    (when-not ((every-pred integer? pos?) database)
      (throw (ex-info (tru "Unable to resolve driver for query: missing or invalid `:database` ID.")
               {:database database})))
    ;; ok, now make sure the Database exists in the DB
    (let [driver (or (driver.u/database->driver database)
                     (throw (ex-info (tru "Unable to resolve driver for query: Database {0} does not exist." database)
                              {:database database})))]
      (binding [driver/*driver* driver]
        (qp (assoc query :driver driver))))))

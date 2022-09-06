(ns metabase.query-processor.middleware.resolve-database-and-driver
  (:require [metabase.driver :as driver]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models.setting :as setting]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]
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
                       :type     qp.error-type/invalid-query})))
    (resolve-database* query)
    (let [{:keys [settings], driver :engine} (qp.store/database)]
      ;; make sure the driver is initialized.
      (try
        (driver/the-initialized-driver driver)
        (catch Throwable e
          (throw (ex-info (tru "Unable to resolve driver for query")
                          {:type qp.error-type/invalid-query}
                          e))))
      (binding [setting/*database-local-values* settings]
        (driver/with-driver driver
          (qp query rff context))))))

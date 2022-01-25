(ns metabase.query-processor.middleware.resolve-database-and-driver
  (:require [metabase.driver :as driver]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models.setting :as setting]
            [metabase.query-processor.error-type :as error-type]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]
            [metabase.models.query :as query]
            [metabase.util.i18n :refer [tru]]))


(defn- do-with-resolved-database-and-driver* [query thunk]
  (let [{:keys [database-id]} (query/query->database-and-table-ids query)]
    (when-not ((every-pred integer? pos?) database-id)
      (throw (ex-info (tru "Unable to resolve database for query: missing or invalid `:database` ID.")
                      {:query query
                       :type  error-type/invalid-query})))
    (when-not (= database-id mbql.s/saved-questions-virtual-database-id)
      (qp.store/fetch-and-store-database! database-id))
    (let [{:keys [settings], driver :engine} (qp.store/database)]
      ;; make sure the driver is initialized.
      (try
        (driver/the-initialized-driver driver)
        (catch Throwable e
          (throw (ex-info (tru "Unable to resolve driver for query")
                          {:type error-type/invalid-query}
                          e))))
      (binding [setting/*database-local-values* settings]
        (driver/with-driver driver
          (thunk))))))

(def ^:private ^:dynamic *already-resolved?* false)

(defn do-with-resolved-database-and-driver
  "Middleware that resolves the Database referenced by the query under that `:database` key and stores it in the QP
  Store."
  [query thunk]
  (if *already-resolved?*
    (thunk)
    (do-with-resolved-database-and-driver*
     query
     (^:once fn* []
      (binding [*already-resolved?* true]
        (thunk))))))

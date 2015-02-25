(ns metabase.driver.query-processor
  "Multimethods used to process/execute queries. These are implemented by the various drivers in namespaces such as `metabase.driver.postgres.query-processor`."
  (:require [metabase.db :refer [sel]]
            (metabase.driver [native :as native]
                             [util :as util])
            [metabase.models.database :refer [Database]]))

(declare process2)

(defn process-and-run
  "Process and run a query and return results."
  [{:keys [type] :as query}]
  (case (keyword type)
    :native (native/process-and-run query)
    :query (process2 query)))

(defmulti process2
  "Process a query of type `query` (implemented by various DB drivers)."
  (fn [{:keys [database] :as query}]
    ((util/db-dispatch-fn "query-processor") (sel :one [Database :engine] :id database))))

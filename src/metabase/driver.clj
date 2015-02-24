(ns metabase.driver
  (:require (metabase.driver native
                             postgres)))

(def available-drivers
  [["postgres" "PostgreSQL"]])

(defn process-and-run [{:keys [type] :as query}]
  (case (keyword type)
    :native (metabase.driver.native/process-and-run query)
    :query (metabase.driver.postgres/process-and-run query)))

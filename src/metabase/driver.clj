(ns metabase.driver
  (:require [clojure.core.match :refer [match]]
            (metabase.driver native
                             postgres)))

(defn process-and-run [{:keys [type] :as query}]
  (case (keyword type)
    :native (metabase.driver.native/process-and-run query)
    :query (metabase.driver.postgres/process-and-run query)))

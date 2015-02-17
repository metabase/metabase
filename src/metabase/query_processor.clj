(ns metabase.query-processor
  (:require [clojure.core.match :refer [match]]
            (metabase.query-processor native
                                      structured)))

(defn process [{:keys [type] :as query}]
  (case (keyword type)
    :native (metabase.query-processor.native/process (:native query))
    :query (metabase.query-processor.structured/process (:query query))))

(defn process-and-run [{:keys [type] :as query}]
  (case (keyword type)
    :native (metabase.query-processor.native/process-and-run query)
    :query (metabase.query-processor.structured/process-and-run query)))

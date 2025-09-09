(ns metabase-enterprise.dependencies.native-validation
  (:require [macaw.core :as macaw]
            [metabase.driver :as driver]
            [metabase.query-processor :as qp]))

(defn validate-native-query [driver metadata-provider query]
  (let [compiled (-> (qp/compile-query-with-metadata-provider metadata-provider query)
                     :query)]
    (driver/validate-native-query-fields driver metadata-provider compiled)))

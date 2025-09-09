(ns metabase-enterprise.dependencies.native-validation
  (:require [macaw.core :as macaw]
            [metabase.driver :as driver]
            [metabase.query-processor :as qp]))

(defn validate-native-query [driver metadata-provider query]
  (let [compiled (-> (qp/compile-query-with-metadata-provider metadata-provider query)
                     :query)]
    (driver/validate-native-query-fields driver metadata-provider compiled)))

(defn native-query-deps [driver metadata-provider query]
  (let [compiled (-> (qp/compile-query-with-metadata-provider metadata-provider query)
                     :query)]
    (->> (get-in query [:native :template-tags])
         vals
         (keep #(case (:type %)
                  "snippet" {:snippet (:snippet-id %)}
                  :snippet {:snippet (:snippet-id %)}
                  "card" {:card (:card-id %)}
                  :card {:card (:card-id %)}
                  nil))
         (into (driver/native-query-deps driver compiled metadata-provider #{})))))

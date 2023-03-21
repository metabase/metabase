(ns metabase.lib.metric-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(deftest ^:parallel metric-display-name-test
  (let [metadata (lib.tu/mock-metadata-provider
                  {:database meta/metadata
                   :tables   [(meta/table-metadata :venues)]
                   :fields   [(meta/field-metadata :venues :price)]
                   :metrics  [{:id         100
                               :name       "My Metric"
                               :definition {:database (meta/id)
                                            :query    {:filter [:= [:field (meta/id :venues :price) nil] 4]}}}]})
        query    (-> (lib/query-for-table-name metadata "VENUES")
                     (lib/aggregate [:metric {:lib/uuid (str (random-uuid))} 100]))]
    (is (= "Venues, My Metric"
           (lib.metadata.calculation/suggested-name query)))))

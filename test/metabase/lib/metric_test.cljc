(ns metabase.lib.metric-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(defn- mock-metadata-provider []
  (lib.tu/mock-metadata-provider
   {:database meta/metadata
    :tables   [(meta/table-metadata :venues)]
    :fields   [(meta/field-metadata :venues :price)]
    :metrics  [{:id         100
                :name       "My Metric"
                :definition {:source-table (meta/id :venues)
                             :aggregation [[:sum [:field (meta/id :venues :price) nil]]]
                             :filter      [:= [:field (meta/id :venues :price) nil] 4]}}]}))

(deftest ^:parallel metric-display-name-test
  (let [metadata (mock-metadata-provider)
        query    (-> (lib/query-for-table-name metadata "VENUES")
                     (lib/aggregate [:metric {:lib/uuid (str (random-uuid))} 100]))]
    (is (= "Venues, My Metric"
           (lib.metadata.calculation/suggested-name query)))))

(deftest ^:parallel metric-type-of-test
  (let [metadata (mock-metadata-provider)
        query    (-> (lib/query-for-table-name metadata "VENUES")
                     (lib/aggregate [:metric {:lib/uuid (str (random-uuid))} 100]))]
    (is (= :type/Integer
           (lib.metadata.calculation/type-of query [:metric {:lib/uuid (str (random-uuid))} 100])))))

(deftest ^:parallel ga-metric-metadata-test
  (testing "Make sure we can calculate metadata for FAKE Google Analytics metric clauses"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/aggregate [:metric {:lib/uuid (str (random-uuid))} "ga:totalEvents"]))]
      (is (=? [{:lib/type     :metadata/field
                :name         "metric"
                :display-name "[Unknown Metric]"
                :base-type    :type/*}]
              (lib.metadata.calculation/metadata query -1 query))))))

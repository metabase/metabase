(ns metabase.agent-lib.capabilities.catalog-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.agent-lib.capabilities :as capabilities]
   [metabase.agent-lib.capabilities.catalog :as catalog]
   [metabase.agent-lib.capabilities.catalog.aggregation :as aggregation]
   [metabase.agent-lib.capabilities.catalog.expressions :as expressions]
   [metabase.agent-lib.capabilities.catalog.filtering :as filtering]
   [metabase.agent-lib.capabilities.catalog.joins :as joins]
   [metabase.agent-lib.capabilities.catalog.ordering :as ordering]
   [metabase.agent-lib.capabilities.catalog.sources :as sources]
   [metabase.agent-lib.capabilities.catalog.top-level :as top-level]))

(deftest ^:parallel grouped-capability-catalog-preserves-review-groups-and-order-test
  (is (= [:top-level
          :sources
          :filtering
          :aggregation
          :breakout-ordering
          :expressions
          :joins]
         (mapv :group catalog/grouped-capability-catalog)))
  (is (= [top-level/capabilities
          sources/capabilities
          filtering/capabilities
          aggregation/capabilities
          ordering/capabilities
          expressions/capabilities
          joins/capabilities]
         (mapv :capabilities catalog/grouped-capability-catalog))))

(deftest ^:parallel raw-capability-catalog-flattens-the-grouped-catalog-test
  (let [expected (into []
                       cat
                       [top-level/capabilities
                        sources/capabilities
                        filtering/capabilities
                        aggregation/capabilities
                        ordering/capabilities
                        expressions/capabilities
                        joins/capabilities])]
    (is (= expected catalog/raw-capability-catalog))
    (is (= expected capabilities/raw-capability-catalog))))

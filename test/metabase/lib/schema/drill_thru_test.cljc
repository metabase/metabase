(ns metabase.lib.schema.drill-thru-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.test-metadata :as meta]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel raw-database-values-test
  (testing "object-detail dimensions accept non-null database scalar values"
    (is (mr/validate ::lib.schema.drill-thru/drill-thru.object-details.dimension
                     {:column (meta/field-metadata :orders :id)
                      :value  #?(:clj 1M :cljs (js/Date.))}))))

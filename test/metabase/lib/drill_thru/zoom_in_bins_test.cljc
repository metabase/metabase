(ns metabase.lib.drill-thru.zoom-in-bins-test
  (:require
   [clojure.test :refer [deftest testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel num-bins->default-test
  (testing ":num-bins binning => :default binning + between filter"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/aggregate (lib/count))
                    (lib/breakout (-> (meta/field-metadata :orders :total)
                                      (lib/with-binning {:strategy :num-bins, :num-bins 10}))))]
      (lib.drill-thru.tu/test-drill-application
       {:click-type     :cell
        :query-type     :aggregated
        :custom-query   query
        :custom-row     {"count" 100
                         "TOTAL" 40}
        :column-name    "TOTAL"
        :drill-type     :drill-thru/zoom-in.binning
        :expected       {:type        :drill-thru/zoom-in.binning
                         :column      {:name "TOTAL"}
                         :min-value   40
                         :max-value   60.0
                         :new-binning {:strategy :default}}
        :expected-query {:stages [{:source-table (meta/id :orders)
                                   :aggregation  [[:count {}]]
                                   :breakout     [[:field
                                                   {:binning {:strategy :default}}
                                                   (meta/id :orders :total)]]
                                   :filters      [[:between {}
                                                   [:field {} (meta/id :orders :total)]
                                                   40
                                                   60.0]]}]}}))))

(deftest ^:parallel bin-width-test
  (testing ":bin-width binning => :bin-width binning (width ÷= 10) + between filter"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                    (lib/aggregate (lib/count))
                    (lib/breakout (-> (meta/field-metadata :people :latitude)
                                      (lib/with-binning {:strategy :bin-width, :bin-width 1.0}))))]
      (lib.drill-thru.tu/test-drill-application
       {:click-type     :cell
        :query-type     :aggregated
        :custom-query   query
        :custom-row     {"count"    100
                         "LATITUDE" 41.0}
        :column-name    "LATITUDE"
        :drill-type     :drill-thru/zoom-in.binning
        :expected       {:type        :drill-thru/zoom-in.binning
                         :column      {:name "LATITUDE"}
                         :min-value   41.0
                         :max-value   42.0
                         :new-binning {:strategy :bin-width, :bin-width 0.1}}
        :expected-query {:stages [{:source-table (meta/id :people)
                                   :aggregation  [[:count {}]]
                                   :breakout     [[:field
                                                   {:binning {:strategy :bin-width, :bin-width 0.1}}
                                                   (meta/id :people :latitude)]]
                                   :filters      [[:between {}
                                                   [:field {} (meta/id :people :latitude)]
                                                   41.0
                                                   42.0]]}]}}))))

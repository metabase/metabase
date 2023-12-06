(ns metabase.lib.drill-thru.zoom-in-geographic-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel country-test
  (testing "Country => Binned LatLon"
    (let [metadata-provider (lib.tu/mock-metadata-provider
                             meta/metadata-provider
                             {:fields [{:id             1
                                        :table-id       (meta/id :people)
                                        :name           "COUNTRY"
                                        :base-type      :type/Text
                                        :effective-type :type/Text
                                        :semantic-type  :type/Country}]})
          query             (-> (lib/query metadata-provider (meta/table-metadata :people))
                                (lib/aggregate (lib/count))
                                (lib/breakout (lib.metadata/field metadata-provider 1)))]
      (testing "sanity check: make sure COUNTRY has :type/Country semantic type"
        (testing `lib/returned-columns
          (let [[country _count] (lib/returned-columns query)]
            (is (=? {:semantic-type :type/Country}
                    country)))))
      (lib.drill-thru.tu/test-drill-application
       {:click-type     :cell
        :query-type     :aggregated
        :custom-query   query
        :custom-row     {"count"   100
                         "COUNTRY" "United States"}
        :column-name    "count"
        :drill-type     :drill-thru/zoom-in.geographic
        :expected       {:type      :drill-thru/zoom-in.geographic
                         :subtype   :drill-thru.zoom-in.geographic/country-state-city->binned-lat-lon
                         :column    {:name "COUNTRY"}
                         :value     "United States"
                         :latitude  {:column    {:name "LATITUDE"}
                                     :bin-width 10}
                         :longitude {:column    {:name "LONGITUDE"}
                                     :bin-width 10}}
        :expected-query {:stages [{:source-table (meta/id :people)
                                   :aggregation  [[:count {}]]
                                   :breakout     [[:field
                                                   {:binning {:strategy :bin-width, :bin-width 10}}
                                                   (meta/id :people :latitude)]
                                                  [:field
                                                   {:binning {:strategy :bin-width, :bin-width 10}}
                                                   (meta/id :people :longitude)]]
                                   :filters      [[:= {}
                                                   [:field {} 1]
                                                   "United States"]]}]}}))))

(deftest ^:parallel state-test
  (testing "State => Binned LatLon"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                    (lib/aggregate (lib/count))
                    (lib/breakout (meta/field-metadata :people :state)))]
      (lib.drill-thru.tu/test-drill-application
       {:click-type     :cell
        :query-type     :aggregated
        :custom-query   query
        :custom-row     {"count" 100
                         "STATE" "California"}
        :column-name    "count"
        :drill-type     :drill-thru/zoom-in.geographic
        :expected       {:type      :drill-thru/zoom-in.geographic
                         :subtype   :drill-thru.zoom-in.geographic/country-state-city->binned-lat-lon
                         :column    {:name "STATE"}
                         :value     "California"
                         :latitude  {:column    {:name "LATITUDE"}
                                     :bin-width 1}
                         :longitude {:column    {:name "LONGITUDE"}
                                     :bin-width 1}}
        :expected-query {:stages [{:source-table (meta/id :people)
                                   :aggregation  [[:count {}]]
                                   :breakout     [[:field
                                                   {:binning {:strategy :bin-width, :bin-width 1}}
                                                   (meta/id :people :latitude)]
                                                  [:field
                                                   {:binning {:strategy :bin-width, :bin-width 1}}
                                                   (meta/id :people :longitude)]]
                                   :filters      [[:= {}
                                                   [:field {} (meta/id :people :state)]
                                                   "California"]]}]}}))))

(deftest ^:parallel update-existing-breakouts-on-lat-lon-test
  (testing "If there are already breakouts on lat/lon, we should update them rather than append new ones (#34874)"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                    (lib/aggregate (lib/count))
                    ;; make sure we don't remove other, irrelevant breakouts.
                    (lib/breakout (meta/field-metadata :people :name))
                    (lib/breakout (meta/field-metadata :people :state))
                    (lib/breakout (-> (meta/field-metadata :people :latitude)
                                      (lib/with-binning {:strategy :bin-width, :bin-width 0.1}))))]
      (lib.drill-thru.tu/test-drill-application
       {:click-type     :cell
        :query-type     :aggregated
        :custom-query   query
        :custom-row     {"count"    100
                         "NAME"     "Niblet Cockatiel"
                         "STATE"    "California"
                         "LATITUDE" 100}
        :column-name    "count"
        :drill-type     :drill-thru/zoom-in.geographic
        :expected       {:type      :drill-thru/zoom-in.geographic
                         :subtype   :drill-thru.zoom-in.geographic/country-state-city->binned-lat-lon
                         :column    {:name "STATE"}
                         :value     "California"
                         :latitude  {:column    {:name "LATITUDE"}
                                     :bin-width 1}
                         :longitude {:column    {:name "LONGITUDE"}
                                     :bin-width 1}}
        :expected-query {:stages [{:source-table (meta/id :people)
                                   :aggregation  [[:count {}]]
                                   :breakout     [[:field
                                                   {}
                                                   (meta/id :people :name)]
                                                  [:field
                                                   {:binning {:strategy :bin-width, :bin-width 1}}
                                                   (meta/id :people :latitude)]
                                                  [:field
                                                   {:binning {:strategy :bin-width, :bin-width 1}}
                                                   (meta/id :people :longitude)]]
                                   :filters      [[:= {}
                                                   [:field {} (meta/id :people :state)]
                                                   "California"]]}]}}))))

(deftest ^:parallel city-test
  (testing "City => Binned LatLon"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                    (lib/aggregate (lib/count))
                    (lib/breakout (meta/field-metadata :people :city)))]
      (lib.drill-thru.tu/test-drill-application
       {:click-type     :cell
        :query-type     :aggregated
        :custom-query   query
        :custom-row     {"count" 100
                         "CITY"  "Long Beach"}
        :column-name    "CITY"
        :drill-type     :drill-thru/zoom-in.geographic
        :expected       {:type      :drill-thru/zoom-in.geographic
                         :subtype   :drill-thru.zoom-in.geographic/country-state-city->binned-lat-lon
                         :column    {:name "CITY"}
                         :value     "Long Beach"
                         :latitude  {:column    {:name "LATITUDE"}
                                     :bin-width 0.1}
                         :longitude {:column    {:name "LONGITUDE"}
                                     :bin-width 0.1}}
        :expected-query {:stages [{:source-table (meta/id :people)
                                   :aggregation  [[:count {}]]
                                   :breakout     [[:field
                                                   {:binning {:strategy :bin-width, :bin-width 0.1}}
                                                   (meta/id :people :latitude)]
                                                  [:field
                                                   {:binning {:strategy :bin-width, :bin-width 0.1}}
                                                   (meta/id :people :longitude)]]
                                   :filters      [[:= {}
                                                   [:field {} (meta/id :people :city)]
                                                   "Long Beach"]]}]}}))))

(deftest ^:parallel binned-lat-lon-large-bin-size-test
  (testing "Binned LatLon (width >= 20) => Binned LatLon (width = 10)"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                    (lib/aggregate (lib/count))
                    (lib/breakout (-> (meta/field-metadata :people :latitude)
                                      (lib/with-binning {:strategy :bin-width, :bin-width 20})))
                    (lib/breakout (-> (meta/field-metadata :people :longitude)
                                      (lib/with-binning {:strategy :bin-width, :bin-width 25}))))]
      (lib.drill-thru.tu/test-drill-application
       {:click-type     :cell
        :query-type     :aggregated
        :custom-query   query
        :custom-row     {"count"     100
                         "LATITUDE"  20
                         "LONGITUDE" 50}
        :column-name    "count"
        :drill-type     :drill-thru/zoom-in.geographic
        :expected       {:type      :drill-thru/zoom-in.geographic
                         :subtype   :drill-thru.zoom-in.geographic/binned-lat-lon->binned-lat-lon
                         :latitude  {:column    {:name "LATITUDE"}
                                     :bin-width 10
                                     :min       20
                                     :max       40}
                         :longitude {:column    {:name "LONGITUDE"}
                                     :bin-width 10
                                     :min       50
                                     :max       75}}
        :expected-query {:stages [{:source-table (meta/id :people)
                                   :aggregation  [[:count {}]]
                                   :breakout     [[:field
                                                   {:binning {:strategy :bin-width, :bin-width 10}}
                                                   (meta/id :people :latitude)]
                                                  [:field
                                                   {:binning {:strategy :bin-width, :bin-width 10}}
                                                   (meta/id :people :longitude)]]
                                   :filters      [[:>= {}
                                                   [:field {} (meta/id :people :latitude)]
                                                   20]
                                                  [:< {}
                                                   [:field {} (meta/id :people :latitude)]
                                                   40]
                                                  [:>= {}
                                                   [:field {} (meta/id :people :longitude)]
                                                   50]
                                                  [:< {}
                                                   [:field {} (meta/id :people :longitude)]
                                                   75]]}]}}))))

(deftest ^:parallel binned-lat-lon-small-bin-size-test
  (testing "Binned LatLon (width < 20) => Binned LatLon (width ÷= 10)"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                    (lib/aggregate (lib/count))
                    (lib/breakout (-> (meta/field-metadata :people :latitude)
                                      (lib/with-binning {:strategy :bin-width, :bin-width 10})))
                    (lib/breakout (-> (meta/field-metadata :people :longitude)
                                      (lib/with-binning {:strategy :bin-width, :bin-width 5}))))]
      (lib.drill-thru.tu/test-drill-application
       {:click-type     :cell
        :query-type     :aggregated
        :custom-query   query
        :custom-row     {"count"     100
                         "LATITUDE"  20
                         "LONGITUDE" 50}
        :column-name    "count"
        :drill-type     :drill-thru/zoom-in.geographic
        :expected       {:type      :drill-thru/zoom-in.geographic
                         :subtype   :drill-thru.zoom-in.geographic/binned-lat-lon->binned-lat-lon
                         :latitude  {:column    {:name "LATITUDE"}
                                     :bin-width 1.0
                                     :min       20
                                     :max       30}
                         :longitude {:column    {:name "LONGITUDE"}
                                     :bin-width 0.5
                                     :min       50
                                     :max       55}}
        :expected-query {:stages [{:source-table (meta/id :people)
                                   :aggregation  [[:count {}]]
                                   :breakout     [[:field
                                                   {:binning {:strategy :bin-width, :bin-width 1.0}}
                                                   (meta/id :people :latitude)]
                                                  [:field
                                                   {:binning {:strategy :bin-width, :bin-width 0.5}}
                                                   (meta/id :people :longitude)]]
                                   :filters      [[:>= {}
                                                   [:field {} (meta/id :people :latitude)]
                                                   20]
                                                  [:< {}
                                                   [:field {} (meta/id :people :latitude)]
                                                   30]
                                                  [:>= {}
                                                   [:field {} (meta/id :people :longitude)]
                                                   50]
                                                  [:< {}
                                                   [:field {} (meta/id :people :longitude)]
                                                   55]]}]}}))))

(deftest ^:parallel binned-lat-lon-default-binning-test
  (testing "Binned LatLon (default 'Auto-Bin') => Binned LatLon. Should use :dimensions (#36247)"
    (let [query         (-> (lib/query meta/metadata-provider (meta/table-metadata :people))
                            (lib/aggregate (lib/count))
                            (lib/breakout (-> (meta/field-metadata :people :latitude)
                                              (lib/with-binning {:strategy :default})))
                            (lib/breakout (-> (meta/field-metadata :people :longitude)
                                              (lib/with-binning {:strategy :default}))))
          col-count     (m/find-first #(= (:name %) "count")
                                      (lib/returned-columns query))
          _             (is (some? col-count))
          col-latitude  (m/find-first #(= (:name %) "LATITUDE")
                                      (lib/returned-columns query))
          _             (is (some? col-latitude))
          col-longitude (m/find-first #(= (:name %) "LONGITUDE")
                                      (lib/returned-columns query))
          _             (is (some? col-longitude))
          context       {:column     col-count
                         :column-ref (lib/ref col-count)
                         :value      10
                         :row        [{:column     col-latitude
                                       :column-ref (lib/ref col-latitude)
                                       :value      20.0}
                                      {:column     col-longitude
                                       :column-ref (lib/ref col-longitude)
                                       :value      50.0}
                                      {:column     col-count
                                       :column-ref (lib/ref col-count)
                                       :value      10}]
                         :dimensions [{:column     col-latitude
                                       :column-ref (lib/ref col-latitude)
                                       :value      20.0}
                                      {:column     col-longitude
                                       :column-ref (lib/ref col-longitude)
                                       :value      50.0}]}
          drill         (m/find-first #(= (:type %) :drill-thru/zoom-in.geographic)
                                      (lib/available-drill-thrus query -1 context))]
      (is (=? {:lib/type  :metabase.lib.drill-thru/drill-thru,
               :type      :drill-thru/zoom-in.geographic,
               :subtype   :drill-thru.zoom-in.geographic/binned-lat-lon->binned-lat-lon,
               :latitude  {:column    {:name                       "LATITUDE"
                                       :metabase.lib.field/binning {:strategy :default}}
                           :bin-width 1.0
                           :min       20.0
                           :max       30.0}
               :longitude {:column    {:name                       "LONGITUDE"
                                       :metabase.lib.field/binning {:strategy :default}}
                           :bin-width 1.0
                           :min       50.0
                           :max       60.0}}
              drill))
      (is (=? {:stages [{:aggregation [[:count {}]]
                         :breakout    [[:field
                                        {:binning {:strategy :bin-width, :bin-width 1.0}}
                                        (meta/id :people :latitude)]
                                       [:field
                                        {:binning {:strategy :bin-width, :bin-width 1.0}}
                                        (meta/id :people :longitude)]]
                         :filters     [[:>=
                                        {}
                                        [:field
                                         {:binning {:strategy :default}}
                                         (meta/id :people :latitude)]
                                        20.0]
                                       [:<
                                        {}
                                        [:field
                                         {:binning {:strategy :default}}
                                         (meta/id :people :latitude)]
                                        30.0]
                                       [:>=
                                        {}
                                        [:field
                                         {:binning {:strategy :default}}
                                         (meta/id :people :longitude)]
                                        50.0]
                                       [:<
                                        {}
                                        [:field
                                         {:binning {:strategy :default}}
                                         (meta/id :people :longitude)]
                                        60.0]]}]}
              (lib/drill-thru query -1 drill))))))

(deftest ^:parallel zoom-in-on-join-test
  (testing "#11210"
    (let [base       (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                         (lib/join (meta/table-metadata :people))
                         (lib/aggregate (lib/count)))
          join-alias (-> base :stages first :joins first :alias)
          query      (-> base
                         (lib/breakout (-> (meta/field-metadata :people :latitude)
                                           (lib/with-binning {:strategy :bin-width, :bin-width 10})
                                           (lib/with-join-alias join-alias)))
                         (lib/breakout (-> (meta/field-metadata :people :longitude)
                                           (lib/with-binning {:strategy :bin-width, :bin-width 10})
                                           (lib/with-join-alias join-alias))))]
      (lib.drill-thru.tu/test-drill-application
       {:click-type     :cell
        :query-type     :aggregated
        :custom-query   query
        :custom-row     {"count"     100
                         "LATITUDE"  20
                         "LONGITUDE" 50}
        :column-name    "count"
        :drill-type     :drill-thru/zoom-in.geographic
        :expected       {:type      :drill-thru/zoom-in.geographic
                         :subtype   :drill-thru.zoom-in.geographic/binned-lat-lon->binned-lat-lon
                         :latitude  {:column    {:name "LATITUDE"}
                                     :bin-width 1.0
                                     :min       20
                                     :max       30}
                         :longitude {:column    {:name "LONGITUDE"}
                                     :bin-width 1.0
                                     :min       50
                                     :max       60}}
        :expected-query {:stages [{:source-table (meta/id :orders)
                                   :aggregation  [[:count {}]]
                                   :breakout     [[:field
                                                   {:binning {:strategy :bin-width, :bin-width 1.0}}
                                                   (meta/id :people :latitude)]
                                                  [:field
                                                   {:binning {:strategy :bin-width, :bin-width 1.0}}
                                                   (meta/id :people :longitude)]]
                                   :filters      [[:>= {}
                                                   [:field {} (meta/id :people :latitude)]
                                                   20]
                                                  [:< {}
                                                   [:field {} (meta/id :people :latitude)]
                                                   30]
                                                  [:>= {}
                                                   [:field {} (meta/id :people :longitude)]
                                                   50]
                                                  [:< {}
                                                   [:field {} (meta/id :people :longitude)]
                                                   60]]}]}}))))

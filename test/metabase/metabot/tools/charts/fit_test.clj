(ns metabase.metabot.tools.charts.fit-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.metabot.tools.charts.fit :as fit]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.metabot.tools.shared :as shared]))

(defn- fitting-chart-types!
  "The chart types that [[fit/check-chart-type!]] accepts for `query`, separated by spaces."
  [query]
  (str/join " " (filter (fn [chart-type]
                          (try
                            (fit/check-chart-type! chart-type query)
                            true
                            (catch clojure.lang.ExceptionInfo e
                              (if (= ::fit/incompatible-chart-type (:code (tools.error/classify e)))
                                false
                                (throw e)))))
                        shared/chart-types)))

(defn- query [table]
  (lib/query meta/metadata-provider (meta/table-metadata table)))

(defn- count-by [table & columns]
  (reduce lib/breakout (lib/aggregate (query table) (lib/count)) columns))

(defn- month [column]
  (lib/with-temporal-bucket column :month))

(defn- binned [column]
  (lib/with-binning column {:strategy :default}))

(deftest chart-type-fits-when-the-frontend-can-draw-it-test
  (testing "a chart type fits a query when the frontend draws it from the query's columns with its default settings"
    (are [q fitting] (= fitting (fitting-chart-types! q))
      (count-by :orders)
      "table scalar gauge progress object"

      (lib/aggregate (count-by :orders) (lib/sum (meta/field-metadata :orders :total)))
      "table pivot scatter scalar gauge progress object"

      (lib/aggregate (query :orders) (lib/max (meta/field-metadata :orders :created-at)))
      "table scalar object"

      (count-by :products (meta/field-metadata :products :category))
      "table bar line pie sunburst treemap boxplot area combo row pivot scatter waterfall progress funnel object"

      (count-by :orders (month (meta/field-metadata :orders :created-at)))
      "table bar line pie sunburst treemap boxplot area combo row pivot scatter waterfall smartscalar progress funnel object"

      (count-by :products
                (meta/field-metadata :products :category)
                (month (meta/field-metadata :products :created-at)))
      "table bar line pie sunburst treemap boxplot area combo row pivot scatter progress object"

      (count-by :products
                (meta/field-metadata :products :category)
                (meta/field-metadata :products :vendor)
                (month (meta/field-metadata :products :created-at)))
      "table pie sunburst treemap pivot sankey progress object"

      (count-by :products
                (meta/field-metadata :products :category)
                (meta/field-metadata :products :vendor)
                (meta/field-metadata :products :title)
                (month (meta/field-metadata :products :created-at)))
      "table treemap pivot sankey progress object"

      (reduce lib/aggregate
              (count-by :products (meta/field-metadata :products :category))
              [(lib/sum (meta/field-metadata :products :price))
               (lib/avg (meta/field-metadata :products :rating))
               (lib/max (meta/field-metadata :products :price))])
      "table bar line pie sunburst treemap boxplot area combo row pivot waterfall progress object"

      (-> (query :products)
          (lib/breakout (meta/field-metadata :products :category))
          (lib/breakout (month (meta/field-metadata :products :created-at))))
      "table pivot object"

      (lib/append-stage (count-by :products (meta/field-metadata :products :category)))
      "table bar line pie sunburst treemap boxplot area combo row scatter waterfall scalar progress funnel object"

      (query :orders)
      "table treemap sankey scalar gauge progress object"

      (lib/with-fields (query :orders) [(meta/field-metadata :orders :subtotal)
                                        (meta/field-metadata :orders :tax)])
      "table scatter scalar gauge progress object"

      (lib/with-fields (query :orders) [(meta/field-metadata :orders :created-at)
                                        (meta/field-metadata :orders :total)])
      "table bar line pie sunburst treemap boxplot area combo row scatter waterfall scalar smartscalar progress funnel object"

      (count-by :people (meta/field-metadata :people :state))
      "table bar line pie sunburst treemap boxplot area combo row pivot scatter waterfall progress funnel object map"

      (count-by :people
                (binned (meta/field-metadata :people :latitude))
                (binned (meta/field-metadata :people :longitude)))
      "table bar line pie sunburst treemap boxplot area combo row pivot scatter progress object map"

      (lib/with-fields (query :people) [(meta/field-metadata :people :latitude)
                                        (meta/field-metadata :people :longitude)
                                        (meta/field-metadata :people :name)])
      "table bar line pie sunburst treemap boxplot area combo row scatter waterfall scalar gauge progress object map")))

(deftest any-chart-type-fits-a-sql-query-test
  (testing "the columns of a SQL query aren't known until it runs, so any chart type passes"
    (is (= (str/join " " shared/chart-types)
           (fitting-chart-types! (lib/native-query meta/metadata-provider "SELECT 1"))))))

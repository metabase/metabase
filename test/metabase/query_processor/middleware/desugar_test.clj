(ns metabase.query-processor.middleware.desugar-test
  "Sctual desugaring logic and tests are in [[metabase.lib.filter.desugar]]."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.middleware.desugar :as desugar]))

(defn- opts [& {:as kvs}]
  (merge {:lib/uuid (str (random-uuid))} kvs))

(deftest ^:parallel e2e-filters-test
  (is (=? [[:and {}
            [:= {}
             [:field {:source-field (meta/id :orders :user-id)} (meta/id :people :name)]
             "Run Query"]
            [:between {}
             [:field {:temporal-unit :day} (meta/id :orders :created-at)]
             [:relative-datetime {} -30 :day]
             [:relative-datetime {} -1 :day]]
            [:>= {}
             [:field {:temporal-unit :default} (meta/id :orders :created-at)]
             [:+ {} [:relative-datetime {} -30 :day] [:interval {} -30 :day]]]
            [:< {}
             [:field {:temporal-unit :default} (meta/id :orders :created-at)]
             [:+ {}
              [:relative-datetime {} 0 :day]
              [:interval {} -30 :day]]]
            [:!= {}
             [:field {:source-field (meta/id :orders :user-id)} (meta/id :people :source)]
             "(not set)"]
            [:!= {}
             [:field {:source-field (meta/id :orders :user-id)} (meta/id :people :source)]
             "Twitter"]
            [:> {}
             [:temporal-extract {}
              [:field {:source-field (meta/id :orders :user-id)} (meta/id :people :birth-date)]
              :year-of-era]
             [:/ {} [:/ {} 1 2] 3]]]]
          (-> (lib/query
               meta/metadata-provider
               {:lib/type :mbql/query
                :stages   [{:source-table (meta/id :orders)
                            :filters      [[:and (opts)
                                            [:= (opts)
                                             [:field (opts :source-field (meta/id :orders :user-id)) (meta/id :people :name)]
                                             "Run Query"]
                                            [:time-interval (opts)
                                             [:field (opts :temporal-unit :day) (meta/id :orders :created-at)]
                                             -30 :day]
                                            [:relative-time-interval (opts)
                                             [:field (opts) (meta/id :orders :created-at)]
                                             -30 :day
                                             -30 :day]
                                            [:!=
                                             [:field (opts :source-field (meta/id :orders :user-id)) (meta/id :people :source)]
                                             "(not set)"
                                             "Twitter"]
                                            [:>
                                             [:get-year [:field (opts :source-field (meta/id :orders :user-id)) (meta/id :people :birth-date)]]
                                             [:/ 1 2 3]]]]}]})
              desugar/desugar
              :stages
              first
              :filters))))

(deftest ^:parallel e2e-expressions-test
  (is (=? [[:+
            {:lib/expression-name "year"}
            [:temporal-extract {}
             [:field {:source-field (meta/id :orders :user-id)} (meta/id :people :birth-date)]
             :year-of-era]
            [:/ {} [:/ {} [:/ {} 1 2] 3] 4]]]
          (-> (lib/query
               meta/metadata-provider
               {:lib/type :mbql/query
                :stages   [{:source-table (meta/id :orders)
                            :expressions  [[:+ (opts :lib/expression-name "year")
                                            [:get-year (opts)
                                             [:field (opts :source-field (meta/id :orders :user-id)) (meta/id :people :birth-date)]]
                                            [:/ (opts) 1 2 3 4]]]}]})
              desugar/desugar
              :stages
              first
              :expressions))))

(deftest ^:parallel e2e-aggregations-test
  (is (=? [[:share {}
            [:and {}
             [:= {}
              [:field {:source-field (meta/id :orders :user-id)} (meta/id :people :name)]
              "Run Query"]
             [:between {}
              [:field {:temporal-unit :day} (meta/id :orders :created-at)]
              [:relative-datetime {} -30 :day]
              [:relative-datetime {} -1 :day]]
             [:!= {}
              [:field {:source-field (meta/id :orders :user-id)} (meta/id :people :source)]
              "(not set)"]
             [:!= {}
              [:field {:source-field (meta/id :orders :user-id)} (meta/id :people :source)]
              "Twitter"]]]]
          (-> (lib/query
               meta/metadata-provider
               {:lib/type :mbql/query
                :stages   [{:source-table (meta/id :orders)
                            :aggregation  [[:share (opts)
                                            [:and (opts)
                                             [:= (opts)
                                              [:field (opts :source-field (meta/id :orders :user-id)) (meta/id :people :name)]
                                              "Run Query"]
                                             [:time-interval (opts)
                                              [:field (opts) (meta/id :orders :created-at)]
                                              -30
                                              :day]
                                             [:!= (opts)
                                              [:field (opts :source-field (meta/id :orders :user-id)) (meta/id :people :source)]
                                              "(not set)"
                                              "Twitter"]]]]}]})
              desugar/desugar
              :stages
              first
              :aggregation))))

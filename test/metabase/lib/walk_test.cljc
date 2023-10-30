(ns metabase.lib.walk-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.walk :as lib.walk]))

(defn- test-query []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
      (lib/join (meta/table-metadata :people))
      (lib/join (meta/table-metadata :products))
      lib/append-stage
      (lib/aggregate (lib/count))
      (lib/aggregate (lib/sum (meta/field-metadata :orders :tax)))
      (lib/aggregate (lib/max (meta/field-metadata :orders :discount)))
      (lib/breakout (meta/field-metadata :orders :product-id))
      (lib/breakout (-> (meta/field-metadata :orders :created-at)
                        (lib/with-temporal-bucket :month)))
      lib/append-stage))

(deftest ^:parallel walk-test
  (let [query  (test-query)
        calls  (atom [])
        query' (lib.walk/walk query
                              (fn [x options]
                                (swap! calls conj {:x (lib.dispatch/dispatch-value x), :path (:path options)})
                                x))]
    (is (= query query'))
    (is (identical? query query'))
    (is (= [{:x :mbql.stage/mbql,          :path [:stages 0 :joins 0 :stages 0]}
            {:x :dispatch-type/sequential, :path [:stages 0 :joins 0 :stages]}
            {:x :field,                    :path [:stages 0 :joins 0 :conditions 0 2]}
            {:x :field,                    :path [:stages 0 :joins 0 :conditions 0 3]}
            {:x :=,                        :path [:stages 0 :joins 0 :conditions 0]}
            {:x :dispatch-type/sequential, :path [:stages 0 :joins 0 :conditions]}
            {:x :mbql/join,                :path [:stages 0 :joins 0]}
            {:x :mbql.stage/mbql,          :path [:stages 0 :joins 1 :stages 0]}
            {:x :dispatch-type/sequential, :path [:stages 0 :joins 1 :stages]}
            {:x :field,                    :path [:stages 0 :joins 1 :conditions 0 2]}
            {:x :field,                    :path [:stages 0 :joins 1 :conditions 0 3]}
            {:x :=,                        :path [:stages 0 :joins 1 :conditions 0]}
            {:x :dispatch-type/sequential, :path [:stages 0 :joins 1 :conditions]}
            {:x :mbql/join,                :path [:stages 0 :joins 1]}
            {:x :dispatch-type/sequential, :path [:stages 0 :joins]}
            {:x :mbql.stage/mbql,          :path [:stages 0]}
            {:x :field,                    :path [:stages 1 :breakout 0]}
            {:x :field,                    :path [:stages 1 :breakout 1]}
            {:x :dispatch-type/sequential, :path [:stages 1 :breakout]}
            {:x :count,                    :path [:stages 1 :aggregation 0]}
            {:x :field,                    :path [:stages 1 :aggregation 1 2]}
            {:x :sum,                      :path [:stages 1 :aggregation 1]}
            {:x :field,                    :path [:stages 1 :aggregation 2 2]}
            {:x :max,                      :path [:stages 1 :aggregation 2]}
            {:x :dispatch-type/sequential, :path [:stages 1 :aggregation]}
            {:x :mbql.stage/mbql,          :path [:stages 1]}
            {:x :mbql.stage/mbql,          :path [:stages 2]}
            {:x :dispatch-type/sequential, :path [:stages]}
            {:x :mbql/query,               :path []}]
           @calls))))

(deftest ^:parallel walk-stages-and-joins-test
  (let [query (test-query)
        calls  (atom [])
        query' (lib.walk/walk-stages-and-joins query
                                               (fn [x options]
                                                 (swap! calls conj {:x (lib.dispatch/dispatch-value x), :path (:path options)})
                                                 x))]
    (is (= query query'))
    (is (identical? query query'))
    (is (= [{:x :mbql.stage/mbql, :path [:stages 0 :joins 0 :stages 0]}
            {:x :mbql/join, :path [:stages 0 :joins 0]}
            {:x :mbql.stage/mbql, :path [:stages 0 :joins 1 :stages 0]}
            {:x :mbql/join, :path [:stages 0 :joins 1]}
            {:x :mbql.stage/mbql, :path [:stages 0]}
            {:x :mbql.stage/mbql, :path [:stages 1]}
            {:x :mbql.stage/mbql, :path [:stages 2]}]
           @calls))))

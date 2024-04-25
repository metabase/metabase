(ns metabase.lib.binning-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel binning-display-name-for-coordinate-columns-test
  (testing "Include little degree symbols in display names for coordinate columns"
    (let [query     (lib/query meta/metadata-provider (meta/table-metadata :people))
          longitude (meta/field-metadata :people :longitude)
          binning   (m/find-first #(= (:display-name %) "Bin every 20 degrees")
                                  (lib/available-binning-strategies query longitude))]
      (is binning)
      (let [display-name (lib/display-name query (lib/with-binning longitude binning))]
        (is (= "Longitude: 20°"
               display-name))))))

(deftest ^:parallel resolve-default-bin-width-test
  (let [query        (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                         (lib/aggregate (lib/count))
                         (lib/breakout (-> (meta/field-metadata :orders :quantity)
                                           (lib/with-binning {:strategy :default}))))
        col-quantity (m/find-first #(= (:name %) "QUANTITY")
                                   (lib/returned-columns query))]
    (is (some? col-quantity))
    (is (= {:bin-width 12.5, :min-value 15, :max-value 27.5}
           (lib.binning/resolve-bin-width query col-quantity 15)))))

(deftest ^:parallel binning-and-bucketing-only-show-up-for-returned-and-breakoutable-columns
  (testing "Within the stage, binning and bucketing at breakout should be invisible, outside the stage it should be visible"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/aggregate (lib/count)))
          total-col (m/find-first (comp #{"TOTAL"} :name) (lib/breakoutable-columns query))
          binned-total (lib/with-binning total-col (first (lib/available-binning-strategies query total-col)))
          query (lib/breakout query binned-total)
          created-col (m/find-first (comp #{"CREATED_AT"} :name) (lib/breakoutable-columns query))
          bucket-created (lib/with-temporal-bucket created-col (first (lib/available-temporal-buckets query created-col)))
          query (lib/breakout query bucket-created)]
      (is (=?
            (complement :metabase.lib.field/binning)
            (m/find-first (comp #{"TOTAL"} :name) (lib/visible-columns query))))
      (is (=?
            {:metabase.lib.field/binning {:strategy :default}}
            (m/find-first (comp #{"TOTAL"} :name) (lib/breakoutable-columns query))))
      (is (=?
            {:metabase.lib.field/binning {:strategy :default}}
            (m/find-first (comp #{"TOTAL"} :name) (lib/returned-columns query))))
      (is (=?
            (complement :metabase.lib.field/temporal-unit)
            (m/find-first (comp #{"CREATED_AT"} :name) (lib/visible-columns query))))
      (is (=?
            {:metabase.lib.field/temporal-unit :minute}
            (m/find-first (comp #{"CREATED_AT"} :name) (lib/breakoutable-columns query))))
      (is (=?
            {:metabase.lib.field/temporal-unit :minute}
            (m/find-first (comp #{"CREATED_AT"} :name) (lib/returned-columns query)))))))

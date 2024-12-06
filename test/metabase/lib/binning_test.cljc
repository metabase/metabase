(ns metabase.lib.binning-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.core :as lib]
   [metabase.lib.stage :as lib.stage]
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

(deftest ^:parallel binning-and-bucketing-only-show-up-for-returned-and-breakout-columns
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
           (complement :metabase.lib.field/binning)
           (m/find-first (comp #{"TOTAL"} :name) (lib/breakoutable-columns query))))
      (is (=?
           {:metabase.lib.field/binning {:strategy :default}}
           (lib/breakout-column query -1 (first (lib/breakouts query)))))
      (is (=?
           {:metabase.lib.field/binning {:strategy :default}}
           (m/find-first (comp #{"TOTAL"} :name) (lib/returned-columns query))))
      (is (=?
           (complement :metabase.lib.field/temporal-unit)
           (m/find-first (comp #{"CREATED_AT"} :name) (lib/visible-columns query))))
      (is (=?
           (complement :metabase.lib.field/temporal-unit)
           (m/find-first (comp #{"CREATED_AT"} :name) (lib/breakoutable-columns query))))
      (is (=?
           {:metabase.lib.field/temporal-unit :minute}
           (lib/breakout-column query -1 (second (lib/breakouts query)))))
      (is (=?
           {:metabase.lib.field/temporal-unit :minute}
           (m/find-first (comp #{"CREATED_AT"} :name) (lib/returned-columns query)))))))

(deftest ^:parallel binning-equality-test
  (testing "should compare 'default' binning values"
    (are [expected x y] (= expected (lib.binning/binning= x y) (lib.binning/binning= y x))
      true  {:strategy :default} {:strategy :default}
      false {:strategy :default} {:strategy :num-bins, :num-bins 10}
      false {:strategy :default} {:strategy :bin-width, :bin-width 10}))
  (testing "should compare 'num-bins' binning values"
    (are [expected x y] (= expected (lib.binning/binning= x y) (lib.binning/binning= y x))
      true  {:strategy :num-bins, :num-bins 10}               {:strategy :num-bins, :num-bins 10}
      true  {:strategy :num-bins, :num-bins 10, :bin-width 3} {:strategy :num-bins, :num-bins 10}
      true  {:strategy :num-bins, :num-bins 10, :bin-width 3} {:strategy :num-bins, :num-bins 10, :bin-width 4}
      true  {:strategy :num-bins, :num-bins 10}               {:strategy :num-bins, :num-bins 10, :metadata-fn (fn [] nil)}
      false {:strategy :num-bins, :num-bins 10}               {:strategy :num-bins, :num-bins 20}))
  (testing "should compare 'bin-width' binning values"
    (are [expected x y] (= expected (lib.binning/binning= x y) (lib.binning/binning= y x))
      true  {:strategy :bin-width, :bin-width 10}              {:strategy :bin-width, :bin-width 10}
      true  {:strategy :bin-width, :bin-width 10, :num-bins 3} {:strategy :bin-width, :bin-width 10}
      true  {:strategy :bin-width, :bin-width 10, :num-bins 3} {:strategy :bin-width, :bin-width 10, :num-bins 4}
      true  {:strategy :bin-width, :bin-width 10}              {:strategy :bin-width, :bin-width 10, :metadata-fn (fn [] nil)}
      false {:strategy :bin-width, :bin-width 10}              {:strategy :bin-width, :bin-width 20})))

(deftest ^:parallel binning-is-propagated-into-next-stage-display-name
  (doseq [[binning-name expected-display-name table-kw field-kw]
          [["50 bins" "Total: 50 bins" :orders :total]
           ["Bin every 10 degrees" "Latitude: 10°" :venues :latitude]]]
    (let [query (as-> meta/metadata-provider $
                  (lib/query $ (meta/table-metadata table-kw))
                  (lib/aggregate $ (lib/count))
                  (lib/breakout $ (lib/with-binning
                                   (meta/field-metadata table-kw field-kw)
                                   (m/find-first (comp #{binning-name} :display-name)
                                                 (lib/available-binning-strategies $ (meta/field-metadata table-kw field-kw)))))
                  (lib.stage/append-stage $))]
      (testing "Binning is present in next stage display-name"
        (is (some? (m/find-first (comp #{expected-display-name} :display-name)
                                 (lib/visible-columns query)))))
      (testing "Binning is present in `nnext` stage display-name"
        (is (some? (m/find-first (comp #{expected-display-name} :display-name)
                                 (lib/visible-columns
                                  (lib.stage/append-stage query))))))
      (testing "Application of same binning on next stage does not modify display name"
        (is (some? (m/find-first (comp #{expected-display-name} :display-name)
                                 (let [first-stage-binned-column (m/find-first (comp #{expected-display-name} :display-name)
                                                                               (lib/visible-columns query))]
                                   (lib/visible-columns
                                    (as-> query $
                                      (lib/breakout $ (lib/with-binning
                                                       first-stage-binned-column
                                                       (m/find-first (comp #{binning-name} :display-name)
                                                                     (lib/available-binning-strategies
                                                                      $ first-stage-binned-column))))))))))))))

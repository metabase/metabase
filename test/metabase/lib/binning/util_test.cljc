(ns metabase.lib.binning.util-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.binning.util :as lib.binning.util]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.test-metadata :as meta]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel filter->field-map-test
  (is (= {}
         (lib.binning.util/filters->field-map
          (lib.normalize/normalize
           ::lib.schema/filters
           [[:and
             [:= {} [:field {} 1] 10]
             [:= {} [:field {} 2] 10]]]))))
  (is (=? {1 [[:< {} [:field {} 1] 10] [:> {} [:field {} 1] 1]]
           2 [[:> {} [:field {} 2] 20] [:< {} [:field {} 2] 10]]
           3 [[:between {} [:field {} 3] 5 10]]}
          (lib.binning.util/filters->field-map
           (lib.normalize/normalize
            ::lib.schema/filters
            [[:and
              [:< {} [:field {} 1] 10]
              [:> {} [:field {} 1] 1]
              [:> {} [:field {} 2] 20]
              [:< {} [:field {} 2] 10]
              [:between {} [:field {} 3] 5 10]]])))))

(def ^:private test-min-max-fingerprint
  {:type {:type/Number {:min 100 :max 1000}}})

(deftest ^:parallel extract-bounds-test
  (are [field-id->filters expected] (= expected
                                       (lib.binning.util/extract-bounds
                                        1 test-min-max-fingerprint
                                        (lib.normalize/normalize
                                         [:map-of ::lib.schema.id/field ::lib.schema/filters]
                                         field-id->filters)))
    {1 [[:> {} [:field {} 1] 1]
        [:< {} [:field {} 1] 10]]}
    {:min-value 1, :max-value 10}

    {1 [[:between {} [:field {} 1] 1 10]]}
    {:min-value 1, :max-value 10}

    {}
    {:min-value 100, :max-value 1000}

    {1 [[:> {} [:field {} 1] 500]]}
    {:min-value 500, :max-value 1000}

    {1 [[:< {} [:field {} 1] 500]]}
    {:min-value 100, :max-value 500}

    {1 [[:> {} [:field {} 1] 200] [:< {} [:field {} 1] 800] [:between {} [:field {} 1] 600 700]]}
    {:min-value 600, :max-value 700}))

(deftest ^:parallel extract-bounds-missing-fingerprint-test
  (is (nil? (lib.binning.util/extract-bounds 1 nil {})))
  (is (nil? (lib.binning.util/extract-bounds 1 {:type {:type/Number {:min nil :max nil}}} {}))))

(deftest ^:parallel extract-bounds-field-name-test
  (testing "Should be able to adjust min max based on filters against named field refs. (#26202)"
    (is (= {:min-value 1, :max-value 10}
           (lib.binning.util/extract-bounds
            "foo" test-min-max-fingerprint
            {"foo" (lib.normalize/normalize
                    ::lib.schema/filters
                    [[:> {} [:field {} 1] 1] [:< {} [:field {} 1] 10]])})))))

(deftest ^:parallel calculate-bin-width-single-value-test
  (are [minv maxv bins] (= 1 (#'lib.binning.util/calculate-bin-width minv maxv bins))
    0     0     1
    -3    -3    14
    7N    7N    25
    7N    7     25
    0.25  0.25  5
    42M   42M   42))

(deftest ^:parallel floor-to-test
  (are [x expected] (= expected
                       (#'lib.binning.util/floor-to 1.0 x))
    1    1.0
    1.1  1.0
    1.8  1.0
    -1   -1.0
    -1.1 -2.0
    -1.8 -2.0))

(deftest ^:parallel ceil-to-test
  (are [precision x expected] (= expected
                                 (#'lib.binning.util/ceil-to precision x))
    1.0  1     1.0
    1.0  1.1   2.0
    1.0  1.8   2.0
    15.0 1.0   15.0
    15.0 15.0  15.0
    15.0 16.0  30.0
    1.0  -1    -1.0
    1.0  -1.1  -1.0
    1.0  -1.8  -1.0
    15.0 -1.0  -0.0
    15.0 -15.0 -15.0
    15.0 -16.0 -15.0))

(deftest ^:parallel nicer-bin-width-test
  (are [min max num-bins expected] (= expected
                                      (lib.binning.util/nicer-bin-width min max num-bins))
    27      135      8  20.0
    -0.0002 10000.34 8  2000.0
    8.94    159.35   10 20.0
    1.0     4.0      8  0.5))

(deftest ^:parallel nicer-breakout-test
  (are [strategy opts expected] (= expected
                                   (#'lib.binning.util/nicer-breakout strategy opts))
    :num-bins  {:min-value 100, :max-value 1000, :num-bins 8}   {:min-value 0.0, :max-value 1000.0, :num-bins 8, :bin-width 125.0}
    :num-bins  {:min-value 200, :max-value 1600, :num-bins 8}   {:min-value 200.0, :max-value 1600.0, :num-bins 8, :bin-width 200.0}
    :num-bins  {:min-value 9, :max-value 1002, :num-bins 8}     {:min-value 0.0, :max-value 1200.0, :num-bins 8, :bin-width 200.0}
    :bin-width {:min-value 9, :max-value 1002, :bin-width 15.0} {:min-value 0.0, :max-value 1005.0, :num-bins 67, :bin-width 15.0}

    :num-bins
    {:min-value 12.061602936923117, :max-value 238.32732001721533, :bin-width 28.28321, :num-bins 8}
    {:min-value 0.0, :max-value 240.0, :num-bins 8, :bin-width 30.0}))

(deftest ^:parallel resolve-default-strategy-test
  (let [column (assoc (meta/field-metadata :orders :total)
                      :semantic-type :type/Income)]
    (is (= [:num-bins {:num-bins 8, :bin-width 28.28321}]
           (#'lib.binning.util/resolve-default-strategy meta/metadata-provider column 12.061602936923117 238.32732001721533)))))

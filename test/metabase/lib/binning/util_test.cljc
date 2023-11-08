(ns metabase.lib.binning.util-test
  (:require
   [clojure.test :refer [are deftest is]]
   [metabase.lib.binning.util :as lib.binning.util]
   [metabase.lib.test-metadata :as meta]))

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

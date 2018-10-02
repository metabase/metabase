(ns metabase.query-processor.middleware.binning-test
  (:require [expectations :refer [expect]]
            [metabase.models.field :as field]
            [metabase.query-processor.middleware.binning :as binning]))

(expect
  {}
  (#'binning/filter->field-map [:and
                                [:= [:field-id 1] 10]
                                [:= [:field-id 2] 10]]))

(expect
  {1 [[:< [:field-id 1] 10] [:> [:field-id 1] 1]]
   2 [[:> [:field-id 2] 20] [:< [:field-id 2] 10]]
   3 [[:between [:field-id 3] 5 10]]}
  (#'binning/filter->field-map [:and
                                [:< [:field-id 1] 10]
                                [:> [:field-id 1] 1]
                                [:> [:field-id 2] 20]
                                [:< [:field-id 2] 10]
                                [:between [:field-id 3] 5 10]]))

(expect
  [[1.0 1.0 1.0]
   [1.0 2.0 2.0]
   [15.0 15.0 30.0]]
  [(mapv (partial #'binning/floor-to 1.0) [1 1.1 1.8])
   (mapv (partial #'binning/ceil-to 1.0) [1 1.1 1.8])
   (mapv (partial #'binning/ceil-to 15.0) [1.0 15.0 16.0])])

(expect
  [20 2000]
  [(#'binning/nicer-bin-width 27 135 8)
   (#'binning/nicer-bin-width -0.0002 10000.34 8)])

(def ^:private test-min-max-fingerprint
  {:type {:type/Number {:min 100 :max 1000}}})

(expect
  {:min-value 1, :max-value 10}
  (#'binning/extract-bounds 1
                            test-min-max-fingerprint
                            {1 [[:> [:field-id 1] 1] [:< [:field-id 1] 10]]}))

(expect
  {:min-value 1, :max-value 10}
  (#'binning/extract-bounds 1
                            test-min-max-fingerprint
                            {1 [[:between [:field-id 1] 1 10]]}))

(expect
  {:min-value 100, :max-value 1000}
  (#'binning/extract-bounds 1
                            test-min-max-fingerprint
                            {}))

(expect
  {:min-value 500, :max-value 1000}
  (#'binning/extract-bounds 1
                            test-min-max-fingerprint
                            {1 [[:> [:field-id 1] 500]]}))

(expect
  {:min-value 100, :max-value 500}
  (#'binning/extract-bounds 1
                            test-min-max-fingerprint
                            {1 [[:< [:field-id 1] 500]]}))

(expect
  {:min-value 600, :max-value 700}
  (#'binning/extract-bounds 1
                            test-min-max-fingerprint
                            {1 [[:> [:field-id 1] 200]
                                [:< [:field-id 1] 800]
                                [:between [:field-id 1] 600 700]]}))

(expect
  [{:min-value 0.0,  :max-value 1000.0, :num-bins 8,  :bin-width 125.0}
   {:min-value 200N, :max-value 1600N,  :num-bins 8,  :bin-width 200}
   {:min-value 0.0,  :max-value 1200.0, :num-bins 8,  :bin-width 200}
   {:min-value 0.0,  :max-value 1005.0, :num-bins 67, :bin-width 15.0}]
  (for [[strategy opts] [[:num-bins  {:min-value 100, :max-value 1000, :num-bins 8, :bin-width 0}]
                         [:num-bins  {:min-value 200, :max-value 1600, :num-bins 8, :bin-width 0}]
                         [:num-bins  {:min-value 9,   :max-value 1002, :num-bins 8, :bin-width 0}]
                         [:bin-width {:min-value 9,   :max-value 1002, :num-bins 1, :bin-width 15.0}]]]
    (#'binning/nicer-breakout strategy opts)))

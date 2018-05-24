(ns metabase.query-processor.middleware.binning-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor.middleware
             [binning :as binning :refer :all]
             [expand :as ql]]))

(expect
  {}
  (#'binning/filter->field-map (ql/and
                                (ql/= (ql/field-id 1) 10)
                                (ql/= (ql/field-id 2) 10))))

(expect
  {1 [(ql/< (ql/field-id 1) 10) (ql/> (ql/field-id 1) 1)]
   2 [(ql/> (ql/field-id 2) 20) (ql/< (ql/field-id 2) 10)]
   3 [(ql/between (ql/field-id 3) 5 10)]}
  (#'binning/filter->field-map (ql/and
                                (ql/< (ql/field-id 1) 10)
                                (ql/> (ql/field-id 1) 1)
                                (ql/> (ql/field-id 2) 20)
                                (ql/< (ql/field-id 2) 10)
                                (ql/between (ql/field-id 3) 5 10))))

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

(def ^:private test-min-max-field
  {:field-id 1 :fingerprint {:type {:type/Number {:min 100 :max 1000}}}})

(expect
  [1 10]
  (#'binning/extract-bounds test-min-max-field
                            {1 [(ql/> (ql/field-id 1) 1) (ql/< (ql/field-id 1) 10)]}))

(expect
  [1 10]
  (#'binning/extract-bounds test-min-max-field
                            {1 [(ql/between (ql/field-id 1) 1 10)]}))

(expect
  [100 1000]
  (#'binning/extract-bounds test-min-max-field
                            {}))

(expect
  [500 1000]
  (#'binning/extract-bounds test-min-max-field
                            {1 [(ql/> (ql/field-id 1) 500)]}))

(expect
  [100 500]
  (#'binning/extract-bounds test-min-max-field
                            {1 [(ql/< (ql/field-id 1) 500)]}))

(expect
  [600 700]
  (#'binning/extract-bounds test-min-max-field
                            {1 [(ql/> (ql/field-id 1) 200)
                                (ql/< (ql/field-id 1) 800)
                                (ql/between (ql/field-id 1) 600 700)]}))

(expect
  [[0.0 1000.0 125.0 8]
   [200N 1600N 200 8]
   [0.0 1200.0 200 8]
   [0.0 1005.0 15.0 67]]
  [((juxt :min-value :max-value :bin-width :num-bins)
         (nicer-breakout {:field-id 1 :min-value 100 :max-value 1000
                          :strategy :num-bins :num-bins 8}))
   ((juxt :min-value :max-value :bin-width :num-bins)
         (nicer-breakout {:field-id 1 :min-value 200 :max-value 1600
                          :strategy :num-bins :num-bins 8}))
   ((juxt :min-value :max-value :bin-width :num-bins)
         (nicer-breakout {:field-id 1 :min-value 9 :max-value 1002
                          :strategy :num-bins :num-bins 8}))
   ((juxt :min-value :max-value :bin-width :num-bins)
         (nicer-breakout {:field-id 1 :min-value 9 :max-value 1002
                          :strategy :bin-width :bin-width 15.0}))])

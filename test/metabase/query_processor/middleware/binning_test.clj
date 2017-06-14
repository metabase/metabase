(ns metabase.query-processor.middleware.binning-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor.middleware.binning :refer :all]
            [metabase.query-processor.expand :as ql]
            [metabase.test.util :as tu]))

(tu/resolve-private-vars metabase.query-processor.middleware.binning filter->field-map extract-bounds)

(expect
  {}
  (filter->field-map (ql/and
                      (ql/= (ql/field-id 1) 10)
                      (ql/= (ql/field-id 2) 10))))

(expect
  {1 [(ql/< (ql/field-id 1) 10) (ql/> (ql/field-id 1) 1)]
   2 [(ql/> (ql/field-id 2) 20) (ql/< (ql/field-id 2) 10)]
   3 [(ql/between (ql/field-id 3) 5 10)]}
  (filter->field-map (ql/and
                      (ql/< (ql/field-id 1) 10)
                      (ql/> (ql/field-id 1) 1)
                      (ql/> (ql/field-id 2) 20)
                      (ql/< (ql/field-id 2) 10)
                      (ql/between (ql/field-id 3) 5 10))))

(expect
  [1 10]
  (extract-bounds {:field-id 1 :min-value 100 :max-value 1000}
                  {1 [(ql/> (ql/field-id 1) 1) (ql/< (ql/field-id 1) 10)]}))

(expect
  [1 10]
  (extract-bounds {:field-id 1 :min-value 100 :max-value 1000}
                  {1 [(ql/between (ql/field-id 1) 1 10)]}))

(expect
  [100 1000]
  (extract-bounds {:field-id 1 :min-value 100 :max-value 1000}
                  {}))

(expect
  [500 1000]
  (extract-bounds {:field-id 1 :min-value 100 :max-value 1000}
                  {1 [(ql/> (ql/field-id 1) 500)]}))

(expect
  [100 500]
  (extract-bounds {:field-id 1 :min-value 100 :max-value 1000}
                  {1 [(ql/< (ql/field-id 1) 500)]}))

(expect
  [600 700]
  (extract-bounds {:field-id 1 :min-value 100 :max-value 1000}
                  {1 [(ql/> (ql/field-id 1) 200)
                      (ql/< (ql/field-id 1) 800)
                      (ql/between (ql/field-id 1) 600 700)]}))

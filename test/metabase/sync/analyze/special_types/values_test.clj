(ns metabase.sync.analyze.special-types.values-test
  (:require [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor-test :as qp-test]
            [metabase.sync.analyze.fingerprint :as fingerprint]
            [metabase.sync.analyze.fingerprint.sample :as sample]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]))

;; field-avg-length
;; This test won't work for Druid because it doesn't have a 'venues' Table. TODO - Add a test for Druid as well
(datasets/expect-with-engines qp-test/non-timeseries-engines
  16
  (let [field        (Field (data/id :venues :name))
        [[_ sample]] (sample/sample-fields (Table (data/id :venues)) [field])]
    (Math/round (get-in (#'fingerprint/fingerprint field sample)
                        [:type :type/Text :average-length]))))

(ns metabase.db.metadata-queries-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.db.metadata-queries :refer :all]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.query-processor-test :as qp-test]
            [metabase.test.data :refer :all]
            [metabase.test.data.datasets :as datasets]))



;; ### FIELD-DISTINCT-COUNT
; (datasets/expect-with-engines qp-test/non-timeseries-engines
;   100
;   (field-distinct-count (Field (id :checkins :venue_id))))

; (datasets/expect-with-engines qp-test/non-timeseries-engines
;   15
;   (field-distinct-count (Field (id :checkins :user_id))))


;; ### FIELD-COUNT
; (datasets/expect-with-engines qp-test/non-timeseries-engines
;   1000
;   (field-count (Field (id :checkins :venue_id))))


;; ### TABLE-ROW-COUNT
; (datasets/expect-with-engines qp-test/non-timeseries-engines
;   1000
;   (table-row-count (Table (id :checkins))))


;; ### FIELD-DISTINCT-VALUES
; (datasets/expect-with-engines qp-test/non-timeseries-engines
;   [1 2 3 4 5 6 7 8 9 10 11 12 13 14 15]
;   (field-distinct-values (Field (id :checkins :user_id))))

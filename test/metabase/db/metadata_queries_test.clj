(ns metabase.db.metadata-queries-test
  (:require [metabase.db.metadata-queries :refer :all]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor-test :as qp-test]
            [metabase.test.data :refer :all]
            [metabase.test.data.datasets :as datasets]))

;; Redshift & Crate tests are randomly failing -- see https://github.com/metabase/metabase/issues/2767
(def ^:private ^:const metadata-queries-test-engines
  (disj qp-test/non-timeseries-engines :redshift :crate))

;; ### FIELD-DISTINCT-COUNT
(datasets/expect-with-engines metadata-queries-test-engines
  100
  (field-distinct-count (Field (id :checkins :venue_id))))

(datasets/expect-with-engines metadata-queries-test-engines
  15
  (field-distinct-count (Field (id :checkins :user_id))))


;; ### FIELD-COUNT
(datasets/expect-with-engines metadata-queries-test-engines
  1000
  (field-count (Field (id :checkins :venue_id))))


;; ### TABLE-ROW-COUNT
(datasets/expect-with-engines metadata-queries-test-engines
  1000
  (table-row-count (Table (id :checkins))))


;; ### FIELD-DISTINCT-VALUES
(datasets/expect-with-engines metadata-queries-test-engines
  [1 2 3 4 5 6 7 8 9 10 11 12 13 14 15]
  (map int (field-distinct-values (Field (id :checkins :user_id)))))

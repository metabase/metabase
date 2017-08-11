(ns metabase.db.metadata-queries-test
  (:require [expectations :refer :all]
            [metabase.db.metadata-queries :refer :all]
            [metabase.models
             [card :refer [Card]]
             [database :refer [Database]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]] ]
            [metabase.query-processor-test :as qp-test]
            [metabase.test.data :refer :all]
            [metabase.test.data.datasets :as datasets]
            [toucan.util.test :as tt]))

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


;; ### DB-ID
(tt/expect-with-temp [Database [{database-id :id}]
                      Table [{table-id :id} {:db_id database-id}]
                      Metric [{metric-id :id} {:table_id table-id}]
                      Segment [{segment-id :id} {:table_id table-id}]
                      Field [{field-id :id} {:table_id table-id}]
                      Card [{card-id :id}
                            {:table_id table-id
                             :database_id database-id}]]
  [database-id database-id database-id database-id database-id]
  (mapv db-id [(Table table-id)
               (Metric metric-id)
               (Segment segment-id)
               (Card card-id)
               (Field field-id)]))

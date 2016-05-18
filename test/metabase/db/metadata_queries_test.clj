(ns metabase.db.metadata-queries-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.db.metadata-queries :refer :all]
            [metabase.models.field :refer [Field]]
            [metabase.test.data :refer :all]))

(defn- fetch-field [table-kw field-kw]
  (Field :id (id table-kw field-kw)))

;; ### FIELD-DISTINCT-COUNT
(expect 100
  (field-distinct-count (fetch-field :checkins :venue_id)))

(expect 15
  (field-distinct-count (fetch-field :checkins :user_id)))

;; ### FIELD-COUNT
(expect 1000
  (field-count (fetch-field :checkins :venue_id)))

;; ### FIELD-DISTINCT-VALUES
(expect [1 2 3 4 5 6 7 8 9 10 11 12 13 14 15]
  (field-distinct-values (fetch-field :checkins :user_id)))

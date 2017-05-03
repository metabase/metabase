(ns metabase.sync-database.analyze-test
  (:require [clojure.string :as str]
            [expectations :refer :all]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.models
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.sync-database.analyze :refer :all]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.users :refer :all]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; test:cardinality-and-extract-field-values
;; (#2332) check that if field values are long we skip over them
(expect
  {:values nil}
  (with-redefs-fn {#'metadata-queries/field-distinct-values (constantly [(str/join (repeat 50000 "A"))])}
    #(test:cardinality-and-extract-field-values {} {})))

(expect
  {:values       [1 2 3 4]
   :special-type :type/Category}
  (with-redefs-fn {#'metadata-queries/field-distinct-values (constantly [1 2 3 4])}
    #(test:cardinality-and-extract-field-values {} {})))


;;; ## mark-json-field!

(tu/resolve-private-vars metabase.sync-database.analyze
  values-are-valid-json? values-are-valid-emails?)

(def ^:const ^:private fake-values-seq-json
  "A sequence of values that should be marked is valid JSON.")

;; When all the values are valid JSON dicts they're valid JSON
(expect
  (values-are-valid-json? ["{\"this\":\"is\",\"valid\":\"json\"}"
                           "{\"this\":\"is\",\"valid\":\"json\"}"
                           "{\"this\":\"is\",\"valid\":\"json\"}"]))

;; When all the values are valid JSON arrays they're valid JSON
(expect
  (values-are-valid-json? ["[1, 2, 3, 4]"
                           "[1, 2, 3, 4]"
                           "[1, 2, 3, 4]"]))

;; Some combo of both can still be marked as JSON
(expect
  (values-are-valid-json? ["{\"this\":\"is\",\"valid\":\"json\"}"
                           "[1, 2, 3, 4]"
                           "[1, 2, 3, 4]"]))

;; If the values have some valid JSON dicts but is mostly null, it's still valid JSON
(expect
  (values-are-valid-json? ["{\"this\":\"is\",\"valid\":\"json\"}"
                           nil
                           nil]))

;; If every value is nil then the values should not be considered valid JSON
(expect false
  (values-are-valid-json? [nil nil nil]))

;; Check that things that aren't dictionaries or arrays aren't marked as JSON
(expect false (values-are-valid-json? ["\"A JSON string should not cause a Field to be marked as JSON\""]))
(expect false (values-are-valid-json? ["100"]))
(expect false (values-are-valid-json? ["true"]))
(expect false (values-are-valid-json? ["false"]))

;; Check that things that are valid emails are marked as Emails
(expect true (values-are-valid-emails? ["helper@metabase.com"]))
(expect true (values-are-valid-emails? ["helper@metabase.com", "someone@here.com", "help@nope.com"]))
(expect true (values-are-valid-emails? ["helper@metabase.com", nil, "help@nope.com"]))

(expect false (values-are-valid-emails? ["helper@metabase.com", "1111IsNot!An....email", "help@nope.com"]))
(expect false (values-are-valid-emails? ["\"A string should not cause a Field to be marked as email\""]))
(expect false (values-are-valid-emails? [100]))
(expect false (values-are-valid-emails? ["true"]))
(expect false (values-are-valid-emails? ["false"]))

;; Tests to avoid analyzing hidden tables
(defn- unanalyzed-fields-count [table]
  (assert (pos? ;; don't let ourselves be fooled if the test passes because the table is
           ;; totally broken or has no fields. Make sure we actually test something
           (db/count Field :table_id (u/get-id table))))
  (db/count Field :last_analyzed nil, :table_id (u/get-id table)))

(defn- latest-sync-time [table]
  (db/select-one-field :last_analyzed Field
    :last_analyzed [:not= nil]
    :table_id      (u/get-id table)
    {:order-by [[:last_analyzed :desc]]}))

(defn- set-table-visibility-type! [table visibility-type]
  ((user->client :crowberto) :put 200 (format "table/%d" (:id table)) {:display_name    "hiddentable"
                                                                       :entity_type     "person"
                                                                       :visibility_type visibility-type
                                                                       :description     "What a nice table!"}))

(defn- api-sync! [table]
  ((user->client :crowberto) :post 200 (format "database/%d/sync" (:db_id table))))

(defn- analyze! [table]
  (let [db-id (:db_id table)]
    (analyze-data-shape-for-tables! (driver/database-id->driver db-id) {:id db-id})))

;; expect all the kinds of hidden tables to stay un-analyzed through transitions and repeated syncing
(expect
  1
  (tt/with-temp* [Table [table {:rows 15}]
                  Field [field {:table_id (:id table)}]]
    (set-table-visibility-type! table "hidden")
    (api-sync! table)
    (set-table-visibility-type! table "cruft")
    (set-table-visibility-type! table "cruft")
    (api-sync! table)
    (set-table-visibility-type! table "technical")
    (api-sync! table)
    (set-table-visibility-type! table "technical")
    (api-sync! table)
    (api-sync! table)
    (unanalyzed-fields-count table)))

;; same test not coming through the api
(expect
  1
  (tt/with-temp* [Table [table {:rows 15}]
                  Field [field {:table_id (:id table)}]]
    (set-table-visibility-type! table "hidden")
    (analyze! table)
    (set-table-visibility-type! table "cruft")
    (set-table-visibility-type! table "cruft")
    (analyze! table)
    (set-table-visibility-type! table "technical")
    (analyze! table)
    (set-table-visibility-type! table "technical")
    (analyze! table)
    (analyze! table)
    (unanalyzed-fields-count table)))

;; un-hiding a table should cause it to be analyzed
(expect
  0
  (tt/with-temp* [Table [table {:rows 15}]
                  Field [field {:table_id (:id table)}]]
    (set-table-visibility-type! table "hidden")
    (set-table-visibility-type! table nil)
    (unanalyzed-fields-count table)))

;; re-hiding a table should not cause it to be analyzed
(expect
  ;; create an initially hidden table
  (tt/with-temp* [Table [table {:rows 15, :visibility_type "hidden"}]
                  Field [field {:table_id (:id table)}]]
    ;; switch the table to visible (triggering a sync) and get the last sync time
    (let [last-sync-time (do (set-table-visibility-type! table nil)
                             (latest-sync-time table))]
      ;; now make it hidden again
      (set-table-visibility-type! table "hidden")
      ;; sync time shouldn't change
      (= last-sync-time (latest-sync-time table)))))

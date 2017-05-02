(ns metabase.sync-database.analyze-test
  (:require [clojure.string :as str]
            [expectations :refer :all]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.models
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.sync-database.analyze :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]
            [toucan.db :as db]
            [toucan.util.test :as tt]
            [metabase.driver :as driver]
            [metabase.models.field :as field]))

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

(tu/resolve-private-vars metabase.sync-database.analyze values-are-valid-json?)
(tu/resolve-private-vars metabase.sync-database.analyze values-are-valid-emails?)

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
(defn count-unanalyzed-fields [db_id table-name]
  (let [table-id (db/select-one-id Table, :db_id db_id, :active true :name table-name)]
    (assert (pos? ;; don't let ourselves be fooled if the test passes because the table is
                  ;; totally broken or has no fields. Make sure we actually test something
             (db/count Field :table_id table-id)))
    (db/count Field :last_analyzed nil :table_id table-id)))

(defn get-latest-sync-time [db_id table-name]
  (let [table-id (db/select-one-id Table, :db_id db_id, :active true :name table-name)]
    (db/select-field :last_analyzed Field :table_id table-id)))


(defn api-table-call [state table]
  ((user->client :crowberto) :put 200 (format "table/%d" (:id table)) {:display_name    "hiddentable"
                                                                       :entity_type     "person"
                                                                       :visibility_type state

                                                                       :description     "What a nice table!"}))
(defn api-sync-call [table]
  ((user->client :crowberto) :post 200 (format "database/%d/sync" (:db_id table)) {}))

(defn sync-call [table]
  (let [db-id(:db_id table)]
    (analyze-data-shape-for-tables! (driver/database-id->driver db-id) {:id db-id})))

;; expect all the kinds of hidden tables to stay un-analyzed through transitions and repeated syncing
(tt/expect-with-temp [Table [table {:rows 15}]
                      Field [field {:table_id (:id table)}]]
  1
  (do (api-table-call "hidden" table)
      (api-sync-call table)
      (api-table-call "cruft" table)
      (api-table-call "cruft" table)
      (api-sync-call table)
      (api-table-call "technical" table)
      (api-sync-call table)
      (api-table-call "technical" table)
      (api-sync-call table)
      (api-sync-call table)
      (count-unanalyzed-fields (:db_id table) (:name table))))

;; same test not coming through the api
(tt/expect-with-temp [Table [table {:rows 15}]
                      Field [field {:table_id (:id table)}]]
  1
  (do (api-table-call "hidden" table)
      (sync-call table)
      (api-table-call "cruft" table)
      (api-table-call "cruft" table)
      (sync-call table)
      (api-table-call "technical" table)
      (sync-call table)
      (api-table-call "technical" table)
      (sync-call table)
      (sync-call table)
      (count-unanalyzed-fields (:db_id table) (:name table))))

;; un-hiding a table should cause it to be analyzed
(tt/expect-with-temp [Table [table {:rows 15}]
                      Field [field {:table_id (:id table)}]]
  0
  (do (api-table-call "hidden" table)
      (api-table-call nil table)
      (count-unanalyzed-fields (:db_id table) (:name table))))

;; re-hiding a table should not cause it to be analyzed
(tt/expect-with-temp [Table [table {:rows 15}]
                      Field [field {:table_id (:id table)}]]
  (do (api-table-call "hidden" table)
      (api-table-call nil table)
      (get-latest-sync-time (:db_id table) (:name table)))
  (do (api-table-call "hidden" table)
      (get-latest-sync-time (:db_id table) (:name table))))

(ns metabase.sync-database.analyze-test
  ;; TODO - this namespace follows the old pattern of sync namespaces. Tests should be moved to appropriate new homes
  ;; at some point
  (:require [clojure.string :as str]
            [expectations :refer :all]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field] :as field]
             [field-values :as field-values]
             [table :as table :refer [Table]]]
            [metabase.sync.analyze :as analyze]
            [metabase.sync.analyze.fingerprint.fingerprinters :as fingerprinters]
            [metabase.sync.analyze.classifiers.text-fingerprint :as classify-text-fingerprint]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.users :refer :all]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; distinct-values
;; (#2332) check that if field values are long we skip over them
;; TODO - the next two should probably be moved into field-values-test
(expect
  nil
  (with-redefs [metadata-queries/field-distinct-values (constantly [(str/join (repeat 50000 "A"))])]
    (#'field-values/distinct-values {})))

(expect
  [1 2 3 4]
  (with-redefs [metadata-queries/field-distinct-values (constantly [1 2 3 4])]
    (#'field-values/distinct-values {})))


;;; ## mark-json-field!

(defn- values-are-valid-json? [values]
  (let [field (field/map->FieldInstance {:base_type :type/Text})]
    (= (:special_type (classify-text-fingerprint/infer-special-type field (transduce identity (fingerprinters/fingerprinter field) values)))
       :type/SerializedJSON)))

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

;; Check that things that aren't dictionaries or arrays aren't marked as JSON
(expect false (values-are-valid-json? ["\"A JSON string should not cause a Field to be marked as JSON\""]))
(expect false (values-are-valid-json? ["100"]))
(expect false (values-are-valid-json? ["true"]))
(expect false (values-are-valid-json? ["false"]))

;; Check that things that are valid emails are marked as Emails

(defn- values-are-valid-emails? [values]
  (let [field (field/map->FieldInstance {:base_type :type/Text})]
    (= (:special_type (classify-text-fingerprint/infer-special-type field (transduce identity (fingerprinters/fingerprinter field) values)))
       :type/Email)))

(expect true (values-are-valid-emails? ["helper@metabase.com"]))
(expect true (values-are-valid-emails? ["helper@metabase.com", "someone@here.com", "help@nope.com"]))

(expect false (values-are-valid-emails? ["helper@metabase.com", "1111IsNot!An....email", "help@nope.com"]))
(expect false (values-are-valid-emails? ["\"A string should not cause a Field to be marked as email\""]))
(expect false (values-are-valid-emails? ["true"]))
(expect false (values-are-valid-emails? ["false"]))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Tests to avoid analyzing hidden tables                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- fake-field-was-analyzed? [field]
  ;; don't let ourselves be fooled if the test passes because the table is
  ;; totally broken or has no fields. Make sure we actually test something
  (assert (db/exists? Field :id (u/get-id field)))
  (db/exists? Field :id (u/get-id field), :last_analyzed [:not= nil]))

(defn- latest-sync-time [table]
  (db/select-one-field :last_analyzed Field
    :last_analyzed [:not= nil]
    :table_id      (u/get-id table)
    {:order-by [[:last_analyzed :desc]]}))

(defn- set-table-visibility-type-via-api!
  "Change the VISIBILITY-TYPE of TABLE via an API call.
   (This is done via the API so we can see which, if any, side effects (e.g. analysis) get triggered.)"
  [table visibility-type]
  ((user->client :crowberto) :put 200 (format "table/%d" (:id table)) {:display_name    "hiddentable"
                                                                       :visibility_type visibility-type
                                                                       :description     "What a nice table!"}))

(defn- api-sync!
  "Trigger a sync of TABLE via the API."
  [table]
  ((user->client :crowberto) :post 200 (format "database/%d/sync" (:db_id table))))

;; use these functions to create fake Tables & Fields that are actually backed by something real in the database.
;; Otherwise when we go to resync them the logic will figure out Table/Field doesn't exist and mark it as inactive
(defn- fake-table [& {:as additional-options}]
  (merge {:rows 15, :db_id (data/id), :name "VENUES"}
         additional-options))

(defn- fake-field [table & {:as additional-options}]
  (merge {:table_id (u/get-id table), :name "PRICE", :base_type "type/Integer"}
         additional-options))

;; expect all the kinds of hidden tables to stay un-analyzed through transitions and repeated syncing
(expect
  false
  (tt/with-temp* [Table [table (fake-table)]
                  Field [field (fake-field table)]]
    (set-table-visibility-type-via-api! table "hidden")
    (api-sync! table)
    (set-table-visibility-type-via-api! table "cruft")
    (set-table-visibility-type-via-api! table "cruft")
    (api-sync! table)
    (set-table-visibility-type-via-api! table "technical")
    (api-sync! table)
    (set-table-visibility-type-via-api! table "technical")
    (api-sync! table)
    (api-sync! table)
    (fake-field-was-analyzed? field)))

;; same test not coming through the api
(defn- analyze-table! [table]
  ;; we're calling `analyze-db!` instead of `analyze-table!` because the latter doesn't care if you try to sync a
  ;; hidden table and will allow that. TODO - Does that behavior make sense?
  (analyze/analyze-db! (Database (:db_id table))))

(expect
  false
  (tt/with-temp* [Table [table (fake-table)]
                  Field [field (fake-field table)]]
    (set-table-visibility-type-via-api! table "hidden")
    (analyze-table! table)
    (set-table-visibility-type-via-api! table "cruft")
    (set-table-visibility-type-via-api! table "cruft")
    (analyze-table! table)
    (set-table-visibility-type-via-api! table "technical")
    (analyze-table! table)
    (set-table-visibility-type-via-api! table "technical")
    (analyze-table! table)
    (analyze-table! table)
    (fake-field-was-analyzed? field)))

;; un-hiding a table should cause it to be analyzed
(expect
  (tt/with-temp* [Table [table (fake-table)]
                  Field [field (fake-field table)]]
    (set-table-visibility-type-via-api! table "hidden")
    (set-table-visibility-type-via-api! table nil)
    (fake-field-was-analyzed? field)))

;; re-hiding a table should not cause it to be analyzed
(expect
  ;; create an initially hidden table
  (tt/with-temp* [Table [table (fake-table :visibility_type "hidden")]
                  Field [field (fake-field table)]]
    ;; switch the table to visible (triggering a sync) and get the last sync time
    (let [last-sync-time (do (set-table-visibility-type-via-api! table nil)
                             (latest-sync-time table))]
      ;; now make it hidden again
      (set-table-visibility-type-via-api! table "hidden")
      ;; sync time shouldn't change
      (= last-sync-time (latest-sync-time table)))))

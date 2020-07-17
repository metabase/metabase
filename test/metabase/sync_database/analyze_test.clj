(ns metabase.sync-database.analyze-test
  "TODO - this namespace follows the old pattern of sync namespaces. Tests should be moved to appropriate new homes at
  some point"
  (:require [clojure.test :refer :all]
            [metabase
             [test :as mt]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [field :as field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.sync.analyze :as analyze]
            [metabase.sync.analyze.classifiers.text-fingerprint :as classify-text-fingerprint]
            [metabase.sync.analyze.fingerprint.fingerprinters :as fingerprinters]
            [metabase.test.data.users :refer :all]
            [toucan.db :as db]))

(defn- classified-special-type [values]
  (let [field (field/map->FieldInstance {:base_type :type/Text})]
    (:special_type (classify-text-fingerprint/infer-special-type
                    field
                    (transduce identity (fingerprinters/fingerprinter field) values)))))

(deftest classify-json-test
  (doseq [[group values->expected] {"When all the values are valid JSON dicts they're valid JSON"
                                    {["{\"this\":\"is\",\"valid\":\"json\"}"
                                      "{\"this\":\"is\",\"valid\":\"json\"}"
                                      "{\"this\":\"is\",\"valid\":\"json\"}"] true}

                                    "When all the values are valid JSON arrays they're valid JSON"
                                    {["[1, 2, 3, 4]"
                                      "[1, 2, 3, 4]"
                                      "[1, 2, 3, 4]"] true}

                                    "Some combo of both can still be marked as JSON"
                                    {["{\"this\":\"is\",\"valid\":\"json\"}"
                                      "[1, 2, 3, 4]"
                                      "[1, 2, 3, 4]"] true}

                                    "Check that things that aren't dictionaries or arrays aren't marked as JSON"
                                    {["\"A JSON string should not cause a Field to be marked as JSON\""] false
                                     ["100"]                                                             false
                                     ["true"]                                                            false
                                     ["false"]                                                           false}}
          [values expected] values->expected]
    (testing (str group "\n")
      (testing (pr-str values)
        (is (= (when expected :type/SerializedJSON)
               (classified-special-type values)))))))

(deftest classify-emails-test
  (testing "Check that things that are valid emails are marked as Emails"
    (doseq [[values expected] {["helper@metabase.com"]                                           true
                               ["helper@metabase.com", "someone@here.com", "help@nope.com"]      true
                               ["helper@metabase.com", "1111IsNot!An....email", "help@nope.com"] false
                               ["\"A string should not cause a Field to be marked as email\""]   false
                               ["true"]                                                          false
                               ["false"]                                                         false}]
      (testing (pr-str values)
        (is (= (when expected :type/Email)
               (classified-special-type values)))))))


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
  "Change the `visibility-type` of `table` via an API call. (This is done via the API so we can see which, if any, side
  effects (e.g. analysis) get triggered.)"
  [table visibility-type]
  ((mt/user->client :crowberto) :put 200 (format "table/%d" (:id table)) {:display_name    "hiddentable"
                                                                          :visibility_type visibility-type
                                                                          :description     "What a nice table!"}))

(defn- api-sync!
  "Trigger a sync of `table` via the API."
  [table]
  ((mt/user->client :crowberto) :post 200 (format "database/%d/sync" (:db_id table))))

;; use these functions to create fake Tables & Fields that are actually backed by something real in the database.
;; Otherwise when we go to resync them the logic will figure out Table/Field doesn't exist and mark it as inactive
(defn- fake-table [& {:as additional-options}]
  (merge {:db_id (mt/id), :name "VENUES"}
         additional-options))

(defn- fake-field [table & {:as additional-options}]
  (merge {:table_id (u/get-id table), :name "PRICE", :base_type "type/Integer"}
         additional-options))

(defn- analyze-table! [table]
  ;; we're calling `analyze-db!` instead of `analyze-table!` because the latter doesn't care if you try to sync a
  ;; hidden table and will allow that. TODO - Does that behavior make sense?
  (analyze/analyze-db! (Database (:db_id table))))

(deftest dont-analyze-hidden-tables-test
  (testing "expect all the kinds of hidden tables to stay un-analyzed through transitions and repeated syncing"
    (letfn [(tests [sync!*]
              (mt/with-temp* [Table [table (assoc (fake-table) :visibility_type "hidden")]
                              Field [field (fake-field table)]]
                (letfn [(set-visibility! [visibility]
                          (set-table-visibility-type-via-api! table visibility)
                          (testing "after updating visibility type"
                            (is (= false
                                   (fake-field-was-analyzed? field)))))
                        (sync! []
                          (sync!* table)
                          (testing "after sync"
                            (is (= false
                                   (fake-field-was-analyzed? field)))))]
                  (testing "visibility -> hidden"
                    (set-visibility! "hidden")
                    (sync!))
                  (testing "visibility -> cruft"
                    (set-visibility! "cruft")
                    (set-visibility! "cruft")
                    (sync!))
                  (testing "visibility -> technical"
                    (set-visibility! "technical")
                    (sync!))
                  (testing "visibility -> technical (again)"
                    (set-visibility! "technical")
                    (sync!)
                    (sync!)))))]
      (tests api-sync!)
      (testing "\nsame test but with sync triggered programatically rather than via the API"
        (tests analyze-table!)))))

(deftest analyze-unhidden-tables-test
  (testing "un-hiding a table should cause it to be analyzed"
    (mt/with-temp* [Table [table (fake-table)]
                    Field [field (fake-field table)]]
      (set-table-visibility-type-via-api! table "hidden")
      (set-table-visibility-type-via-api! table nil)
      (is (= true
             (fake-field-was-analyzed? field))))))

(deftest dont-analyze-rehidden-table-test
  (testing "re-hiding a table should not cause it to be analyzed"
    ;; create an initially hidden table
    (mt/with-temp* [Table [table (fake-table :visibility_type "hidden")]
                    Field [field (fake-field table)]]
      ;; switch the table to visible (triggering a sync) and get the last sync time
      (let [last-sync-time (do (set-table-visibility-type-via-api! table nil)
                               (latest-sync-time table))]
        ;; now make it hidden again
        (set-table-visibility-type-via-api! table "hidden")
        (is (= last-sync-time
               (latest-sync-time table))
            "sync time shouldn't change")))))

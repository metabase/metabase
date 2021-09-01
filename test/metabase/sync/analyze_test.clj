(ns metabase.sync.analyze-test
  (:require [clojure.test :refer :all]
            [metabase.api.table :as table-api]
            [metabase.models.database :refer [Database]]
            [metabase.models.field :as field :refer [Field]]
            [metabase.models.table :refer [Table]]
            [metabase.sync.analyze :as analyze]
            [metabase.sync.analyze.classifiers.category :as classifiers.category]
            [metabase.sync.analyze.classifiers.name :as classifiers.name]
            [metabase.sync.analyze.classifiers.no-preview-display :as classifiers.no-preview-display]
            [metabase.sync.analyze.classifiers.text-fingerprint :as classify-text-fingerprint]
            [metabase.sync.analyze.fingerprint.fingerprinters :as fingerprinters]
            [metabase.sync.interface :as i]
            [metabase.sync.sync-metadata :as sync-metadata]
            [metabase.test :as mt]
            [metabase.test.data :as data]
            [metabase.test.sync :as test.sync :refer [sync-survives-crash?]]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(deftest skip-analysis-of-fields-with-current-fingerprint-version-test
  (testing "Check that Fields do *not* get analyzed if they're not newly created and fingerprint version is current"
    (data/with-temp-copy-of-db
      ;; mark all the Fields as analyzed with so they won't be subject to analysis
      (db/update-where! Field {:table_id (data/id :venues)}
        :last_analyzed       #t "2017-08-01T00:00"
        :semantic_type       nil
        :fingerprint_version Short/MAX_VALUE)
      ;; the type of the value that comes back may differ a bit between different application DBs
      (let [analysis-date (db/select-one-field :last_analyzed Field :table_id (data/id :venues))]
        ;; ok, NOW run the analysis process
        (analyze/analyze-table! (Table (data/id :venues)))
        ;; check and make sure all the Fields don't have semantic types and their last_analyzed date didn't change
        ;; PK is ok because it gets marked as part of metadata sync
        (is (= (zipmap ["CATEGORY_ID" "ID" "LATITUDE" "LONGITUDE" "NAME" "PRICE"]
                       (repeat {:semantic_type nil, :last_analyzed analysis-date}))
               (into {} (for [field (db/select [Field :name :semantic_type :last_analyzed] :table_id (data/id :venues))]
                          [(:name field) (into {} (dissoc field :name))]))))))))

;; ...but they *SHOULD* get analyzed if they ARE newly created (expcept for PK which we skip)
(deftest analyze-table-test
  (tt/with-temp* [Database [db    {:engine "h2", :details (:details (data/db))}]
                  Table    [table {:name "VENUES", :db_id (u/the-id db)}]]
    ;; sync the metadata, but DON't do analysis YET
    (sync-metadata/sync-table-metadata! table)
    ;; ok, NOW run the analysis process
    (analyze/analyze-table! table)
    ;; fields *SHOULD* have semantic types now
    (is (= #{{:name "LATITUDE", :semantic_type :type/Latitude, :last_analyzed true}
             {:name "ID", :semantic_type :type/PK, :last_analyzed false}
             {:name "PRICE", :semantic_type :type/Category, :last_analyzed true}
             {:name "LONGITUDE", :semantic_type :type/Longitude, :last_analyzed true}
             {:name "CATEGORY_ID", :semantic_type :type/Category, :last_analyzed true}
             {:name "NAME", :semantic_type :type/Name, :last_analyzed true}}
           (set (for [field (db/select [Field :name :semantic_type :last_analyzed] :table_id (u/the-id table))]
                  (into {} (update field :last_analyzed boolean))))))))

(deftest mark-fields-as-analyzed-test
  (testing "Make sure that only the correct Fields get marked as recently analyzed"
    (with-redefs [i/latest-fingerprint-version Short/MAX_VALUE]
      (tt/with-temp* [Table [table]
                      Field [_ {:table_id            (u/the-id table)
                                :name                "Current fingerprint, not analyzed"
                                :fingerprint_version Short/MAX_VALUE
                                :last_analyzed       nil}]
                      Field [_ {:table_id            (u/the-id table)
                                :name                "Current fingerprint, already analzed"
                                :fingerprint_version Short/MAX_VALUE
                                :last_analyzed       #t "2017-08-09T00:00Z"}]
                      Field [_ {:table_id            (u/the-id table)
                                :name                "Old fingerprint, not analyzed"
                                :fingerprint_version (dec Short/MAX_VALUE)
                                :last_analyzed       nil}]
                      Field [_ {:table_id            (u/the-id table)
                                :name                "Old fingerprint, already analzed"
                                :fingerprint_version (dec Short/MAX_VALUE)
                                :last_analyzed       #t "2017-08-09T00:00Z"}]]
        (#'analyze/update-fields-last-analyzed! table)
        (is (= #{"Current fingerprint, not analyzed"}
               (db/select-field :name Field :table_id (u/the-id table), :last_analyzed [:> #t "2018-01-01"])))))))

(deftest survive-fingerprinting-errors
  (testing "Make sure we survive fingerprinting failing"
    (sync-survives-crash? fingerprinters/fingerprinter)))

(deftest survive-classify-fields-errors
  (testing "Make sure we survive field classification failing"
    (sync-survives-crash? classifiers.name/semantic-type-for-name-and-base-type)
    (sync-survives-crash? classifiers.category/infer-is-category-or-list)
    (sync-survives-crash? classifiers.no-preview-display/infer-no-preview-display)
    (sync-survives-crash? classify-text-fingerprint/infer-semantic-type)))

(deftest survive-classify-table-errors
  (testing "Make sure we survive table classification failing"
    (sync-survives-crash? classifiers.name/infer-entity-type)))

(defn- classified-semantic-type [values]
  (let [field (field/map->FieldInstance {:base_type :type/Text})]
    (:semantic_type (classify-text-fingerprint/infer-semantic-type
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
               (classified-semantic-type values)))))))

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
               (classified-semantic-type values)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Tests to avoid analyzing hidden tables                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- fake-field-was-analyzed? [field]
  ;; don't let ourselves be fooled if the test passes because the table is
  ;; totally broken or has no fields. Make sure we actually test something
  (assert (db/exists? Field :id (u/the-id field)))
  (db/exists? Field :id (u/the-id field), :last_analyzed [:not= nil]))

(defn- latest-sync-time [table]
  (db/select-one-field :last_analyzed Field
    :last_analyzed [:not= nil]
    :table_id      (u/the-id table)
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
  (merge {:table_id (u/the-id table), :name "PRICE", :base_type "type/Integer"}
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

(deftest analyze-db!-return-value-test
  (testing "Returns values"
    (mt/with-temp* [Table [table (fake-table)]
                    Field [field (fake-field table)]]
      (let [results (analyze-table! table)]
        (testing "has the steps performed"
          (is (= ["fingerprint-fields" "classify-fields" "classify-tables"]
                 (->> results :steps (map first)))))
        (testing "has start and finish times"
          (is (seq (select-keys results [:start-time :end-time]))))))))

(deftest analyze-unhidden-tables-test
  (testing "un-hiding a table should cause it to be analyzed"
    (let [original-submit (var-get #'table-api/submit-task)
          finished?       (promise)]
      (with-redefs [table-api/submit-task (fn [task]
                                            @(original-submit task)
                                            (deliver finished? true))]
        (mt/with-temp* [Table [table (fake-table)]
                        Field [field (fake-field table)]]
          (set-table-visibility-type-via-api! table "hidden")
          (set-table-visibility-type-via-api! table nil)
          (deref finished? 1000 ::timeout)
          (is (= true
                 (fake-field-was-analyzed? field))))))))

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

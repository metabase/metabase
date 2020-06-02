(ns metabase.sync.analyze-test
  (:require [clojure.test :refer :all]
            [expectations :refer [expect]]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync
             [analyze :as analyze]
             [interface :as i]
             [sync-metadata :as sync-metadata]]
            [metabase.sync.analyze.classifiers
             [category :as classifiers.category]
             [name :as classifiers.name]
             [no-preview-display :as classifiers.no-preview-display]
             [text-fingerprint :as classifiers.text-fingerprint]]
            [metabase.sync.analyze.fingerprint.fingerprinters :as fingerprinters]
            [metabase.test
             [data :as data]
             [sync :as test.sync :refer [sync-survives-crash?]]]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(deftest skip-analysis-of-fields-with-current-fingerprint-version-test
  (testing "Check that Fields do *not* get analyzed if they're not newly created and fingerprint version is current"
    (data/with-temp-copy-of-db
      ;; mark all the Fields as analyzed with so they won't be subject to analysis
      (db/update-where! Field {:table_id (data/id :venues)}
        :last_analyzed       #t "2017-08-01T00:00"
        :special_type        nil
        :fingerprint_version Short/MAX_VALUE)
      ;; the type of the value that comes back may differ a bit between different application DBs
      (let [analysis-date (db/select-one-field :last_analyzed Field :table_id (data/id :venues))]
        ;; ok, NOW run the analysis process
        (analyze/analyze-table! (Table (data/id :venues)))
        ;; check and make sure all the Fields don't have special types and their last_analyzed date didn't change
        ;; PK is ok because it gets marked as part of metadata sync
        (is (= (zipmap ["CATEGORY_ID" "ID" "LATITUDE" "LONGITUDE" "NAME" "PRICE"]
                       (repeat {:special_type nil, :last_analyzed analysis-date}))
               (into {} (for [field (db/select [Field :name :special_type :last_analyzed] :table_id (data/id :venues))]
                          [(:name field) (into {} (dissoc field :name))]))))))))

;; ...but they *SHOULD* get analyzed if they ARE newly created (expcept for PK which we skip)
(expect
  #{{:name "LATITUDE",    :special_type :type/Latitude,  :last_analyzed true}
    {:name "ID",          :special_type :type/PK,        :last_analyzed false}
    {:name "PRICE",       :special_type :type/Category,  :last_analyzed true}
    {:name "LONGITUDE",   :special_type :type/Longitude, :last_analyzed true}
    {:name "CATEGORY_ID", :special_type :type/Category,  :last_analyzed true}
    {:name "NAME",        :special_type :type/Name,      :last_analyzed true}}
  (tt/with-temp* [Database [db    {:engine "h2", :details (:details (data/db))}]
                  Table    [table {:name "VENUES", :db_id (u/get-id db)}]]
    ;; sync the metadata, but DON't do analysis YET
    (sync-metadata/sync-table-metadata! table)
    ;; ok, NOW run the analysis process
    (analyze/analyze-table! table)
    ;; fields *SHOULD* have special types now
    (set (for [field (db/select [Field :name :special_type :last_analyzed] :table_id (u/get-id table))]
           (into {} (update field :last_analyzed boolean))))))

(deftest mark-fields-as-analyzed-test
  (testing "Make sure that only the correct Fields get marked as recently analyzed"
    (with-redefs [i/latest-fingerprint-version Short/MAX_VALUE]
      (tt/with-temp* [Table [table]
                      Field [_ {:table_id            (u/get-id table)
                                :name                "Current fingerprint, not analyzed"
                                :fingerprint_version Short/MAX_VALUE
                                :last_analyzed       nil}]
                      Field [_ {:table_id            (u/get-id table)
                                :name                "Current fingerprint, already analzed"
                                :fingerprint_version Short/MAX_VALUE
                                :last_analyzed       #t "2017-08-09T00:00Z"}]
                      Field [_ {:table_id            (u/get-id table)
                                :name                "Old fingerprint, not analyzed"
                                :fingerprint_version (dec Short/MAX_VALUE)
                                :last_analyzed       nil}]
                      Field [_ {:table_id            (u/get-id table)
                                :name                "Old fingerprint, already analzed"
                                :fingerprint_version (dec Short/MAX_VALUE)
                                :last_analyzed       #t "2017-08-09T00:00Z"}]]
        (#'analyze/update-fields-last-analyzed! table)
        (is (= #{"Current fingerprint, not analyzed"}
               (db/select-field :name Field :table_id (u/get-id table), :last_analyzed [:> #t "2018-01-01"])))))))

(deftest survive-fingerprinting-errors
  (testing "Make sure we survive fingerprinting failing"
    (sync-survives-crash? fingerprinters/fingerprinter)))

(deftest survive-classify-fields-errors
  (testing "Make sure we survive field classification failing"
    (sync-survives-crash? classifiers.name/special-type-for-name-and-base-type)
    (sync-survives-crash? classifiers.category/infer-is-category-or-list)
    (sync-survives-crash? classifiers.no-preview-display/infer-no-preview-display)
    (sync-survives-crash? classifiers.text-fingerprint/infer-special-type)))

(deftest survive-classify-table-errors
  (testing "Make sure we survive table classification failing"
    (sync-survives-crash? classifiers.name/infer-entity-type)))

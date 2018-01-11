(ns metabase.sync.analyze-test
  (:require [expectations :refer :all]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync
             [analyze :as analyze]
             [interface :as i]
             [sync-metadata :as sync-metadata]]
            [metabase.test.data :as data]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(def ^:private fake-analysis-completion-date
  (u/->Timestamp "2017-08-01"))


;; Check that Fields get analyzed if they ARE newly created
(expect
  #{{:name "LATITUDE",    :special_type :type/Latitude,  :last_analyzed true}
    {:name "ID",          :special_type :type/PK,        :last_analyzed true}
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

;; Make sure that only the correct Fields get marked as recently analyzed
(expect
  #{"Current fingerprint, not analyzed"}
  (with-redefs [i/latest-fingerprint-version Short/MAX_VALUE
                u/new-sql-timestamp          (constantly (u/->Timestamp "1999-01-01"))]
    (tt/with-temp* [Table [table]
                    Field [_ {:table_id            (u/get-id table)
                              :name                "Current fingerprint, not analyzed"
                              :fingerprint_version Short/MAX_VALUE
                              :last_analyzed       nil}]
                    Field [_ {:table_id            (u/get-id table)
                              :name                "Current fingerprint, already analzed"
                              :fingerprint_version Short/MAX_VALUE
                              :last_analyzed       (u/->Timestamp "2017-08-09")}]
                    Field [_ {:table_id            (u/get-id table)
                              :name                "Old fingerprint, not analyzed"
                              :fingerprint_version (dec Short/MAX_VALUE)
                              :last_analyzed       nil}]
                    Field [_ {:table_id            (u/get-id table)
                              :name                "Old fingerprint, already analzed"
                              :fingerprint_version (dec Short/MAX_VALUE)
                              :last_analyzed       (u/->Timestamp "2017-08-09")}]]
      (#'analyze/update-fields-last-analyzed! table)
      (db/select-field :name Field :last_analyzed (u/new-sql-timestamp)))))

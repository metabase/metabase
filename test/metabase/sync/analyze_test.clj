(ns metabase.sync.analyze-test
  (:require [expectations :refer :all]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync
             [analyze :as analyze]
             [sync-metadata :as sync-metadata]]
            [metabase.test.data :as data]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(def ^:private fake-analysis-completion-date
  (u/->Timestamp "2017-08-01"))

;; Check that Fields do *not* get analyzed if they're not newly created
(expect
  #{{:name "LONGITUDE",   :special_type nil,      :last_analyzed fake-analysis-completion-date}
    {:name "CATEGORY_ID", :special_type nil,      :last_analyzed fake-analysis-completion-date}
    {:name "PRICE",       :special_type nil,      :last_analyzed fake-analysis-completion-date}
    {:name "LATITUDE",    :special_type nil,      :last_analyzed fake-analysis-completion-date}
    {:name "NAME",        :special_type nil,      :last_analyzed fake-analysis-completion-date}
    {:name "ID",          :special_type :type/PK, :last_analyzed fake-analysis-completion-date}} ; PK is ok because it gets marked as part of metadata sync
  (tt/with-temp* [Database [db    {:engine "h2", :details (:details (data/db))}]
                  Table    [table {:name "VENUES", :db_id (u/get-id db)}]]
    ;; sync the metadata, but DON't do analysis YET
    (sync-metadata/sync-table-metadata! table)
    ;; now mark all the Tables as analyzed so they won't be subject to analysis
    (db/update-where! Field {:table_id (u/get-id table)}
      :last_analyzed fake-analysis-completion-date)
    ;; ok, NOW run the analysis process
    (analyze/analyze-table! table)
    ;; check and make sure all the Fields don't have special types and their last_analyzed date didn't change
    (set (for [field (db/select [Field :name :special_type :last_analyzed] :table_id (u/get-id table))]
           (into {} field)))))

;; ...but they *SHOULD* get analyzed if they ARE newly created
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

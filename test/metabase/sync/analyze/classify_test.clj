(ns metabase.sync.analyze.classify-test
  (:require [expectations :refer :all]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync.analyze.classify :as classify]
            [metabase.sync.interface :as i]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

;; Check that only the right Fields get classified
(expect
  ["Current fingerprint, not analyzed"]
  ;; For max version pick something we'll hopefully never hit. Don't think we'll ever have 32k different versions :D
  (with-redefs [i/latest-fingerprint-version Short/MAX_VALUE]
    (tt/with-temp* [Table [table]
                    Field [_ {:table_id            (u/get-id table)
                              :name                "Current fingerprint, not analyzed"
                              :fingerprint_version Short/MAX_VALUE
                              :last_analyzed       nil}]
                    Field [_ {:table_id            (u/get-id table)
                              :name                "Current fingerprint, already analzed"
                              :fingerprint_version Short/MAX_VALUE
                              :last_analyzed       #t "2017-08-09"}]
                    Field [_ {:table_id            (u/get-id table)
                              :name                "Old fingerprint, not analyzed"
                              :fingerprint_version (dec Short/MAX_VALUE)
                              :last_analyzed       nil}]
                    Field [_ {:table_id            (u/get-id table)
                              :name                "Old fingerprint, already analzed"
                              :fingerprint_version (dec Short/MAX_VALUE)
                              :last_analyzed       #t "2017-08-09"}]]
      (for [field (#'classify/fields-to-classify table)]
        (:name field)))))

;; Check that we can classify decimal fields that have specially handled NaN values
(expect
  [nil :type/Income]
  (tt/with-temp* [Database [db]
                  Table    [table {:db_id (u/get-id db)}]
                  Field    [field {:table_id            (u/get-id table)
                                   :name                "Income"
                                   :base_type           :type/Float
                                   :special_type        nil
                                   :fingerprint_version i/latest-fingerprint-version
                                   :fingerprint         {:type   {:type/Number {:min "NaN"
                                                                                :max "NaN"
                                                                                :avg "NaN"}}
                                                         :global {:distinct-count 3}}
                                   :last_analyzed       nil}]]
    [(:special_type (Field (u/get-id field)))
     (do
       (classify/classify-fields-for-db! db [table] (constantly nil))
       (:special_type (Field (u/get-id field))))]))

;; Check that we can classify decimal fields that have specially handled infinity values
(expect
  [nil :type/Income]
  (tt/with-temp* [Database [db]
                  Table    [table {:db_id (u/get-id db)}]
                  Field    [field {:table_id            (u/get-id table)
                                   :name                "Income"
                                   :base_type           :type/Float
                                   :special_type        nil
                                   :fingerprint_version i/latest-fingerprint-version
                                   :fingerprint         {:type   {:type/Number {:min "-Infinity"
                                                                                :max "Infinity"
                                                                                :avg "Infinity"}}
                                                         :global {:distinct-count 3}}
                                   :last_analyzed       nil}]]
    [(:special_type (Field (u/get-id field)))
     (do
       (classify/classify-fields-for-db! db [table] (constantly nil))
       (:special_type (Field (u/get-id field))))]))

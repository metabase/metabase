(ns metabase.sync.analyze.classify-test
  (:require [expectations :refer :all]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync.analyze.classify :as classify]
            [metabase.sync.interface :as i]
            [metabase.util :as u]
            [metabase.util.date :as du]
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
                              :last_analyzed       (du/->Timestamp #inst "2017-08-09")}]
                    Field [_ {:table_id            (u/get-id table)
                              :name                "Old fingerprint, not analyzed"
                              :fingerprint_version (dec Short/MAX_VALUE)
                              :last_analyzed       nil}]
                    Field [_ {:table_id            (u/get-id table)
                              :name                "Old fingerprint, already analzed"
                              :fingerprint_version (dec Short/MAX_VALUE)
                              :last_analyzed       (du/->Timestamp #inst "2017-08-09")}]]
      (for [field (#'classify/fields-to-classify table)]
        (:name field)))))

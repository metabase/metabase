(ns metabase.models.serialization-test
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [clojure.tools.logging :as log]
   [metabase-enterprise.serialization.cmd :as serialization.cmd]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest with-temp-file-updated-test
  (is (= {:before "plain"
          :during "originally: 'plain' + extra stuff."
          :after "plain"}
         (let [*history (atom {})]
           (mt/with-temp-file [filename]
             (spit filename "plain")
             (swap! *history assoc :before (slurp filename))
             (with-file-updated [filename #(str "originally: '" % "' + extra stuff.")]
               (swap! *history assoc :during (slurp filename)))
             (swap! *history assoc :after (slurp filename)))
           @*history))))


(deftest fields-for-table-test
  (testing "fields for table returns table_name -> table_type for all columns"
    (is (= {"id"                          "int4"
            "created_at"                  "timestamptz"
            "updated_at"                  "timestamptz"
            "name"                        "varchar"
            "description"                 "text"
            "details"                     "text"
            "engine"                      "varchar"
            "is_sample"                   "bool"
            "is_full_sync"                "bool"
            "points_of_interest"          "text"
            "caveats"                     "text"
            "metadata_sync_schedule"      "varchar"
            "cache_field_values_schedule" "varchar"
            "timezone"                    "varchar"
            "is_on_demand"                "bool"
            "auto_run_queries"            "bool"
            "refingerprint"               "bool"
            "cache_ttl"                   "int4"
            "initial_sync_status"         "varchar"
            "creator_id"                  "int4"
            "settings"                    "text"
            "dbms_version"                "text"
            "is_audit"                    "bool"}
           (serdes/fields-for-table "metabase_database")))))

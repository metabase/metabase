(ns metabase.mcp.v2.recovery-hints-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.mcp.v2.message :as message]
   [metabase.mcp.v2.recovery-hints :as recovery-hints]))

(set! *warn-on-reflection* true)

(deftest ^:parallel ambiguous-field-hint-test
  (is (= (str "Call \"browse_data\" with action \"get_fields\" for "
              "the table to list its columns with their numeric ids.")
         (some-> (recovery-hints/recovery-hint {:error :ambiguous-field}) message/render))))

(deftest ^:parallel cross-database-hint-test
  (doseq [error [:cross-database-card :cross-database-measure :cross-database-segment :cross-database-table]]
    (testing error
      (is (= (str "Don't combine data from two databases in Metabase (two different `database_id`s) in one query, "
                  "in a structured query or in SQL. Tell the user that you can't combine data from these two "
                  "databases in one query, and say what you can do instead.")
             (some-> (recovery-hints/recovery-hint {:error error}) message/render))))))

(deftest ^:parallel ambiguous-database-name-hint-test
  (is (= (str "Use a numeric table id in `source-table:` (from \"browse_data\" "
              "action \"list_tables\"), which needs no database name at all.")
         (some-> (recovery-hints/recovery-hint {:error :ambiguous-database-name}) message/render))))

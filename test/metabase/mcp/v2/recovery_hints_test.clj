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
  (doseq [error [:cross-database-card :cross-database-measure :cross-database-segment]]
    (testing error
      (is (= (str "A query can only reference saved questions, models, metrics, measures and segments "
                  "from its own database. Use one from that database, or change the source to a table "
                  "in the referenced item's database.")
             (some-> (recovery-hints/recovery-hint {:error error}) message/render))))))

(ns metabase.metabot.tools.recovery-hints-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.tools.recovery-hints :as recovery-hints]))

(set! *warn-on-reflection* true)

(deftest ^:parallel ambiguous-field-hint-test
  (is (= (str "The field name matches more than one column in this table, so it cannot be referenced by name. "
              "Tell the user about the ambiguous column name.")
         (recovery-hints/recovery-hint {:error :ambiguous-field}))))

(deftest ^:parallel cross-database-hint-test
  (doseq [error [:cross-database-card :cross-database-measure :cross-database-segment]]
    (testing error
      (is (= (str "A query can only reference saved questions, models, metrics, measures and segments "
                  "from its own database. Use one from that database, or change the source to a table "
                  "in the referenced item's database.")
             (recovery-hints/recovery-hint {:error error}))))))

(deftest ^:parallel ambiguous-database-name-hint-test
  (is (= "Ask the user to rename one of the databases."
         (recovery-hints/recovery-hint {:error :ambiguous-database-name}))))

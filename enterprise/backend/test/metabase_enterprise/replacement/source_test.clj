(ns metabase-enterprise.replacement.source-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.replacement.source :as replacement.source]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(deftest table-replaceable-with-itself-test
  (testing "Every table in test-data is replaceable with itself"
    (mt/dataset test-data
      (let [mp     (lib-be/application-database-metadata-provider (mt/id))
            tables (lib.metadata/tables mp)]
        (doseq [table tables]
          (testing (str "table: " (:name table))
            (is (empty? (replacement.source/check-replace-source mp table table)))))))))

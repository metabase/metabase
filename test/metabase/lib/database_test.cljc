(ns metabase.lib.database-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel database-id-test
  (testing "Normal query with a source Table"
    (is (= (meta/id)
           (lib/database-id (lib.tu/venues-query)))))
  (testing "Query with source Card"
    (let [query (lib.tu/query-with-source-card)]
      (testing "and normal Database ID"
        (is (= (meta/id)
               (lib/database-id query))))
      (testing "and Saved Questions virtual database ID"
        (let [query (assoc query :database lib.schema.id/saved-questions-virtual-database-id)]
          (testing "get the `:database-id` from the CardMetadata"
            (is (= (meta/id)
                   (lib/database-id query))))
          (testing "CardMetadata not present in MetadataProvider"
            (let [query (assoc query :lib/metadata meta/metadata-provider)]
              (is (nil? (lib/database-id query))))))))))

(deftest ^:parallel database-display-info-test
  (let [mp    (lib.tu/merged-mock-metadata-provider
               meta/metadata-provider
               {:database {:native-permissions :write
                           :is-sample          true
                           :auto-run-queries   true
                           :settings           {:database-enable-actions true}}})
        query (lib/query mp (meta/table-metadata :venues))]
    (is (=? {:name               "test-data"
             :display-name       "test-data"
             :engine             :h2
             :features           #(contains? % :nested-queries)
             :native-permissions :write
             :is-sample          true
             :actions-enabled?   true
             :auto-run-queries   true}
            (lib/display-info query (lib.metadata/database query))))
    (testing "without settings"
      (is (=? {:is-sample        false
               :actions-enabled? false}
              (lib/display-info (lib.tu/venues-query) (lib.metadata/database (lib.tu/venues-query))))))))

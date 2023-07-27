(ns metabase.lib.database-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.composed-provider
    :as lib.metadata.composed-provider]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.mbql.schema :as mbql.s]))

(deftest ^:parallel database-id-test
  (testing "Normal query with a source Table"
    (is (= (meta/id)
           (lib/database-id lib.tu/venues-query))))
  (testing "Query with source Card"
    (let [query lib.tu/query-with-source-card]
      (testing "and normal Database ID"
        (is (= (meta/id)
               (lib/database-id query))))
      (testing "and Saved Questions virtual database ID"
        (let [query (assoc query :database mbql.s/saved-questions-virtual-database-id)]
          (testing "get the `:database-id` from the CardMetadata"
            (is (= (meta/id)
                   (lib/database-id query))))
          (testing "CardMetadata not present in MetadataProvider"
            (let [query (assoc query :lib/metadata meta/metadata-provider)]
              (is (nil? (lib/database-id query)))))
          (testing "CardMetadata is missing `:database-id`"
            (let [metadata-provider (lib.metadata.composed-provider/composed-metadata-provider
                                     meta/metadata-provider
                                     (lib.tu/mock-metadata-provider
                                      {:cards [{:name          "My Card"
                                                :id            1
                                                :dataset-query (dissoc lib.tu/venues-query :lib/metadata)}]}))
                  query             (assoc query :lib/metadata metadata-provider)]
              (is (nil? (lib/database-id query))))))))))

(ns metabase.query-processor.middleware.resolve-referenced-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.middleware.parameters-test :refer [card-template-tags]]
   [metabase.query-processor.middleware.resolve-referenced :as qp.resolve-referenced]
   [metabase.test :as mt])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(deftest ^:parallel resolve-card-resources-test
  (testing "resolve stores source table from referenced card"
    (let [metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                             (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                             [(mt/mbql-query venues
                                {:filter [:< $price 3]})])
          query             (lib/query
                             metadata-provider
                             {:database (mt/id)
                              :type     :native
                              :native   {:query {}
                                         :template-tags
                                         {"tag-name-not-important1" {:type         :card
                                                                     :display-name "X"
                                                                     :card-id      1}}}})]
      (is (= query
             (#'qp.resolve-referenced/resolve-referenced-card-resources query)))
      (is (some? (lib.metadata.protocols/cached-metadata
                  metadata-provider
                  :metadata/table
                  (mt/id :venues))))
      (is (some? (lib.metadata.protocols/cached-metadata
                  metadata-provider
                  :metadata/column
                  (mt/id :venues :price)))))))

(deftest ^:parallel referenced-query-from-different-db-test
  (testing "fails on query that references a native query from a different database"
    (let [metadata-provider meta/metadata-provider
          tag-name   "#1"
          query      (lib/query
                      (lib.tu/mock-metadata-provider
                       metadata-provider
                       {:database (assoc (lib.metadata/database metadata-provider) :id 1234)})
                      {:database 1234
                       :type     :native
                       :native   {:query         (format "SELECT * FROM {{%s}} AS x" tag-name)
                                  :template-tags {tag-name ; This tag's query is from the test db
                                                  {:id   tag-name, :name    tag-name, :display-name tag-name,
                                                   :type "card",   :card-id 1}}}})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"\QCard 1 does not exist, or is from a different Database.\E"
           (qp.resolve-referenced/resolve-referenced-card-resources query))))))

(deftest ^:parallel circular-referencing-tags-test
  (testing "fails on query with circular referencing sub-queries"
    (let [metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                             meta/metadata-provider
                             [{:database (meta/id)
                               :type     :native
                               :native   {:query         "SELECT * FROM {{#2}} AS c2"
                                          :template-tags (card-template-tags [2])}}
                              {:database (meta/id)
                               :type     :native
                               :native   {:query         "SELECT * FROM {{#1}} AS c1"
                                          :template-tags (card-template-tags [1])}}])
          entrypoint-query  (lib/query
                             metadata-provider
                             {:database (meta/id)
                              :type     :native
                              :native   {:query         "SELECT * FROM {{#1}}"
                                         :template-tags (card-template-tags [1])}})]
      (is (thrown?
           ExceptionInfo
           (#'qp.resolve-referenced/check-for-circular-references entrypoint-query)))
      (try
        (#'qp.resolve-referenced/check-for-circular-references entrypoint-query)
        (catch ExceptionInfo e
          (testing e
            (is (= (#'qp.resolve-referenced/circular-ref-error entrypoint-query 2 1)
                   (ex-message e)))))))))

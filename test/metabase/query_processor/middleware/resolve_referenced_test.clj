(ns metabase.query-processor.middleware.resolve-referenced-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
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

(deftest ^:parallel card-snippet-card-circular-reference-test
  (testing "Detects card→snippet→card circular references"
    (testing "Card 1 → Snippet A → Card 1 (direct cycle)"
      (let [metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                               meta/metadata-provider
                               [{:database (meta/id)
                                 :type :native
                                 :native {:query "SELECT * FROM {{snippet: snippet-a}}"
                                          :template-tags {"snippet: snippet-a"
                                                          {:name "snippet: snippet-a"
                                                           :display-name "Snippet A"
                                                           :type :snippet
                                                           :snippet-name "snippet-a"
                                                           :snippet-id 100}}}}])
            ;; Add snippet to metadata provider using the correct key
            metadata-provider-with-snippet
            (lib.tu/mock-metadata-provider
             metadata-provider
             {:native-query-snippets [{:id 100
                                       :name "snippet-a"
                                       :content "WHERE id IN (SELECT id FROM {{#1}})"
                                       :template-tags {"#1" {:name "#1"
                                                             :type :card
                                                             :card-id 1}}}]})

            ;; Create the query that starts the cycle
            entrypoint-query (lib/query
                              metadata-provider-with-snippet
                              {:database (meta/id)
                               :type :native
                               :native {:query "SELECT * FROM {{#1}}"
                                        :template-tags (card-template-tags [1])}})]

        (testing "Should throw an exception for circular reference"
          (is (thrown-with-msg?
               ExceptionInfo
               #"circular|cycle"
               (#'qp.resolve-referenced/check-for-circular-references entrypoint-query))))))))

(deftest ^:parallel complex-card-snippet-cycle-test
  (testing "Detects complex card→snippet→snippet→card→snippet→card circular references"
    (testing "Card A → Snippet 1 → Snippet 2 → Card B → Snippet 3 → Card A"
      (let [;; Set up the metadata provider with both cards
            metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                               meta/metadata-provider
                               [;; Card A (id 1) references snippet-1
                                {:database (meta/id)
                                 :type :native
                                 :native {:query "SELECT * FROM {{snippet: snippet-1}}"
                                          :template-tags {"snippet: snippet-1"
                                                          {:name "snippet: snippet-1"
                                                           :display-name "Snippet 1"
                                                           :type :snippet
                                                           :snippet-name "snippet-1"
                                                           :snippet-id 101}}}}
                                ;; Card B (id 2) references snippet-3
                                {:database (meta/id)
                                 :type :native
                                 :native {:query "SELECT * FROM {{snippet: snippet-3}}"
                                          :template-tags {"snippet: snippet-3"
                                                          {:name "snippet: snippet-3"
                                                           :display-name "Snippet 3"
                                                           :type :snippet
                                                           :snippet-name "snippet-3"
                                                           :snippet-id 103}}}}])
            ;; Add all three snippets to the metadata provider
            metadata-provider-with-snippets
            (lib.tu/mock-metadata-provider
             metadata-provider
             {:native-query-snippets [;; Snippet 1 references snippet-2
                                      {:id 101
                                       :name "snippet-1"
                                       :content "WHERE x IN ({{snippet: snippet-2}})"
                                       :template-tags {"snippet: snippet-2"
                                                       {:name "snippet: snippet-2"
                                                        :type :snippet
                                                        :snippet-name "snippet-2"
                                                        :snippet-id 102}}}
                                      ;; Snippet 2 references Card B (id 2)
                                      {:id 102
                                       :name "snippet-2"
                                       :content "SELECT y FROM {{#2}}"
                                       :template-tags {"#2"
                                                       {:name "#2"
                                                        :type :card
                                                        :card-id 2}}}
                                      ;; Snippet 3 references Card A (id 1), completing the cycle
                                      {:id 103
                                       :name "snippet-3"
                                       :content "SELECT z FROM {{#1}}"
                                       :template-tags {"#1"
                                                       {:name "#1"
                                                        :type :card
                                                        :card-id 1}}}]})

            ;; Create the query that starts with Card A
            entrypoint-query (lib/query
                              metadata-provider-with-snippets
                              {:database (meta/id)
                               :type :native
                               :native {:query "SELECT * FROM {{#1}}"
                                        :template-tags (card-template-tags [1])}})]

        (testing "Should throw an exception for circular reference"
          (is (thrown-with-msg?
               ExceptionInfo
               #"circular|cycle"
               (#'qp.resolve-referenced/check-for-circular-references entrypoint-query))))

        (testing "The cycle detection should work from any entry point"
          ;; Starting from Card B should also detect the cycle
          (let [card-b-query (lib/query
                              metadata-provider-with-snippets
                              {:database (meta/id)
                               :type :native
                               :native {:query "SELECT * FROM {{#2}}"
                                        :template-tags (card-template-tags [2])}})]
            (is (thrown-with-msg?
                 ExceptionInfo
                 #"circular|cycle"
                 (#'qp.resolve-referenced/check-for-circular-references card-b-query)))))))))

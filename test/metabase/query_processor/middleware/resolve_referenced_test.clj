(ns metabase.query-processor.middleware.resolve-referenced-test
  (:require
   [clojure.test :refer :all]
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
                             (mt/metadata-provider)
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
          tag-name          "#1"
          query             (lib/query
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
            (is (= (#'qp.resolve-referenced/circular-ref-error entrypoint-query
                                                               ::qp.resolve-referenced/card 2
                                                               ::qp.resolve-referenced/card 1)
                   (ex-message e)))))))))

(deftest ^:parallel circular-referencing-tags-and-mbql-queries-test
  (testing "fails on query with circular referencing sub-queries involving both mbql and native queries #65743"
    (let [metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                             meta/metadata-provider
                             [{:database (meta/id)
                               :type     :native
                               :native   {:query         "SELECT * FROM {{#2}} AS c2"
                                          :template-tags (card-template-tags [2])}}
                              {:database (meta/id)
                               :type     :query
                               :query    {:source-table "card__1"}}])
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
            (is (= (#'qp.resolve-referenced/circular-ref-error entrypoint-query
                                                               ::qp.resolve-referenced/card 2
                                                               ::qp.resolve-referenced/card 1)
                   (ex-message e)))))))))

(defn- make-card-template-tag
  "Helper to create a card template tag with proper display-name"
  [card-id & [tag-name]]
  (let [name (or tag-name (str "#" card-id))]
    {name {:name         name
           :display-name (str "Card " card-id)
           :type         :card
           :card-id      card-id}}))

(defn- make-snippet-template-tag
  "Helper to create a snippet template tag with proper display-name"
  [snippet-id snippet-name & [tag-name]]
  (let [name (or tag-name (str "snippet: " snippet-name))]
    {name {:name         name
           :display-name snippet-name
           :type         :snippet
           :snippet-name snippet-name
           :snippet-id   snippet-id}}))

(defn- make-snippet
  "Helper to create a snippet with properly formatted template tags"
  [{:keys [id name content card-refs snippet-refs]}]
  (let [card-tags    (reduce merge {} (map make-card-template-tag card-refs))
        snippet-tags (reduce merge {} (map (fn [[snippet-id snippet-name]]
                                             (make-snippet-template-tag snippet-id snippet-name))
                                           snippet-refs))]
    {:id            id
     :name          name
     :content       content
     :template-tags (merge card-tags snippet-tags)}))

(deftest ^:parallel card-snippet-card-circular-reference-test
  (testing "Detects card→snippet→card circular references"
    (testing "Card 1 → Snippet A → Card 1 (direct cycle)"
      (let [metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                               meta/metadata-provider
                               [{:database (meta/id)
                                 :type     :native
                                 :native   {:query         "SELECT * FROM {{snippet: snippet-a}}"
                                            :template-tags (make-snippet-template-tag 100 "snippet-a")}}])
            ;; Add snippet to metadata provider
            metadata-provider-with-snippet
            (lib.tu/mock-metadata-provider
             metadata-provider
             {:native-query-snippets [(make-snippet {:id           100
                                                     :name         "snippet-a"
                                                     :content      "WHERE id IN (SELECT id FROM {{#1}})"
                                                     :card-refs    [1]
                                                     :snippet-refs []})]})

            ;; Create the query that starts the cycle
            entrypoint-query (lib/query
                              metadata-provider-with-snippet
                              {:database (meta/id)
                               :type     :native
                               :native   {:query         "SELECT * FROM {{#1}}"
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
                                 :type     :native
                                 :native   {:query         "SELECT * FROM {{snippet: snippet-1}}"
                                            :template-tags (make-snippet-template-tag 101 "snippet-1")}}
                                ;; Card B (id 2) references snippet-3
                                {:database (meta/id)
                                 :type     :native
                                 :native   {:query         "SELECT * FROM {{snippet: snippet-3}}"
                                            :template-tags (make-snippet-template-tag 103 "snippet-3")}}])
            ;; Add all three snippets to the metadata provider
            metadata-provider-with-snippets
            (lib.tu/mock-metadata-provider
             metadata-provider
             {:native-query-snippets [;; Snippet 1 references snippet-2
                                      (make-snippet {:id           101
                                                     :name         "snippet-1"
                                                     :content      "WHERE x IN ({{snippet: snippet-2}})"
                                                     :card-refs    []
                                                     :snippet-refs [[102 "snippet-2"]]})
                                      ;; Snippet 2 references Card B (id 2)
                                      (make-snippet {:id           102
                                                     :name         "snippet-2"
                                                     :content      "SELECT y FROM {{#2}}"
                                                     :card-refs    [2]
                                                     :snippet-refs []})
                                      ;; Snippet 3 references Card A (id 1), completing the cycle
                                      (make-snippet {:id           103
                                                     :name         "snippet-3"
                                                     :content      "SELECT z FROM {{#1}}"
                                                     :card-refs    [1]
                                                     :snippet-refs []})]})

            ;; Create the query that starts with Card A
            entrypoint-query (lib/query
                              metadata-provider-with-snippets
                              {:database (meta/id)
                               :type     :native
                               :native   {:query         "SELECT * FROM {{#1}}"
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
                               :type     :native
                               :native   {:query         "SELECT * FROM {{#2}}"
                                          :template-tags (card-template-tags [2])}})]
            (is (thrown-with-msg?
                 ExceptionInfo
                 #"circular|cycle"
                 (#'qp.resolve-referenced/check-for-circular-references card-b-query)))))))))

(deftest ^:parallel snippet-to-snippet-cycle-test
  (testing "Detects direct snippet→snippet cycles"
    (testing "Snippet A → Snippet B → Snippet A"
      (let [;; Create snippets that reference each other
            metadata-provider-with-snippets
            (lib.tu/mock-metadata-provider
             meta/metadata-provider
             {:native-query-snippets [(make-snippet {:id           201
                                                     :name         "snippet-a"
                                                     :content      "WHERE x IN ({{snippet: snippet-b}})"
                                                     :card-refs    []
                                                     :snippet-refs [[202 "snippet-b"]]})
                                      (make-snippet {:id           202
                                                     :name         "snippet-b"
                                                     :content      "SELECT y FROM ({{snippet: snippet-a}})"
                                                     :card-refs    []
                                                     :snippet-refs [[201 "snippet-a"]]})]})
            entrypoint-query (lib/query
                              metadata-provider-with-snippets
                              {:database (meta/id)
                               :type     :native
                               :native   {:query         "SELECT * FROM orders {{snippet: snippet-a}}"
                                          :template-tags (make-snippet-template-tag 201 "snippet-a")}})]
        (testing "Should throw an exception specifically mentioning snippet cycle"
          (is (thrown-with-msg?
               ExceptionInfo
               #"circular|cycle"
               (#'qp.resolve-referenced/check-for-circular-references entrypoint-query))))))

    (testing "Self-referencing snippet"
      (let [metadata-provider-with-snippet
            (lib.tu/mock-metadata-provider
             meta/metadata-provider
             {:native-query-snippets [;; Snippet that references itself
                                      (make-snippet {:id           301
                                                     :name         "recursive-snippet"
                                                     :content      "WHERE id IN (SELECT id FROM ({{snippet: recursive-snippet}}))"
                                                     :card-refs    []
                                                     :snippet-refs [[301 "recursive-snippet"]]})]})
            entrypoint-query (lib/query
                              metadata-provider-with-snippet
                              {:database (meta/id)
                               :type     :native
                               :native   {:query         "SELECT * FROM venues {{snippet: recursive-snippet}}"
                                          :template-tags (make-snippet-template-tag 301 "recursive-snippet")}})]
        (testing "Should throw an exception for self-referencing snippet"
          (is (thrown-with-msg?
               ExceptionInfo
               #"circular|cycle"
               (#'qp.resolve-referenced/check-for-circular-references entrypoint-query))))))))

(deftest ^:parallel valid-card-snippet-chain-test
  (testing "Allows valid non-cyclic card→snippet→snippet chains"
    (testing "Card → Snippet 1 → Snippet 2 (no cycle)"
      (let [;; Set up the metadata provider with one card
            metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                               meta/metadata-provider
                               [;; Card (id 1) references both snippet-1 and snippet-2
                                {:database (meta/id)
                                 :type :native
                                 :native {:query "SELECT * FROM products {{snippet: snippet-1}} {{snippet: snippet-2}}"
                                          :template-tags (merge (make-snippet-template-tag 101 "snippet-1")
                                                                (make-snippet-template-tag 102 "snippet-2"))}}])
            ;; Add two snippets where snippet-1 references snippet-2 (but no cycle)
            metadata-provider-with-snippets
            (lib.tu/mock-metadata-provider
             metadata-provider
             {:native-query-snippets [;; Snippet 1 references snippet-2
                                      (make-snippet {:id 101
                                                     :name "snippet-1"
                                                     :content "WHERE category IN ({{snippet: snippet-2}})"
                                                     :card-refs []
                                                     :snippet-refs [[102 "snippet-2"]]})
                                      ;; Snippet 2 does not reference anything else
                                      (make-snippet {:id 102
                                                     :name "snippet-2"
                                                     :content "SELECT DISTINCT category FROM categories WHERE active = true"
                                                     :card-refs []
                                                     :snippet-refs []})]})

            ;; Create the query that references Card 1
            entrypoint-query (lib/query
                              metadata-provider-with-snippets
                              {:database (meta/id)
                               :type :native
                               :native {:query "SELECT * FROM {{#1}}"
                                        :template-tags (card-template-tags [1])}})]

        (testing "Should NOT throw an exception for valid non-cyclic chain"
          ;; This should complete, without throwing an exception, and return a dependency graph
          (is (some? (#'qp.resolve-referenced/check-for-circular-references entrypoint-query))))))))

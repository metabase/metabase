(ns metabase-enterprise.dependencies.test-util
  (:require
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.metadata-providers.mock :as providers.mock]))

(defn mock-card [metadata-provider {:keys [id query details]}]
  (merge {:lib/type        :metadata/card
          :id              id
          :database-id     (:id (lib.metadata/database metadata-provider))
          :dataset-query   (if (string? query)
                             {:database (:id (lib.metadata/database metadata-provider))
                              :type     :native
                              :native   {:query         query
                                         :template-tags (lib/extract-template-tags metadata-provider query)}}
                             (lib.convert/->legacy-MBQL query))
          :name            (str (gensym))
          :result-metadata (when (not (string? query))
                             (->> (lib/returned-columns query)
                                  (sort-by :id)))}
         details))

(defn mock-snippet [{:keys [id name content template-tags]}]
  {:description   nil,
   :archived      false,
   :collection-id nil,
   :id            id
   :name          name
   :content       content
   :template-tags template-tags
   :lib/type      :metadata/native-query-snippet})

(defn mock-metadata-provider [{:keys [cards snippets]}]
  (lib/composed-metadata-provider
   meta/metadata-provider
   (providers.mock/mock-metadata-provider
    {:cards cards
     :native-query-snippets snippets})))

(defn default-metadata-provider []
  (let [snippets        (map mock-snippet
                             [{:id            1
                               :name          "inner"
                               :content       "{{#1-card-ref}}"
                               :template-tags {"#1-card-ref" {:card-id      1
                                                              :type         :card
                                                              :name         "#1-card-ref"
                                                              :display-name "#1-Card Ref"
                                                              :id           (str (random-uuid))}}}
                              {:id            2
                               :name          "outer"
                               :content       "{{snippet: inner}}"
                               :template-tags {"snippet: inner" {:snippet-id   1
                                                                 :snippet-name "inner"
                                                                 :type         :snippet
                                                                 :name         "snippet: inner"
                                                                 :display-name "Snippet: Inner"
                                                                 :id           (str (random-uuid))}}}])
        initial-mock-mp (mock-metadata-provider {:snippets snippets})
        initial-card-a  (mock-card initial-mock-mp
                                   {:id    1
                                    :query (lib/query initial-mock-mp (meta/table-metadata :products))})
        initial-card-b  (mock-card initial-mock-mp
                                   {:id    2
                                    :query (lib/query initial-mock-mp (meta/table-metadata :orders))})]
    (mock-metadata-provider
     {:cards    (into [initial-card-a
                       initial-card-b]
                      (map #(mock-card initial-mock-mp %))
                      [{:id    3
                        :query (lib/query initial-mock-mp initial-card-a)}
                       {:id    4
                        :query "select * from products"}
                       {:id    5
                        :query "select * from {{#1}}"}
                       {:id    6
                        :query "select * from {{snippet: inner}}"}
                       {:id    7
                        :query "select * from {{snippet: outer}}"}
                       {:id    8
                        :query (as-> (lib/query initial-mock-mp initial-card-b) q
                                 (lib/join q (-> (lib/join-clause initial-card-a)
                                                 (lib/with-join-conditions
                                                  [(lib/=
                                                    (m/find-first #(= (:name %) "PRODUCT_ID")
                                                                  (lib/join-condition-lhs-columns
                                                                   q initial-card-b nil nil))
                                                    (m/find-first #(= (:name %) "ID")
                                                                  (lib/join-condition-lhs-columns
                                                                   q initial-card-a nil nil)))])
                                                 (lib/with-join-fields :all))))}
                       {:id    9
                        :query "select * from {{#1}} inner join {{#2}}"}
                       {:id    10
                        :query "SELECT id, name FROM (SELECT id, name, email FROM PEOPLE)"}
                       {:id    11
                        :query "SELECT category FROM (SELECT id, name FROM PEOPLE)"}
                       {:id    12
                        :query "SELECT id, category FROM (SELECT id, name FROM PEOPLE)"}
                       {:id    13
                        :query "SELECT id FROM (SELECT id, name FROM (SELECT id, name, email FROM PEOPLE))"}
                       {:id    14
                        :query "SELECT category FROM (SELECT id, name FROM (SELECT id, name, email FROM PEOPLE))"}
                       {:id    15
                        :query "SELECT * FROM (SELECT id, name FROM PEOPLE)"}
                       {:id    16
                        :query "SELECT name FROM (SELECT * FROM (SELECT id, name FROM PEOPLE))"}
                       {:id    17
                        :query "SELECT email FROM (SELECT * FROM (SELECT id, name FROM PEOPLE))"}
                       {:id    18
                        :query "SELECT ID, TITLE FROM {{#1}}"}
                       {:id    19
                        :query "SELECT DESCRIPTION FROM {{#1}}"}
                       {:id    20
                        :query "SELECT ID FROM {{#1}} AS p"}
                       {:id    21
                        :query "SELECT PASSWORD FROM {{#1}} AS p"}
                       {:id    22
                        :query "SELECT * FROM {{#1}}"}
                       {:id    23
                        :query "SELECT p.LATITUDE FROM {{#1}} AS p"}
                       {:id    24
                        :query "SELECT BAD FROM {{#1}} AS c1 JOIN {{#2}} AS c2 ON c1.ID = c2.ID"}
                       {:id    25
                        :query "SELECT c1.BAD FROM {{#1}} AS c1 JOIN {{#2}} AS c2 ON c1.ID = c2.ID"}
                       {:id    26
                        :query "SELECT BAD FROM products JOIN {{#1}} AS c1 ON products.ID = c1.ID"}
                       {:id    27
                        :query "SELECT products.BAD FROM products JOIN {{#1}} AS c1 ON products.ID = c1.ID"}
                       {:id    28
                        :query "SELECT xix.x, products.BAD FROM products JOIN {{#1}} AS c1 ON products.ID = c1.ID"}
                       ;; Card 29 references card 4 which has no result-metadata (native query)
                       {:id    29
                        :query "SELECT BAD FROM {{#4}}"}
                       ;; Card 32: middle of transitive chain, passes through card 1's columns
                       ;; but with CATEGORY removed (simulates upstream card 1 was changed)
                       {:id      32
                        :query   "SELECT * FROM {{#1}}"
                        :details {:result-metadata
                                  (vec (remove #(= (:name %) "CATEGORY")
                                               (:result-metadata initial-card-a)))}}
                       ;; Card 33: end of chain, selects CATEGORY which card 32 no longer has
                       {:id    33
                        :query "SELECT CATEGORY FROM {{#32}}"}
                       ;; Mixed table+card, qualified to card alias
                       {:id    30
                        :query "SELECT c1.BAD FROM products JOIN {{#1}} AS c1 ON products.ID = c1.ID"}
                       ;; Multi-card, qualified to second card
                       {:id    31
                        :query "SELECT c2.BAD FROM {{#1}} AS c1 JOIN {{#2}} AS c2 ON c1.ID = c2.ID"}
                       ;; Card 34: MBQL card with subset of products columns (simulates MBQL intermediary)
                       {:id      34
                        :query   (lib/query initial-mock-mp (meta/table-metadata :products))
                        :details {:result-metadata
                                  (vec (filter #(#{"ID" "TITLE"} (:name %))
                                               (:result-metadata initial-card-a)))}}
                       ;; Card 35: native referencing MBQL card 34 — CATEGORY not in card 34's metadata
                       {:id    35
                        :query "SELECT CATEGORY FROM {{#34}}"}
                       ;; Card 36: native card with orders columns as result-metadata
                       {:id      36
                        :query   "SELECT * FROM orders"
                        :details {:result-metadata (:result-metadata initial-card-b)}}
                       ;; Card 37: native referencing both MBQL card 34 and native card 36
                       {:id    37
                        :query "SELECT c1.CATEGORY, c2.BAD FROM {{#34}} AS c1 JOIN {{#36}} AS c2 ON c1.ID = c2.ID"}])
      :snippets snippets})))

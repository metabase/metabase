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
                        :query "SELECT p.LATITUDE FROM {{#1}} AS p"}])
      :snippets snippets})))

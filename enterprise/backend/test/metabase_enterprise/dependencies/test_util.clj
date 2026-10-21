(ns metabase-enterprise.dependencies.test-util
  (:require
   [medley.core :as m]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.result-metadata-status :as models.result-metadata-status]
   [metabase-enterprise.dependencies.task.analysis-finding :as task.analysis-finding]
   [metabase-enterprise.dependencies.task.dependency :as task.dependency]
   [metabase.app-db.core :as mdb]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util.metadata-providers.mock :as providers.mock]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn run-with-dependencies-setup!
  "Run `thunk` with the metadata provider of the test database, as Rasta and with the dependencies feature, each write
  committing on its own as it does between real requests."
  [thunk]
  (mt/test-helpers-set-global-values!
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:dependencies}
        (lib-be/with-metadata-provider-cache
          (let [mp (mt/metadata-provider)]
            (thunk mp)))))))

(defn synchronously-run-dependency-job!
  "Run the dependency job synchronously, processing every changed or outdated entity until there is nothing left to
  process. Use this in tests after writes and before asserting on dependency data."
  []
  (mt/with-premium-features #{:dependencies}
    (while (#'task.dependency/update-dependencies!))))

(defn run-analysis-finding-job!
  "Run batches of the analysis finding job until one takes nothing, or up to 20 of them, returning whether the last one
  took anything."
  []
  (loop [runs 1]
    (let [took? (some? (#'task.analysis-finding/run-batch!))]
      (if (and took? (< runs 20))
        (recur (inc runs))
        took?))))

(defn table-query
  "A query of the test data Table named `table`."
  [table]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id table)))))

(defn card-query
  "A query of the Card with `card-id`."
  [card-id]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/card mp card-id))))

(defn- status-pending?
  "Whether the entity `entity-type` `entity-id` has no status in the status `model`, or one that counts a write and
  that the job has not given up on."
  [model entity-type entity-id]
  (not (t2/exists? model {:where [:and
                                  [:= :entity_type (name entity-type)]
                                  [:= :entity_id entity-id]
                                  [:or [:= :stale 0] [:= :terminal true]]]})))

(defn record-status-processed!
  "Record, as a job does when it clears a status, that the entity `entity-type` `entity-id` was processed by the logic
  of `version`, inserting its status in the status `model` when there is none."
  [model entity-type entity-id version]
  (when (zero? (t2/update! model :entity_type entity-type :entity_id entity-id {:stale 0 :analysis_version version}))
    (t2/insert! model {:entity_type entity-type :entity_id entity-id :stale 0 :analysis_version version})))

(defn dependency-pending?
  "Whether the dependency job is to compute the dependencies of the entity `entity-type` `entity-id`: it has no
  status, or one that counts a write."
  [entity-type entity-id]
  (status-pending? :model/DependencyStatus entity-type entity-id))

(defn record-dependencies-computed!
  "Record, as the dependency job does when it clears its status, that the dependencies of the entity `entity-type`
  `entity-id` are current."
  [entity-type entity-id]
  (record-status-processed! :model/DependencyStatus entity-type entity-id
                            models.dependency/current-dependency-analysis-version))

(defn result-metadata-pending?
  "Whether the result metadata job is to re-derive the Card with `card-id`: it has no status, or one that counts a
  write."
  [card-id]
  (status-pending? :model/ResultMetadataStatus :card card-id))

(defn record-result-metadata-processed!
  "Record, as the result metadata job does when it clears its status, that the result metadata of the Card with
  `card-id` is current."
  [card-id]
  (record-status-processed! :model/ResultMetadataStatus :card card-id
                            models.result-metadata-status/current-result-metadata-version))

(defn analysis-finding-pending?
  "Whether the analysis job is to analyze the entity `entity-type` `entity-id`: it has no status, or one that counts a
  write."
  [entity-type entity-id]
  (status-pending? :model/AnalysisFindingStatus entity-type entity-id))

(defn record-analysis-finding-processed!
  "Record, as the analysis job does when it clears its status, that the finding of the entity `entity-type`
  `entity-id` is current."
  [entity-type entity-id]
  (record-status-processed! :model/AnalysisFindingStatus entity-type entity-id
                            models.analysis-finding/*current-analysis-finding-version*))

(defn do-with-immediate-hook-writes
  "Run `thunk` with the work the dependency hooks defer until commit done at once, since a test's transaction never
  commits."
  [thunk]
  (mt/with-dynamic-fn-redefs [mdb/do-after-commit (fn [f] (f))]
    (thunk)))

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

(defn mock-metadata-provider
  "Cards and snippets from an in-memory mock, Tables from the application database.

  The Tables have to be real rows: resolving a table name parsed out of native SQL is a lookup against the appdb, so a
  purely in-memory base would have no rows to find."
  [{:keys [cards snippets]}]
  (lib/composed-metadata-provider
   (mt/metadata-provider)
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
                                    :query (lib/query initial-mock-mp (lib.metadata/table initial-mock-mp (mt/id :products)))})
        initial-card-b  (mock-card initial-mock-mp
                                   {:id    2
                                    :query (lib/query initial-mock-mp (lib.metadata/table initial-mock-mp (mt/id :orders)))})]
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
                       ;; Mixed table+card, qualified to card alias
                       {:id    29
                        :query "SELECT c1.BAD FROM products JOIN {{#1-how-are-you}} AS c1 ON products.ID = c1.ID"}
                       ;; Multi-card, qualified to second card
                       {:id    30
                        :query "SELECT c2.BAD FROM {{#1-im-fine}} AS c1 JOIN {{#2-thank-you}} AS c2 ON c1.ID = c2.ID"}
                       ;; Card 31: middle of transitive chain, passes through card 1's columns
                       ;; but with CATEGORY removed (simulates upstream card 1 was changed)
                       {:id      31
                        :query   "SELECT * FROM {{#1}}"
                        :details {:result-metadata
                                  (vec (remove #(= (:name %) "CATEGORY")
                                               (:result-metadata initial-card-a)))}}
                       ;; Card 32: end of chain, selects CATEGORY which card 31 no longer has
                       {:id    32
                        :query "SELECT CATEGORY FROM {{#31}}"}
                       ;; Card 33: MBQL card with subset of products columns (simulates MBQL intermediary)
                       {:id      33
                        :query   (lib/query initial-mock-mp (lib.metadata/table initial-mock-mp (mt/id :products)))
                        :details {:result-metadata
                                  (vec (filter #(#{"ID" "TITLE"} (:name %))
                                               (:result-metadata initial-card-a)))}}
                       ;; Card 34: native referencing MBQL card 33 — CATEGORY not in card 33's metadata
                       {:id    34
                        :query "SELECT CATEGORY FROM {{#33}}"}
                       ;; Card 35: native card with orders columns as result-metadata
                       {:id      35
                        :query   "SELECT * FROM orders"
                        :details {:result-metadata (:result-metadata initial-card-b)}}
                       ;; Card 36: native referencing both MBQL card 33 and native card 35
                       {:id    36
                        :query "SELECT c1.CATEGORY, c2.BAD FROM {{#33}} AS c1 JOIN {{#35}} AS c2 ON c1.ID = c2.ID"}])
      :snippets snippets})))

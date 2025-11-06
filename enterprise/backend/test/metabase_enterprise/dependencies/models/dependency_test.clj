(ns metabase-enterprise.dependencies.models.dependency-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.models.dependency :as deps.graph]
   [metabase.graph.core :as graph]
   [metabase.lib.core :as lib]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- depends-on-> [from-type from-id to-type to-id]
  {:from_entity_type from-type
   :from_entity_id   from-id
   :to_entity_type   to-type
   :to_entity_id     to-id})

(defn- upstream-of [from-type from-id]
  (t2/select-fn-set #(select-keys % [:from_entity_type :from_entity_id :to_entity_type :to_entity_id])
                    :model/Dependency :from_entity_type from-type :from_entity_id from-id))

(defn basic-orders
  "Construct a basic card for dependency testing."
  []
  {:name                   "Test card"
   :database_id            (mt/id)
   :table_id               (mt/id :orders)
   :display                :table
   :query_type             :query
   :type                   :question
   :dataset_query          (mt/mbql-query orders)
   :visualization_settings {}})

(defn wrap-card
  "Construct a card depending on `inner-card` for dependency testing."
  [inner-card]
  {:name                   "Downstream card"
   :database_id            (mt/id)
   :display                :table
   :query_type             :query
   :type                   :question
   :dataset_query          (mt/mbql-query nil
                             {:source-table (str "card__" (:id inner-card))})
   :visualization_settings {}})

(deftest ^:sequential card-deps-maintenance-test-1-new-card
  (testing "upstream deps of a card are updated correctly"
    (mt/dataset test-data
      (mt/with-temp [:model/User user {:email "me@wherever.com"}]
        (mt/with-premium-features #{:dependencies}
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [card1 (card/create-card! (basic-orders) user)]
              (is (integer? (:id card1)))
              (testing "when creating a new card"
                (is (=? #{(depends-on-> :card (:id card1) :table (mt/id :orders))}
                        (upstream-of :card (:id card1))))

                (testing "that depends on another card"
                  (let [card2 (card/create-card! (wrap-card card1) user)]
                    (is (=? #{(depends-on-> :card (:id card2) :card (:id card1))}
                            (upstream-of :card (:id card2))))
                    (testing "but that doesn't affect the upstream deps of the inner card"
                      (is (=? #{(depends-on-> :card (:id card1) :table (mt/id :orders))}
                              (upstream-of :card (:id card1))))))))

              (testing "when updating an existing card"
                (testing "to add a new table dep"
                  (card/update-card! {:card-before-update card1
                                      :card-updates
                                      {:dataset_query (mt/mbql-query orders
                                                        {:joins [{:alias "Products"
                                                                  :source-table (mt/id :products)
                                                                  :condition [:= $id &Products.$products.id]}]})}})
                  (is (=? #{(depends-on-> :card (:id card1) :table (mt/id :orders))
                            (depends-on-> :card (:id card1) :table (mt/id :products))}
                          (upstream-of :card (:id card1)))))
                (testing "to remove a table dep"
                  (card/update-card! {:card-before-update (t2/select-one :model/Card :id (:id card1))
                                      :card-updates
                                      {:dataset_query (mt/mbql-query products)}})
                  (is (=? #{(depends-on-> :card (:id card1) :table (mt/id :products))}
                          (upstream-of :card (:id card1)))))))))))))

(deftest ^:sequential card-deps-graph-test-1-mbql-card-chain
  (testing "deps graph is connected properly for a chain of MBQL cards"
    (mt/dataset test-data
      (mt/with-temp [:model/User user {:email "me@wherever.com"}]
        (mt/with-premium-features #{:dependencies}
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [{id1 :id :as card1} (card/create-card! (basic-orders) user)
                  {id2 :id :as card2} (card/create-card! (wrap-card card1) user)
                  {id3 :id :as card3} (card/create-card! (wrap-card card2) user)]
              (testing "raw deps are recorded correctly"
                (is (=? #{(depends-on-> :card id1 :table (mt/id :orders))} (upstream-of :card id1)))
                (is (=? #{(depends-on-> :card id2 :card id1)} (upstream-of :card id2)))
                (is (=? #{(depends-on-> :card id3 :card id2)} (upstream-of :card id3))))

              (testing "transitive deps are computed correctly"
                (testing "for each card"
                  (is (=? {:card #{id2 id3}}
                          (deps.graph/transitive-dependents {:card [card1]})))
                  (is (=? {:card #{id3}}
                          (deps.graph/transitive-dependents {:card [card2]})))
                  (is (=? {}
                          (deps.graph/transitive-dependents {:card [card3]}))))
                (testing "for the table"
                  (is (set/subset? #{id1 id2 id3}
                                   (-> {:table [{:id (mt/id :orders)}]}
                                       deps.graph/transitive-dependents
                                       :card))))))))))))

(defn- sql-card [metadata-provider sql]
  {:name                   "SQL card"
   :database_id            (mt/id)
   :display                :table
   :query_type             :query
   :type                   :question
   :dataset_query          (-> (lib/native-query metadata-provider sql)
                               lib/->legacy-MBQL)
   :visualization_settings {}})

(deftest ^:sequential card-deps-graph-test-2-native-card-chain
  (testing "deps graph is connected properly for a chain of native cards"
    (mt/dataset test-data
      (mt/with-temp [:model/User user {:email "me@wherever.com"}]
        (mt/with-premium-features #{:dependencies}
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [mp (mt/metadata-provider)
                  {id1 :id :as card1} (card/create-card! (sql-card mp "SELECT * FROM orders;") user)
                  {id2 :id :as card2} (card/create-card! (sql-card mp (str "SELECT * FROM {{#" id1 "}}")) user)
                  {id3 :id :as card3} (card/create-card! (sql-card mp (str "SELECT * FROM {{#" id2 "}}")) user)]
              (testing "raw deps are recorded correctly"
                (is (=? #{(depends-on-> :card id1 :table (mt/id :orders))} (upstream-of :card id1)))
                (is (=? #{(depends-on-> :card id2 :table (mt/id :orders))
                          (depends-on-> :card id2 :card id1)} (upstream-of :card id2)))
                (is (=? #{(depends-on-> :card id3 :table (mt/id :orders))
                          (depends-on-> :card id3 :card id2)} (upstream-of :card id3))))
              (testing "transitive deps are computed correctly"
                (testing "for each card"
                  (is (=? {:card #{id2 id3}}
                          (deps.graph/transitive-dependents {:card [card1]})))
                  (is (=? {:card #{id3}}
                          (deps.graph/transitive-dependents {:card [card2]})))
                  (is (=? {}
                          (deps.graph/transitive-dependents {:card [card3]}))))
                (testing "for the table"
                  (is (set/subset? #{id1 id2 id3}
                                   (-> {:table [{:id (mt/id :orders)}]}
                                       deps.graph/transitive-dependents
                                       :card))))))))))))

(deftest ^:sequential card-deps-graph-metric-test
  (testing "deps graph is connected properly for a question using a metric"
    (mt/dataset test-data
      (mt/with-temp [:model/User user {:email "me@wherever.com"}]
        (mt/with-premium-features #{:dependencies}
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [metric-card (card/create-card! {:name "Test Metric"
                                                  :database_id (mt/id)
                                                  :table_id (mt/id :orders)
                                                  :display :scalar
                                                  :query_type :query
                                                  :type :metric
                                                  :dataset_query (mt/mbql-query orders {:aggregation [[:count]]})
                                                  :visualization_settings {}}
                                                 user)
                  question-card (card/create-card! {:name "Question using Metric"
                                                    :database_id (mt/id)
                                                    :display :table
                                                    :query_type :query
                                                    :type :question
                                                    :dataset_query (mt/mbql-query orders
                                                                     {:aggregation [[:metric (:id metric-card)]]})
                                                    :visualization_settings {}}
                                                   user)]
              (testing "raw deps are recorded correctly for question using metric"
                (is (=? #{(depends-on-> :card (:id question-card) :table (mt/id :orders))
                          (depends-on-> :card (:id question-card) :card (:id metric-card))}
                        (upstream-of :card (:id question-card))))))))))))

(deftest dependency-analysis-version-test
  (testing "dependency_analysis_version is updated when entities are created or updated"
    (testing "cards"
      (mt/with-model-cleanup [:model/Dependency]
        (mt/with-temp [:model/Card card {:dependency_analysis_version 0}]
          (is (zero? (t2/select-one-fn :dependency_analysis_version :model/Card (:id card))))
          (mt/with-premium-features #{:dependencies}
            (card/update-card! {:card-before-update card
                                :card-updates {:dataset_query (mt/mbql-query orders)}}))
          (is (= deps.graph/current-dependency-analysis-version
                 (t2/select-one-fn :dependency_analysis_version :model/Card (:id card)))))))
    (testing "transforms create"
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Transform transform]
          (is (= deps.graph/current-dependency-analysis-version
                 (t2/select-one-fn :dependency_analysis_version :model/Transform (:id transform)))))))
    (testing "transforms update"
      (mt/with-premium-features #{}
        (mt/with-temp [:model/Transform transform]
          (is (zero? (t2/select-one-fn :dependency_analysis_version :model/Transform (:id transform))))
          (mt/with-premium-features #{:dependencies}
            (t2/update! :model/Transform (:id transform) {:source {:type "query" :query (mt/mbql-query products)}}))
          (is (= deps.graph/current-dependency-analysis-version
                 (t2/select-one-fn :dependency_analysis_version :model/Transform (:id transform)))))))
    (testing "snippets create"
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/NativeQuerySnippet snippet]
          (is (= deps.graph/current-dependency-analysis-version
                 (t2/select-one-fn :dependency_analysis_version :model/NativeQuerySnippet (:id snippet)))))))
    (testing "snippets update"
      (mt/with-premium-features #{}
        (mt/with-temp [:model/NativeQuerySnippet snippet]
          (is (zero? (t2/select-one-fn :dependency_analysis_version :model/NativeQuerySnippet (:id snippet))))
          (mt/with-premium-features #{:dependencies}
            (t2/update! :model/NativeQuerySnippet (:id snippet) {:content "new content"}))
          (is (= deps.graph/current-dependency-analysis-version
                 (t2/select-one-fn :dependency_analysis_version :model/NativeQuerySnippet (:id snippet)))))))))

(deftest dependency-analysis-version-create-card-test
  (testing "dependency_analysis_version is updated when a card is created"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/Card :model/Dependency]
        (mt/with-temp [:model/User user]
          (let [card (card/create-card! (basic-orders) user)]
            (is (= deps.graph/current-dependency-analysis-version
                   (t2/select-one-fn :dependency_analysis_version :model/Card :id (:id card))))))))))

(deftest filtered-graph-dependencies-test
  (testing "filtered-graph-dependencies respects filter clause"
    (mt/with-temp [:model/User user {:email "me@wherever.com"}]
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/Card :model/Dependency]
          (let [{id1 :id :as card1} (card/create-card! (basic-orders) user)
                {id2 :id :as card2} (card/create-card! (wrap-card card1) user)
                {id3 :id :as _card3} (card/create-card! (wrap-card card2) user)]
            (testing "without filter, returns all dependencies"
              (let [graph (deps.graph/graph-dependencies)
                    deps (graph/transitive graph [[:card id3]])]
                (is (= #{[:card id2] [:card id1] [:table (mt/id :orders)]}
                       (set deps)))))
            (testing "with filter excluding card1, omits card1 and its dependencies"
              (let [filter-fn (fn [entity-type-field entity-id-field]
                                [:and
                                 [:= entity-type-field "card"]
                                 [:in entity-id-field [id2 id3]]])
                    graph (deps.graph/filtered-graph-dependencies filter-fn)
                    deps (graph/transitive graph [[:card id3]])]
                (is (= #{[:card id2]}
                       (set deps))
                    "Should only include card2, not card1 or table")))
            (testing "with filter excluding card2, breaks the chain"
              (let [filter-fn (fn [entity-type-field entity-id-field]
                                [:and
                                 [:= entity-type-field "card"]
                                 [:in entity-id-field [id1 id3]]])
                    graph (deps.graph/filtered-graph-dependencies filter-fn)
                    deps (graph/transitive graph [[:card id3]])]
                (is (= #{}
                       (set deps))
                    "Should be empty, chain is broken at card2")))))))))

(deftest filtered-graph-dependents-test
  (testing "filtered-graph-dependents respects filter clause"
    (mt/with-temp [:model/User user {:email "me@wherever.com"}]
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/Card :model/Dependency]
          (let [{id1 :id :as card1} (card/create-card! (basic-orders) user)
                {id2 :id :as card2} (card/create-card! (wrap-card card1) user)
                {id3 :id :as _card3} (card/create-card! (wrap-card card2) user)]
            (testing "without filter, returns all dependents"
              (let [graph (deps.graph/graph-dependents)
                    deps (graph/transitive graph [[:card id1]])]
                (is (= #{[:card id2] [:card id3]}
                       (set deps)))))
            (testing "with filter excluding card3, omits card3"
              (let [filter-fn (fn [entity-type-field entity-id-field]
                                [:and
                                 [:= entity-type-field "card"]
                                 [:in entity-id-field [id1 id2]]])
                    graph (deps.graph/filtered-graph-dependents filter-fn)
                    deps (graph/transitive graph [[:card id1]])]
                (is (= #{[:card id2]}
                       (set deps))
                    "Should only include card2, not card3")))
            (testing "with filter excluding card2, breaks the chain"
              (let [filter-fn (fn [entity-type-field entity-id-field]
                                [:and
                                 [:= entity-type-field "card"]
                                 [:in entity-id-field [id1 id3]]])
                    graph (deps.graph/filtered-graph-dependents filter-fn)
                    deps (graph/transitive graph [[:card id1]])]
                (is (= #{}
                       (set deps))
                    "Should be empty, chain is broken at card2")))))))))

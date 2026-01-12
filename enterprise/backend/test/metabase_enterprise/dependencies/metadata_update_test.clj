(ns metabase-enterprise.dependences.metadata-update-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.metadata-update :as deps.metadata-update]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.core :as queries]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- assert-do-for-card-children-order
  ([expected input]
   (assert-do-for-card-children-order expected input (constantly true)))
  ([expected input recur?]
   (let [nodes (atom [])
         thunk (fn [node]
                 (when (recur? node)
                   (swap! nodes conj node)
                   true))]
     (#'deps.metadata-update/do-for-card-children thunk input :card 1)
     (is (= expected @nodes)))))

(deftest ^:parallel do-for-card-children-handles-simple-parents-test
  (testing "do-for-card-children puts parents before children"
    (assert-do-for-card-children-order
     [4 3 2]
     {[:card 4] [[:card 3]]
      [:card 3] [[:card 2]]})))

(deftest ^:parallel do-for-card-children-sorts-nodes-at-same-level-test
  (testing "do-for-card-children sorts sibling nodes"
    (assert-do-for-card-children-order
     [6 2 4 7 3 5]
     {[:card 6] [[:card 2]
                 [:card 4]]
      [:card 7] [[:card 3]
                 [:card 5]]})))

(deftest ^:parallel do-for-card-children-handles-multiple-parents-test
  (testing "do-for-card-children handles children with multiple parents"
    (assert-do-for-card-children-order
     [2 4 3]
     {[:card 2] [[:card 3]
                 [:card 4]]
      [:card 4] [[:card 3]]})))

(deftest ^:parallel do-for-card-children-ignores-children-when-asked-test
  (testing "do-for-card-children ignores children when asked"
    (assert-do-for-card-children-order
     [2 3 4]
     {[:card 2] [[:card 3]
                 [:card 4]]
      [:card 5] [[:card 6]
                 [:card 7]]}
     (fn [node] (not= node 5)))))

(deftest ^:parallel do-for-card-children-recurses-through-noncards-test
  (testing "do-for-card-children automatically recurses through non-cards without asking"
    (let [node-ids (atom #{})]
      (assert-do-for-card-children-order
       [3 4]
       {[:segment 2] [[:card 3]
                      [:card 4]]}
       (fn [node-id]
         (swap! node-ids conj node-id)
         true))
      (is (= #{3 4}
             @node-ids)))))

(deftest ^:parallel do-for-card-children-ignores-starting-card-test
  (testing "do-for-card-children ignores the start node"
    ;; assert-do-for-card-children-order automatically uses :card 1 as the start
    (assert-do-for-card-children-order
     [2 3]
     {[:card 1] [[:card 2]]
      [:card 2] [[:card 3]]})))

(defn assert-traverses-grandchild [{:keys [grandchild-dependency-type grandchild-data should-traverse? should-include?]}]
  (let [mp (mt/metadata-provider)
        query (->> (mt/id :products)
                   (lib.metadata/table mp)
                   (lib/query mp))
        grandchild-model (deps.dependency-types/dependency-type->model grandchild-dependency-type)]
    (mt/with-temp [:model/Card {parent-id :id} {:dataset_query query}
                   :model/Card {child-id :id} {:dataset_query query}
                   grandchild-model {grandchild-id :id} grandchild-data
                   :model/Card {great-grandchild-id :id} {:dataset_query query}
                   :model/Dependency _ {:from_entity_type :card
                                        :from_entity_id child-id
                                        :to_entity_type :card
                                        :to_entity_id parent-id}
                   :model/Dependency _ {:from_entity_type grandchild-dependency-type
                                        :from_entity_id grandchild-id
                                        :to_entity_type :card
                                        :to_entity_id child-id}
                   :model/Dependency _ {:from_entity_type :card
                                        :from_entity_id great-grandchild-id
                                        :to_entity_type grandchild-dependency-type
                                        :to_entity_id grandchild-id}]
      (is (= (cond-> #{child-id}
               should-include? (conj grandchild-id)
               should-traverse? (conj great-grandchild-id))
             (set (#'deps.metadata-update/dependent-mbql-cards
                   (#'deps.metadata-update/all-mbql-children mp :card parent-id)
                   :card parent-id)))))))

(deftest ^:parallel do-for-dependent-mbql-cards-traverses-cards-test
  (testing "do-for-dependent-mbql-cards looks through card dependencies"
    (let [mp (mt/metadata-provider)
          query (->> (mt/id :products)
                     (lib.metadata/table mp)
                     (lib/query mp))]
      (assert-traverses-grandchild
       {:grandchild-dependency-type :card
        :grandchild-data {:dataset_query query}
        :should-traverse? true
        :should-include? true}))))

(deftest ^:parallel do-for-dependent-mbql-cards-stops-on-native-cards-test
  (testing "do-for-dependent-mbql-cards stops when it reaches a native card"
    (let [mp (mt/metadata-provider)
          native-query (lib/native-query mp "select * from orders")]
      (assert-traverses-grandchild
       {:grandchild-dependency-type :card
        :grandchild-data {:dataset_query native-query}}))))

(deftest ^:parallel do-for-dependent-mbql-cards-stops-on-snippets-test
  (testing "do-for-dependent-mbql-cards stops when it reaches a snippet"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :snippet
      :grandchild-data {:name "test snippet"
                        :content "SELECT 1"}})))

(deftest ^:parallel do-for-dependent-mbql-cards-stops-on-transforms-test
  (testing "do-for-dependent-mbql-cards stops when it reaches a transform"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :transform
      :grandchild-data {}})))

(deftest ^:parallel do-for-dependent-mbql-cards-stops-on-dashboards-test
  (testing "do-for-dependent-mbql-cards stops when it reaches a dashboard"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :dashboard
      :grandchild-data {}})))

(deftest ^:parallel do-for-dependent-mbql-cards-stops-on-documents-test
  (testing "do-for-dependent-mbql-cards stops when it reaches a document"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :document
      :grandchild-data {}})))

(deftest ^:parallel do-for-dependent-mbql-cards-traverses-through-segments-test
  (testing "do-for-dependent-mbql-cards traverses through segments"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :segment
      :grandchild-data {}
      :should-traverse? true})))

(deftest ^:parallel do-for-dependent-mbql-cards-traverses-through-measures-test
  (testing "do-for-dependent-mbql-cards traverses through measures"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :measure
      :grandchild-data {}
      :should-traverse? true})))

(deftest ^:sequential card-update-updates-child-metadata-test
  (testing "card updates update child card metadata"
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:dependencies}
        (let [mp (mt/metadata-provider)
              products-id (mt/id :products)
              orders-id (mt/id :orders)
              products (lib.metadata/table mp products-id)
              orders (lib.metadata/table mp orders-id)]
          (mt/with-temp [:model/Card {parent-id :id :as parent-card} {:dataset_query (lib/query mp products)}
                         :model/Card {child-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp parent-id))}
                         :model/Card {grandchild-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp child-id))}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id child-id
                                              :to_entity_type :card
                                              :to_entity_id parent-id}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id grandchild-id
                                              :to_entity_type :card
                                              :to_entity_id child-id}]
            (is (= #{8}
                   (t2/select-fn-set (comp count :result_metadata)
                                     [:model/Card :id :result_metadata :card_schema]
                                     :id [:in [parent-id child-id grandchild-id]])))
            (t2/update! :model/Card parent-id {:dataset_query (lib/query mp orders)})
            (events/publish-event! :event/card-update
                                   {:object (assoc parent-card :dataset_query (lib/query mp orders))
                                    :previous-object parent-card
                                    :user-id api/*current-user-id*})
            (is (= #{9}
                   (t2/select-fn-set (comp count :result_metadata)
                                     [:model/Card :id :result_metadata :card_schema]
                                     :id [:in [parent-id child-id grandchild-id]])))))))))

(deftest ^:sequential native-card-update-does-not-update-children-test
  (testing "native card updates do not update children"
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:dependencies}
        (let [mp (mt/metadata-provider)
              products-id (mt/id :products)
              products (lib.metadata/table mp products-id)
              native-query (lib/native-query mp "select * from orders")]
          (mt/with-temp [:model/Card {parent-id :id :as parent-card} {:dataset_query (lib/query mp products)}
                         :model/Card {child-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp parent-id))}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id child-id
                                              :to_entity_type :card
                                              :to_entity_id parent-id}]
            (t2/update! :model/Card child-id {:result_metadata nil})
            (events/publish-event! :event/card-update
                                   {:object (assoc parent-card :dataset_query native-query)
                                    :previous-object parent-card
                                    :user-id api/*current-user-id*})
            (is (= nil
                   (t2/select-one-fn :result_metadata
                                     [:model/Card :id :result_metadata :card_schema]
                                     :id child-id)))))))))

(deftest ^:sequential model-update-passes-down-new-values-test
  (testing "model updates pass down new result metadata"
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:dependencies}
        (let [mp (mt/metadata-provider)
              products-id (mt/id :products)
              products (lib.metadata/table mp products-id)
              native-query (lib/native-query mp "select * from orders")]
          (mt/with-temp [:model/Card {parent-id :id :as parent-card} {:dataset_query (lib/query mp products)
                                                                      :type :model}
                         :model/Card {child-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp parent-id))

                                                     :type :model}
                         :model/Card {grandchild-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp child-id))
                                                          :type :model}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id child-id
                                              :to_entity_type :card
                                              :to_entity_id parent-id}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id grandchild-id
                                              :to_entity_type :card
                                              :to_entity_id child-id}]
            (let [new-result-metadata (assoc-in (:result_metadata parent-card)
                                                [0 :display_name]
                                                "new-name")]
              (t2/update! :model/Card parent-id {:result_metadata new-result-metadata})
              (events/publish-event! :event/card-update
                                     {:object (assoc parent-card :result_metadata new-result-metadata)
                                      :previous-object parent-card
                                      :user-id api/*current-user-id*})
              (is (= #{[child-id "new-name"] [grandchild-id "new-name"]}
                     (t2/select-fn-set (juxt :id #(get-in % [:result_metadata 0 :display_name]))
                                       [:model/Card :id :result_metadata :card_schema]
                                       :id [:in [child-id grandchild-id]]))))))))))

(deftest ^:sequential model-update-respects-child-overrides-test
  (testing "model updates respect child metadata edits"
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:dependencies}
        (let [mp (mt/metadata-provider)
              products-id (mt/id :products)
              products (lib.metadata/table mp products-id)
              native-query (lib/native-query mp "select * from orders")]
          (mt/with-temp [:model/Card {parent-id :id :as parent-card} {:dataset_query (lib/query mp products)
                                                                      :type :model}
                         :model/Card {child-id :id :as child-card} {:dataset_query (lib/query mp (lib.metadata/card mp parent-id))
                                                                    :type :model}
                         :model/Card {grandchild-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp child-id))
                                                          :type :model}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id child-id
                                              :to_entity_type :card
                                              :to_entity_id parent-id}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id grandchild-id
                                              :to_entity_type :card
                                              :to_entity_id child-id}]
            (let [new-parent-metadata (assoc-in (:result_metadata parent-card)
                                                [0 :display_name]
                                                "new-name")
                  new-child-metadata (assoc-in (:result_metadata child-card)
                                               [0 :display_name]
                                               "child-name")
                  new-grandchild-metadata (assoc-in (:result_metadata child-card)
                                                    [0 :display_name]
                                                    "grandchild-name")]
              (t2/update! :model/Card parent-id {:result_metadata new-parent-metadata})
              (t2/update! :model/Card child-id {:result_metadata new-child-metadata})
              (t2/update! :model/Card grandchild-id {:result_metadata new-grandchild-metadata})
              (events/publish-event! :event/card-update
                                     {:object (assoc parent-card :result_metadata new-parent-metadata)
                                      :previous-object parent-card
                                      :user-id api/*current-user-id*})
              (is (= #{[child-id "child-name"] [grandchild-id "grandchild-name"]}
                     (t2/select-fn-set (juxt :id #(get-in % [:result_metadata 0 :display_name]))
                                       [:model/Card :id :result_metadata :card_schema]
                                       :id [:in [child-id grandchild-id]]))))))))))

(deftest ^:sequential model-update-stops-recursing-when-child-metadata-is-unchanged-test
  (testing "model updates stop recursing when they hit a child whose metadata didn't change"
    (mt/with-test-user :rasta
      (mt/with-premium-features #{:dependencies}
        (let [mp (mt/metadata-provider)
              products-id (mt/id :products)
              products (lib.metadata/table mp products-id)
              native-query (lib/native-query mp "select * from orders")]
          (mt/with-temp [:model/Card {parent-id :id :as parent-card} {:dataset_query (lib/query mp products)
                                                                      :type :model}
                         :model/Card {child-id :id :as child-card} {:dataset_query (lib/query mp (lib.metadata/card mp parent-id))
                                                                    :type :model}
                         :model/Card {grandchild-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp child-id))
                                                          :type :model}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id child-id
                                              :to_entity_type :card
                                              :to_entity_id parent-id}
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id grandchild-id
                                              :to_entity_type :card
                                              :to_entity_id child-id}]
            (let [new-parent-metadata (assoc-in (:result_metadata parent-card)
                                                [0 :display_name]
                                                "new-name")
                  new-child-metadata (-> (:result_metadata child-card)
                                         (assoc-in [0 :display_name]
                                                   "child-name")
                                         (assoc-in [0 :lib/model-display-name]
                                                   "new-name"))]
              (t2/update! :model/Card parent-id {:result_metadata new-parent-metadata})
              (t2/update! :model/Card child-id {:result_metadata new-child-metadata})
              (t2/update! :model/Card grandchild-id {:result_metadata nil})
              (events/publish-event! :event/card-update
                                     {:object (assoc parent-card :result_metadata new-parent-metadata)
                                      :previous-object parent-card
                                      :user-id api/*current-user-id*})
              (is (= nil
                     (t2/select-one-fn #(get-in % [:result_metadata 0 :display_name])
                                       [:model/Card :id :result_metadata :card_schema]
                                       :id grandchild-id))))))))))

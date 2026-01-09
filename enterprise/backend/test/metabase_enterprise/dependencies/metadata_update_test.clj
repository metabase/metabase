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

(deftest ^:parallel order-children-handles-simple-parents-test
  (testing "order-children puts parents before children"
    (is (= [[:card 3] [:card 2] [:card 1]]
           (#'deps.metadata-update/order-children {[:card 3] [[:card 2]]
                                                   [:card 2] [[:card 1]]})))))

(deftest ^:parallel order-children-sorts-nodes-at-same-level-test
  (testing "order-children sorts sibling nodes"
    (is (= [[:card 5] [:card 6] [:card 1] [:card 2] [:card 3] [:card 4]]
           (#'deps.metadata-update/order-children {[:card 5] [[:card 1]
                                                              [:card 3]]
                                                   [:card 6] [[:card 2]
                                                              [:card 4]]})))))

(deftest ^:parallel order-children-handles-multiple-parents-test
  (testing "order-children handles children with multiple parents"
    (is (= [[:card 1] [:card 3] [:card 2]]
           (#'deps.metadata-update/order-children {[:card 1] [[:card 2]
                                                              [:card 3]]
                                                   [:card 3] [[:card 2]]})))))

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
             (set (#'deps.metadata-update/dependent-mbql-cards mp :card parent-id)))))))

(deftest ^:parallel dependent-mbql-cards-traverses-cards-test
  (testing "dependent-mbql-cards looks through card dependencies"
    (let [mp (mt/metadata-provider)
          query (->> (mt/id :products)
                     (lib.metadata/table mp)
                     (lib/query mp))]
      (assert-traverses-grandchild
       {:grandchild-dependency-type :card
        :grandchild-data {:dataset_query query}
        :should-traverse? true
        :should-include? true}))))

(deftest ^:parallel dependent-mbql-cards-stops-on-native-cards-test
  (testing "dependent-mbql-cards stops when it reaches a native card"
    (let [mp (mt/metadata-provider)
          native-query (lib/native-query mp "select * from orders")]
      (assert-traverses-grandchild
       {:grandchild-dependency-type :card
        :grandchild-data {:dataset_query native-query}}))))

(deftest ^:parallel dependent-mbql-cards-stops-on-snippets-test
  (testing "dependent-mbql-cards stops when it reaches a snippet"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :snippet
      :grandchild-data {:name "test snippet"
                        :content "SELECT 1"}})))

(deftest ^:parallel dependent-mbql-cards-stops-on-transforms-test
  (testing "dependent-mbql-cards stops when it reaches a transform"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :transform
      :grandchild-data {}})))

(deftest ^:parallel dependent-mbql-cards-stops-on-dashboards-test
  (testing "dependent-mbql-cards stops when it reaches a dashboard"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :dashboard
      :grandchild-data {}})))

(deftest ^:parallel dependent-mbql-cards-stops-on-documents-test
  (testing "dependent-mbql-cards stops when it reaches a document"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :document
      :grandchild-data {}})))

(deftest ^:parallel dependent-mbql-cards-traverses-through-segments-test
  (testing "dependent-mbql-cards traverses through segments"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :segment
      :grandchild-data {}
      :should-traverse? true})))

(deftest ^:parallel dependent-mbql-cards-traverses-through-measures-test
  (testing "dependent-mbql-cards traverses through measures"
    (assert-traverses-grandchild
     {:grandchild-dependency-type :measure
      :grandchild-data {}
      :should-traverse? true})))

#_(deftest ^:sequential update-card-metadata-test
    (testing "update-card-metadata does the thing"
      (let [mp (mt/metadata-provider)
            query (->> (mt/id :products)
                       (lib.metadata/table mp)
                       (lib/query mp))]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query query}]
          (t2/update! :model/Card card-id {:result_metadata nil})
          (#'deps.metadata-update/update-card-metadata! mp card-id)
          (is (= (queries/infer-metadata query)
                 (t2/select-one-fn :result_metadata
                                   [:model/Card :result_metadata :card_schema]
                                   :id card-id)))))))

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
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id child-id
                                              :to_entity_type :card
                                              :to_entity_id parent-id}]
            (let [new-result-metadata (assoc-in (:result_metadata parent-card)
                                                [0 :display_name]
                                                "new-name")]
              (t2/update! :model/Card parent-id {:result_metadata new-result-metadata})
              (events/publish-event! :event/card-update
                                     {:object (assoc parent-card :result_metadata new-result-metadata)
                                      :previous-object parent-card
                                      :user-id api/*current-user-id*})
              (is (= "new-name"
                     (t2/select-one-fn #(get-in % [:result_metadata 0 :display_name])
                                       [:model/Card :id :result_metadata :card_schema]
                                       :id child-id))))))))))

(deftest ^:sequential model-update-respects-child-overrides-test
  (testing "model updates pass down new result metadata"
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
                         :model/Dependency _ {:from_entity_type :card
                                              :from_entity_id child-id
                                              :to_entity_type :card
                                              :to_entity_id parent-id}]
            (let [new-parent-metadata (assoc-in (:result_metadata parent-card)
                                                [0 :display_name]
                                                "new-name")
                  new-child-metadata (assoc-in (:result_metadata child-card)
                                               [0 :display_name]
                                               "child-name")]
              (t2/update! :model/Card parent-id {:result_metadata new-parent-metadata})
              (t2/update! :model/Card child-id {:result_metadata new-child-metadata})
              (events/publish-event! :event/card-update
                                     {:object (assoc parent-card :result_metadata new-parent-metadata)
                                      :previous-object parent-card
                                      :user-id api/*current-user-id*})
              (is (= "child-name"
                     (t2/select-one-fn #(get-in % [:result_metadata 0 :display_name])
                                       [:model/Card :id :result_metadata :card_schema]
                                       :id child-id))))))))))

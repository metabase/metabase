(ns metabase-enterprise.metabot-v3.tools.dependencies-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.dependencies :as metabot.dependencies]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]))

(defmacro with-dependent-transforms!
  "Creates two dependent SQL transforms for testing:
  - transform1: selects id and total from orders
  - transform2: selects total from transform1's output table

  Binds symbols transform1-id and transform2-id."
  [[transform1-binding transform2-binding] & body]
  `(mt/with-temp
     [:model/Table {table1-id# :id} {:db_id (mt/id)
                                     :schema "public"
                                     :name "orders_transform_1"}
      :model/Transform {transform1-id# :id}
      {:name "Transform 1"
       :source {:type "query"
                :query (lib/native-query (mt/metadata-provider) "SELECT id, total FROM orders")}
       :target {:type "table"
                :schema "public"
                :name "orders_transform_1"}}
      :model/Transform {transform2-id# :id}
      {:name "Transform 2"
       :source {:type "query"
                :query (lib/native-query (mt/metadata-provider) "SELECT id, total FROM orders_transform_1")}
       :target {:type "table"
                :schema "public"
                :name "orders_transform_2"}}
      :model/Dependency {} {:from_entity_type "transform"
                            :from_entity_id transform2-id#
                            :to_entity_type "transform"
                            :to_entity_id transform1-id#}]
     (let [~transform1-binding transform1-id#
           ~transform2-binding transform2-id#]
       ~@body)))

(deftest check-transform-dependencies-test
  (testing "removing total field from transform1 breaks transform2"
    (with-dependent-transforms! [transform1-id transform2-id]
      (let [modified-source {:type "query"
                             :query (lib/native-query (mt/metadata-provider) "SELECT id FROM orders")}
            result (metabot.dependencies/check-transform-dependencies
                    {:id transform1-id
                     :source modified-source})]
        (is (false? (get-in result [:structured_output :success])))
        (is (= 1 (get-in result [:structured_output :bad_transform_count])))
        (let [bad-transforms (get-in result [:structured_output :bad_transforms])]
          (is (= 1 (count bad-transforms)))
          (is (= transform2-id (get-in (first bad-transforms) [:transform :id])))
          (is (= "Transform 2" (get-in (first bad-transforms) [:transform :name]))))))))

(deftest check-transform-dependencies-limit-test
  (testing "max-reported-broken-transforms limit"
    (with-dependent-transforms! [transform1-id _]
      (mt/with-temp
        [:model/Transform {transform3-id :id}
         {:name "Transform 3"
          :source {:type "query"
                   :query (lib/native-query (mt/metadata-provider) "SELECT total FROM orders_transform_1")}
          :target {:type "table"
                   :schema "public"
                   :name "orders_transform_3"}}
         :model/Dependency {}
         {:from_entity_type "transform"
          :from_entity_id   transform3-id
          :to_entity_type   "transform"
          :to_entity_id     transform1-id}]
        (testing "when limit is 1, only one broken transform is reported"
          (binding [metabot.dependencies/*max-reported-broken-transforms* 1]
            (let [modified-source {:type "query"
                                   :query (lib/native-query (mt/metadata-provider) "SELECT id FROM orders")}
                  result (metabot.dependencies/check-transform-dependencies
                          {:id transform1-id
                           :source modified-source})
                  bad-transforms (get-in result [:structured_output :bad_transforms])]
              ;; Two downstream transforms should be broken (transform2 + transform3)...
              (is (false? (get-in result [:structured_output :success])))
              (is (= 2 (get-in result [:structured_output :bad_transform_count])))
              ;; ...but only one should be reported due to the limit.
              (is (= 1 (count bad-transforms))))))))))

(deftest check-transform-dependencies-with-cards-test
  (testing "removing field from transform breaks dependent card"
    (with-dependent-transforms! [transform1-id _]
      (mt/with-temp
        [:model/Card {card-id :id}
         {:name "Card using Transform 1"
          :database_id (mt/id)
          :table_id (mt/id :orders)
          :dataset_query (lib/native-query (mt/metadata-provider) "SELECT total FROM orders_transform_1")}
         :model/Dependency {}
         {:from_entity_type "card"
          :from_entity_id card-id
          :to_entity_type "transform"
          :to_entity_id transform1-id}]
        (let [modified-source {:type "query"
                               :query (lib/native-query (mt/metadata-provider) "SELECT id FROM orders")}
              result (metabot.dependencies/check-transform-dependencies
                      {:id transform1-id
                       :source modified-source})]
          (is (false? (get-in result [:structured_output :success])))
          (is (= 1 (get-in result [:structured_output :bad_question_count])))
          (let [bad-questions (get-in result [:structured_output :bad_questions])]
            (is (= 1 (count bad-questions)))
            (is (= card-id (get-in (first bad-questions) [:question :id])))
            (is (= "Card using Transform 1" (get-in (first bad-questions) [:question :name])))
            (is (some? (:errors (first bad-questions))))))))))

(deftest check-transform-dependencies-card-limit-test
  (testing "max-reported-broken-transforms limit applies to cards"
    (with-dependent-transforms! [transform1-id _]
      (mt/with-temp
        [:model/Card {card1-id :id}
         {:name "Card 1 using Transform 1"
          :database_id (mt/id)
          :table_id (mt/id :orders)
          :dataset_query (lib/native-query (mt/metadata-provider) "SELECT total FROM orders_transform_1")}
         :model/Dependency {}
         {:from_entity_type "card"
          :from_entity_id card1-id
          :to_entity_type "transform"
          :to_entity_id transform1-id}
         :model/Card {card2-id :id}
         {:name "Card 2 using Transform 1"
          :database_id (mt/id)
          :table_id (mt/id :orders)
          :dataset_query (lib/native-query (mt/metadata-provider) "SELECT total FROM orders_transform_1")}
         :model/Dependency {}
         {:from_entity_type "card"
          :from_entity_id card2-id
          :to_entity_type "transform"
          :to_entity_id transform1-id}]
        (testing "when limit is 1, only one broken card is reported"
          (binding [metabot.dependencies/*max-reported-broken-transforms* 1]
            (let [modified-source {:type "query"
                                   :query (lib/native-query (mt/metadata-provider) "SELECT id FROM orders")}
                  result (metabot.dependencies/check-transform-dependencies
                          {:id transform1-id
                           :source modified-source})
                  bad-cards (get-in result [:structured_output :bad_questions])]
              ;; Two cards should be broken...
              (is (false? (get-in result [:structured_output :success])))
              (is (= 2 (get-in result [:structured_output :bad_question_count])))
              ;; ...but only one should be reported due to the limit.
              (is (= 1 (count bad-cards))))))))))

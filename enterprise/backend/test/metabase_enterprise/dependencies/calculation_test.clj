(ns metabase-enterprise.dependencies.calculation-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase-enterprise.dependencies.calculation :as calculation]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(deftest upstream-deps-card-test
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        products (lib.metadata/table mp products-id)
        product-category (lib.metadata/field mp (mt/id :products :category))]
    (mt/with-temp [:model/Card {prod-card-id :id :as prod-card} {:dataset_query (lib/query mp products)}
                   :model/Card widget-card {:dataset_query (-> (lib/query mp (lib.metadata/card mp prod-card-id))
                                                               (lib/filter (lib/= product-category
                                                                                  "Widget")))}]
      (is (= {:card #{}
              :table #{products-id}}
             (calculation/upstream-deps:card prod-card)))
      (is (= {:card #{prod-card-id}
              :table #{}}
             (calculation/upstream-deps:card widget-card))))))

(deftest upstream-deps-card-join-test
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        orders-id (mt/id :orders)
        products (lib.metadata/table mp products-id)
        orders (lib.metadata/table mp orders-id)]
    (mt/with-temp [:model/Card {products-card-id :id :as products-card} {:dataset_query (lib/query mp products)}
                   :model/Card joined-card {:dataset_query (-> (lib/query mp (lib.metadata/card mp products-card-id))
                                                               (lib/join orders))}]
      (is (= {:card #{}
              :table #{products-id}}
             (calculation/upstream-deps:card products-card)))
      (is (= {:card #{products-card-id}
              :table #{orders-id}}
             (calculation/upstream-deps:card joined-card))))))

(deftest upstream-deps-card-native-with-parameter-source-test
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        products (lib.metadata/table mp products-id)
        category-field (lib.metadata/field mp (mt/id :products :category))]
    (mt/with-temp [:model/Card {category-values-card-id :id :as category-values-card}
                   {:dataset_query (-> (lib/query mp products)
                                       (lib/aggregate (lib/count))
                                       (lib/breakout category-field))}
                   :model/Card native-card
                   {:database_id (mt/id)
                    :dataset_query {:database (mt/id)
                                    :type :native
                                    :native {:query "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}}"
                                             :template-tags {"category" {:id "category-id"
                                                                         :name "category"
                                                                         :display-name "Category"
                                                                         :type :dimension
                                                                         :dimension [:field (mt/id :products :category) nil]
                                                                         :widget-type :string/=
                                                                         :default nil}}}}
                    :parameters [{:id "category-param"
                                  :type "category"
                                  :values_source_type "card"
                                  :values_source_config {:card_id category-values-card-id}}]}]
      (is (= {:card #{}
              :table #{products-id}}
             (calculation/upstream-deps:card category-values-card)))
      (is (= {:card #{category-values-card-id}
              :table #{products-id}}
             (calculation/upstream-deps:card native-card))))))

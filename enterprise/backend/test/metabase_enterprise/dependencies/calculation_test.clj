(ns metabase-enterprise.dependencies.calculation-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase-enterprise.dependencies.calculation :as calculation]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest ^:parallel upstream-deps-card-test
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

(deftest ^:parallel upstream-deps-card-join-test
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

(deftest ^:parallel upstream-deps-card-native-with-parameter-source-test
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

(deftest ^:parallel upstream-deps-dashboard-test
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        products (lib.metadata/table mp products-id)]
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                   :model/Dashboard {dashboard-id :id :as dashboard} {}
                   :model/DashboardCard _ {:dashboard_id dashboard-id
                                           :card_id card-id}]
      (let [dashboard (-> dashboard
                          (t2/hydrate :dashcards))]
        (is (= {:card #{card-id}
                :dashboard #{}}
               (calculation/upstream-deps:dashboard dashboard)))))))

(deftest ^:parallel upstream-deps-dashboard-with-series-test
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        orders-id (mt/id :orders)
        products (lib.metadata/table mp products-id)
        orders (lib.metadata/table mp orders-id)]
    (mt/with-temp [:model/Card {main-card-id :id} {:dataset_query (lib/query mp products)}
                   :model/Card {series-card-id :id} {:dataset_query (lib/query mp orders)}
                   :model/Dashboard {dashboard-id :id :as dashboard} {}
                   :model/DashboardCard {dashcard-id :id} {:dashboard_id dashboard-id
                                                           :card_id main-card-id}
                   :model/DashboardCardSeries _ {:dashboardcard_id dashcard-id
                                                 :card_id series-card-id
                                                 :position 0}]
      (let [dashcards (t2/select :model/DashboardCard :dashboard_id dashboard-id)
            series-card-ids (when (seq dashcards)
                              (t2/select-fn-set :card_id :model/DashboardCardSeries
                                                :dashboardcard_id [:in (map :id dashcards)]))
            dashboard (assoc dashboard :dashcards dashcards :series-card-ids series-card-ids)]
        (is (= {:card #{main-card-id series-card-id}
                :dashboard #{}}
               (calculation/upstream-deps:dashboard dashboard)))))))

(deftest ^:parallel upstream-deps-dashboard-with-parameter-source-test
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        products (lib.metadata/table mp products-id)
        category-field (lib.metadata/field mp (mt/id :products :category))]
    (mt/with-temp [:model/Card {category-values-card-id :id} {:dataset_query (-> (lib/query mp products)
                                                                                 (lib/aggregate (lib/count))
                                                                                 (lib/breakout category-field))}
                   :model/Card {filtered-card-id :id} {:dataset_query (lib/query mp products)}
                   :model/Dashboard {dashboard-id :id} {:parameters [{:id "category-param"
                                                                      :type "category"
                                                                      :values_source_type "card"
                                                                      :values_source_config {:card_id category-values-card-id}}]}
                   :model/DashboardCard _ {:dashboard_id dashboard-id
                                           :card_id filtered-card-id}]
      (let [dashcards (t2/select :model/DashboardCard :dashboard_id dashboard-id)
            dashboard (-> (t2/select-one :model/Dashboard :id dashboard-id)
                          (assoc :dashcards dashcards))]
        (is (= {:card #{filtered-card-id category-values-card-id}
                :dashboard #{}}
               (calculation/upstream-deps:dashboard dashboard)))))))

(deftest ^:parallel upstream-deps-dashboard-with-click-behavior-test
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        products (lib.metadata/table mp products-id)]
    (mt/with-temp [:model/Card {count-card-id :id} {:dataset_query (-> (lib/query mp products)
                                                                       (lib/aggregate (lib/count)))
                                                    :display :scalar}
                   :model/Card {target-card-id :id} {:dataset_query (lib/query mp products)}
                   :model/Dashboard {dashboard-id :id} {}
                   :model/DashboardCard _ {:dashboard_id dashboard-id
                                           :card_id count-card-id
                                           :visualization_settings {:click_behavior {:type "link"
                                                                                     :linkType "question"
                                                                                     :targetId target-card-id}}}]
      (let [dashcards (t2/select :model/DashboardCard :dashboard_id dashboard-id)
            dashboard {:id dashboard-id
                       :dashcards dashcards}]
        (is (= {:card #{count-card-id target-card-id}
                :dashboard #{}}
               (calculation/upstream-deps:dashboard dashboard)))))))

(deftest ^:parallel upstream-deps-dashboard-with-column-click-behavior-test
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        products (lib.metadata/table mp products-id)
        category-field (lib.metadata/field mp (mt/id :products :category))]
    (mt/with-temp [:model/Card {table-card-id :id} {:dataset_query (-> (lib/query mp products)
                                                                       (lib/breakout category-field)
                                                                       (lib/aggregate (lib/count)))
                                                    :display :table}
                   :model/Card {target-card-id :id} {:dataset_query (lib/query mp products)}
                   :model/Dashboard {dashboard-id :id} {}
                   :model/DashboardCard _ {:dashboard_id dashboard-id
                                           :card_id table-card-id
                                           :visualization_settings {:column_settings {"[\"name\",\"CATEGORY\"]" {:click_behavior {:type "link"
                                                                                                                                  :linkType "question"
                                                                                                                                  :targetId target-card-id}}}}}]
      (let [dashcards (t2/select :model/DashboardCard :dashboard_id dashboard-id)
            dashboard {:id dashboard-id
                       :dashcards dashcards}]
        (is (= {:card #{table-card-id target-card-id}
                :dashboard #{}}
               (calculation/upstream-deps:dashboard dashboard)))))))

(deftest ^:parallel upstream-deps-dashboard-with-dashboard-click-behavior-test
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        products (lib.metadata/table mp products-id)]
    (mt/with-temp [:model/Card {count-card-id :id} {:dataset_query (-> (lib/query mp products)
                                                                       (lib/aggregate (lib/count)))
                                                    :display :scalar}
                   :model/Dashboard {target-dashboard-id :id} {}
                   :model/Dashboard {dashboard-id :id} {}
                   :model/DashboardCard _ {:dashboard_id dashboard-id
                                           :card_id count-card-id
                                           :visualization_settings {:click_behavior {:type "link"
                                                                                     :linkType "dashboard"
                                                                                     :targetId target-dashboard-id}}}]
      (let [dashcards (t2/select :model/DashboardCard :dashboard_id dashboard-id)
            dashboard {:id dashboard-id
                       :dashcards dashcards}]
        (is (= {:card #{count-card-id}
                :dashboard #{target-dashboard-id}}
               (calculation/upstream-deps:dashboard dashboard)))))))

(deftest ^:parallel upstream-deps-dashboard-with-column-dashboard-click-behavior-test
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        products (lib.metadata/table mp products-id)
        category-field (lib.metadata/field mp (mt/id :products :category))]
    (mt/with-temp [:model/Card {table-card-id :id} {:dataset_query (-> (lib/query mp products)
                                                                       (lib/breakout category-field)
                                                                       (lib/aggregate (lib/count)))
                                                    :display :table}
                   :model/Dashboard {target-dashboard-id :id} {}
                   :model/Dashboard {dashboard-id :id} {}
                   :model/DashboardCard _ {:dashboard_id dashboard-id
                                           :card_id table-card-id
                                           :visualization_settings {:column_settings {"[\"name\",\"CATEGORY\"]" {:click_behavior {:type "link"
                                                                                                                                  :linkType "dashboard"
                                                                                                                                  :targetId target-dashboard-id}}}}}]
      (let [dashcards (t2/select :model/DashboardCard :dashboard_id dashboard-id)
            dashboard {:id dashboard-id
                       :dashcards dashcards}]
        (is (= {:card #{table-card-id}
                :dashboard #{target-dashboard-id}}
               (calculation/upstream-deps:dashboard dashboard)))))))

(deftest ^:parallel upstream-deps-document-test
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        products (lib.metadata/table mp products-id)]
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                   :model/Card {embedded-card-id :id} {:dataset_query (lib/query mp products)}
                   :model/Dashboard {dashboard-id :id} {}
                   :model/Document document {:content_type "application/json+vnd.prose-mirror"
                                             :document {:type "doc"
                                                        :content [{:type "paragraph"
                                                                   :content [{:type "smartLink"
                                                                              :attrs {:entityId card-id
                                                                                      :model "card"}}
                                                                             {:type "smartLink"
                                                                              :attrs {:entityId dashboard-id
                                                                                      :model "dashboard"}}
                                                                             {:type "smartLink"
                                                                              :attrs {:entityId products-id
                                                                                      :model "table"}}]}
                                                                  {:type "cardEmbed"
                                                                   :attrs {:id embedded-card-id}}]}}]
      (is (= {:card #{card-id embedded-card-id}
              :dashboard #{dashboard-id}
              :table #{products-id}}
             (calculation/upstream-deps:document document))))))

(deftest upstream-deps-sandbox-test
  (mt/with-premium-features #{:sandboxes}
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "sandbox group"}
                   :model/Card {sandbox-card-id :id} {}
                   :model/Sandbox sandbox {:group_id group-id
                                           :table_id (mt/id :products)
                                           :card_id sandbox-card-id}]
      (is (= {:card #{sandbox-card-id}}
             (calculation/upstream-deps:sandbox sandbox))))))

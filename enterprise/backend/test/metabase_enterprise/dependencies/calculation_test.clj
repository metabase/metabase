(ns metabase-enterprise.dependencies.calculation-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.calculation :as calculation]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util.notebook-helpers :as lib.tu.notebook]
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
              :measure #{}
              :segment #{}
              :table #{products-id}}
             (calculation/upstream-deps:card prod-card)))
      (is (= {:card #{prod-card-id}
              :measure #{}
              :segment #{}
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
              :measure #{}
              :segment #{}
              :table #{products-id}}
             (calculation/upstream-deps:card products-card)))
      (is (= {:card #{products-card-id}
              :measure #{}
              :segment #{}
              :table #{orders-id}}
             (calculation/upstream-deps:card joined-card))))))

(deftest ^:parallel upstream-deps-card-implicit-join-fields-test
  (let [mp (mt/metadata-provider)
        checkins-id (mt/id :checkins)
        venues-id (mt/id :venues)
        users-id (mt/id :users)
        checkins (lib.metadata/table mp checkins-id)
        base-query (lib/query mp checkins)
        visible-cols (lib/visible-columns base-query)
        venue-name (lib.tu.notebook/find-col-with-spec base-query visible-cols "Venue" "Name")
        user-name (lib.tu.notebook/find-col-with-spec base-query visible-cols "User" "Name")]
    (mt/with-temp [:model/Card card {:dataset_query (lib/with-fields base-query [venue-name user-name])}]
      (is (= {:card #{}
              :measure #{}
              :segment #{}
              :table #{checkins-id venues-id users-id}}
             (calculation/upstream-deps:card card))))))

(deftest ^:parallel upstream-deps-card-implicit-join-filter-test
  (let [mp (mt/metadata-provider)
        checkins-id (mt/id :checkins)
        venues-id (mt/id :venues)
        checkins (lib.metadata/table mp checkins-id)
        base-query (lib/query mp checkins)
        filterable-cols (lib/filterable-columns base-query)
        venue-name (lib.tu.notebook/find-col-with-spec base-query filterable-cols "Venue" "Name")]
    (mt/with-temp [:model/Card card {:dataset_query (lib/filter base-query (lib/= venue-name "Bird's Nest"))}]
      (is (= {:card #{}
              :measure #{}
              :segment #{}
              :table #{checkins-id venues-id}}
             (calculation/upstream-deps:card card))))))

(deftest ^:parallel upstream-deps-card-implicit-join-breakout-test
  (let [mp (mt/metadata-provider)
        checkins-id (mt/id :checkins)
        venues-id (mt/id :venues)
        checkins (lib.metadata/table mp checkins-id)
        base-query (lib/query mp checkins)
        breakoutable-cols (lib/breakoutable-columns base-query)
        venue-name (lib.tu.notebook/find-col-with-spec base-query breakoutable-cols "Venue" "Name")]
    (mt/with-temp [:model/Card card {:dataset_query (lib/breakout base-query venue-name)}]
      (is (= {:card #{}
              :measure #{}
              :segment #{}
              :table #{checkins-id venues-id}}
             (calculation/upstream-deps:card card))))))

(deftest ^:parallel upstream-deps-card-implicit-join-aggregation-test
  (let [mp (mt/metadata-provider)
        checkins-id (mt/id :checkins)
        venues-id (mt/id :venues)
        checkins (lib.metadata/table mp checkins-id)
        base-query (lib/query mp checkins)
        visible-cols (lib/visible-columns base-query)
        venue-price (lib.tu.notebook/find-col-with-spec base-query visible-cols "Venue" "Price")]
    (mt/with-temp [:model/Card card {:dataset_query (lib/aggregate base-query (lib/sum venue-price))}]
      (is (= {:card #{}
              :measure #{}
              :segment #{}
              :table #{checkins-id venues-id}}
             (calculation/upstream-deps:card card))))))

(deftest ^:parallel upstream-deps-card-implicit-join-order-by-test
  (let [mp (mt/metadata-provider)
        checkins-id (mt/id :checkins)
        venues-id (mt/id :venues)
        checkins (lib.metadata/table mp checkins-id)
        base-query (lib/query mp checkins)
        orderable-cols (lib/orderable-columns base-query)
        venue-name (lib.tu.notebook/find-col-with-spec base-query orderable-cols "Venue" "Name")]
    (mt/with-temp [:model/Card card {:dataset_query (lib/order-by base-query venue-name)}]
      (is (= {:card #{}
              :measure #{}
              :segment #{}
              :table #{checkins-id venues-id}}
             (calculation/upstream-deps:card card))))))

(deftest ^:parallel upstream-deps-transform-implicit-join-fields-test
  (mt/with-premium-features #{:transforms}
    (let [mp (mt/metadata-provider)
          checkins-id (mt/id :checkins)
          venues-id (mt/id :venues)
          users-id (mt/id :users)
          checkins (lib.metadata/table mp checkins-id)
          base-query (lib/query mp checkins)
          visible-cols (lib/visible-columns base-query)
          venue-name (lib.tu.notebook/find-col-with-spec base-query visible-cols "Venue" "Name")
          user-name (lib.tu.notebook/find-col-with-spec base-query visible-cols "User" "Name")
          query (lib/with-fields base-query [venue-name user-name])]
      (mt/with-temp [:model/Transform transform {:name "Test Transform"
                                                 :source {:type :query
                                                          :query query}
                                                 :target {:schema "PUBLIC"
                                                          :name "test_output"}}]
        (is (= {:card #{}
                :measure #{}
                :segment #{}
                :table #{checkins-id venues-id users-id}}
               (calculation/upstream-deps:transform transform)))))))

(deftest ^:parallel upstream-deps-transform-implicit-join-breakout-test
  (mt/with-premium-features #{:transforms}
    (let [mp (mt/metadata-provider)
          checkins-id (mt/id :checkins)
          venues-id (mt/id :venues)
          checkins (lib.metadata/table mp checkins-id)
          base-query (lib/query mp checkins)
          breakoutable-cols (lib/breakoutable-columns base-query)
          venue-name (lib.tu.notebook/find-col-with-spec base-query breakoutable-cols "Venue" "Name")
          query (-> base-query
                    (lib/breakout venue-name)
                    (lib/aggregate (lib/count)))]
      (mt/with-temp [:model/Transform transform {:name "Test Transform"
                                                 :source {:type :query
                                                          :query query}
                                                 :target {:schema "PUBLIC"
                                                          :name "test_output"}}]
        (is (= {:card #{}
                :measure #{}
                :segment #{}
                :table #{checkins-id venues-id}}
               (calculation/upstream-deps:transform transform)))))))

(deftest ^:parallel upstream-deps-transform-implicit-join-aggregation-test
  (mt/with-premium-features #{:transforms}
    (let [mp (mt/metadata-provider)
          checkins-id (mt/id :checkins)
          venues-id (mt/id :venues)
          checkins (lib.metadata/table mp checkins-id)
          base-query (lib/query mp checkins)
          visible-cols (lib/visible-columns base-query)
          venue-price (lib.tu.notebook/find-col-with-spec base-query visible-cols "Venue" "Price")
          query (-> base-query
                    (lib/aggregate (lib/sum venue-price)))]
      (mt/with-temp [:model/Transform transform {:name "Test Transform"
                                                 :source {:type :query
                                                          :query query}
                                                 :target {:schema "PUBLIC"
                                                          :name "test_output"}}]
        (is (= {:card #{}
                :measure #{}
                :segment #{}
                :table #{checkins-id venues-id}}
               (calculation/upstream-deps:transform transform)))))))

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
              :measure #{}
              :segment #{}
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

(deftest ^:parallel upstream-deps-segment-test
  (let [products-id (mt/id :products)
        price-field-id (mt/id :products :price)
        category-field-id (mt/id :products :category)]
    (testing "segment depending only on table"
      (mt/with-temp [:model/Segment segment {:table_id products-id
                                             :definition {:filter [:> [:field price-field-id nil] 50]}}]
        (is (= {:segment #{} :table #{products-id}}
               (calculation/upstream-deps:segment segment)))))

    (testing "segment depending on another segment"
      (mt/with-temp [:model/Segment {segment-a-id :id :as segment-a} {:table_id products-id
                                                                      :definition {:filter [:> [:field price-field-id nil] 50]}}
                     :model/Segment segment-b {:table_id products-id
                                               :definition {:filter [:and
                                                                     [:segment segment-a-id]
                                                                     [:= [:field category-field-id nil] "Widget"]]}}]
        (testing "base segment depends only on table"
          (is (= {:segment #{} :table #{products-id}}
                 (calculation/upstream-deps:segment segment-a))))
        (testing "dependent segment depends on both table and segment"
          (is (= {:table #{products-id}
                  :segment #{segment-a-id}}
                 (calculation/upstream-deps:segment segment-b))))))))

(deftest ^:parallel upstream-deps-card-with-multiple-segments-test
  (testing "Card using multiple segments depends on all of them"
    (let [products-id (mt/id :products)
          price-field-id (mt/id :products :price)
          category-field-id (mt/id :products :category)]
      (mt/with-temp [:model/Segment {segment-a-id :id} {:table_id products-id
                                                        :definition {:filter [:> [:field price-field-id nil] 50]}}
                     :model/Segment {segment-b-id :id} {:table_id products-id
                                                        :definition {:filter [:= [:field category-field-id nil] "Widget"]}}
                     :model/Card card {:dataset_query {:database (mt/id)
                                                       :type :query
                                                       :query {:source-table products-id
                                                               :filter [:and
                                                                        [:segment segment-a-id]
                                                                        [:segment segment-b-id]]}}}]
        (is (= {:card #{}
                :measure #{}
                :segment #{segment-a-id segment-b-id}
                :table #{products-id}}
               (calculation/upstream-deps:card card)))))))

(deftest ^:parallel upstream-deps-segment-with-multiple-segments-test
  (testing "Segment depending on multiple other segments tracks all dependencies"
    (let [products-id (mt/id :products)
          price-field-id (mt/id :products :price)
          category-field-id (mt/id :products :category)
          rating-field-id (mt/id :products :rating)]
      (mt/with-temp [:model/Segment {segment-a-id :id} {:table_id products-id
                                                        :definition {:filter [:> [:field price-field-id nil] 50]}}
                     :model/Segment {segment-b-id :id} {:table_id products-id
                                                        :definition {:filter [:= [:field category-field-id nil] "Widget"]}}
                     :model/Segment segment-c {:table_id products-id
                                               :definition {:filter [:and
                                                                     [:segment segment-a-id]
                                                                     [:segment segment-b-id]
                                                                     [:> [:field rating-field-id nil] 4]]}}]
        (is (= {:table #{products-id}
                :segment #{segment-a-id segment-b-id}}
               (calculation/upstream-deps:segment segment-c)))))))

(deftest ^:parallel upstream-deps-segment-implicit-join-test
  (testing "Segment depending on implicitly joined field adds dep on that field's table"
    (let  [checkins-id (mt/id :checkins)
           venues-id (mt/id :venues)
           venue-fk-field-id (mt/id :checkins :venue_id)
           venue-name-field-id (mt/id :venues :name)]
      (mt/with-temp [:model/Segment segment {:table_id checkins-id
                                             :definition {:filter [:= [:field venue-name-field-id {:source-field venue-fk-field-id}] "Bird's Nest"]}}]
        (is (= {:segment #{}
                :table #{checkins-id venues-id}}
               (calculation/upstream-deps:segment segment)))))))

(deftest upstream-deps-measure-test
  (let [mp (mt/metadata-provider)
        orders-id (mt/id :orders)
        orders (lib.metadata/table mp orders-id)
        quantity (lib.metadata/field mp (mt/id :orders :quantity))]
    (testing "measure depending only on table"
      (mt/with-temp [:model/Measure measure {:name "Total Quantity"
                                             :table_id orders-id
                                             :definition (-> (lib/query mp orders)
                                                             (lib/aggregate (lib/sum quantity)))}]
        (is (= {:measure #{} :segment #{} :table #{orders-id}}
               (calculation/upstream-deps:measure measure)))))

    (testing "measure depending on another measure"
      (mt/with-temp [:model/Measure {measure-a-id :id :as measure-a} {:name "Measure A"
                                                                      :table_id orders-id
                                                                      :definition (-> (lib/query mp orders)
                                                                                      (lib/aggregate (lib/sum quantity)))}]
        (let [mp' (mt/metadata-provider)]
          (mt/with-temp [:model/Measure measure-b {:name "Measure B"
                                                   :table_id orders-id
                                                   :definition (-> (lib/query mp' orders)
                                                                   (lib/aggregate (lib/+ (lib.metadata/measure mp' measure-a-id) 100)))}]
            (testing "base measure depends only on table"
              (is (= {:measure #{} :segment #{} :table #{orders-id}}
                     (calculation/upstream-deps:measure measure-a))))
            (testing "dependent measure depends on both table and measure"
              (is (= {:measure #{measure-a-id} :segment #{} :table #{orders-id}}
                     (calculation/upstream-deps:measure measure-b))))))))))

(deftest upstream-deps-measure-with-multiple-measures-test
  (testing "Measure depending on multiple other measures tracks all dependencies"
    (let [mp (mt/metadata-provider)
          orders-id (mt/id :orders)
          orders (lib.metadata/table mp orders-id)
          quantity (lib.metadata/field mp (mt/id :orders :quantity))
          total (lib.metadata/field mp (mt/id :orders :total))]
      (mt/with-temp [:model/Measure {measure-a-id :id} {:name "Measure A"
                                                        :table_id orders-id
                                                        :definition (-> (lib/query mp orders)
                                                                        (lib/aggregate (lib/sum quantity)))}
                     :model/Measure {measure-b-id :id} {:name "Measure B"
                                                        :table_id orders-id
                                                        :definition (-> (lib/query mp orders)
                                                                        (lib/aggregate (lib/sum total)))}]
        (let [mp' (mt/metadata-provider)]
          (mt/with-temp [:model/Measure measure-c {:name "Measure C"
                                                   :table_id orders-id
                                                   :definition (-> (lib/query mp' orders)
                                                                   (lib/aggregate (lib/+ (lib.metadata/measure mp' measure-a-id)
                                                                                         (lib.metadata/measure mp' measure-b-id))))}]
            (is (= {:measure #{measure-a-id measure-b-id} :segment #{} :table #{orders-id}}
                   (calculation/upstream-deps:measure measure-c)))))))))

(deftest upstream-deps-measure-implicit-join-test
  (testing "Measure depending on implicitly joined field adds dep on that field's table"
    (let [mp (mt/metadata-provider)
          checkins-id (mt/id :checkins)
          venues-id (mt/id :venues)
          checkins (lib.metadata/table mp checkins-id)
          base-query (lib/query mp checkins)
          visible-cols (lib/visible-columns base-query)
          venue-price (lib.tu.notebook/find-col-with-spec base-query visible-cols "Venue" "Price")]
      (mt/with-temp [:model/Measure measure {:name "Total Venue Price"
                                             :table_id checkins-id
                                             :definition (lib/aggregate base-query (lib/sum venue-price))}]
        (is (= {:measure #{} :segment #{} :table #{checkins-id venues-id}}
               (calculation/upstream-deps:measure measure)))))))

(deftest upstream-deps-card-with-measure-test
  (testing "Card using a measure depends on that measure"
    (let [mp (mt/metadata-provider)
          orders-id (mt/id :orders)
          orders (lib.metadata/table mp orders-id)
          quantity (lib.metadata/field mp (mt/id :orders :quantity))]
      (mt/with-temp [:model/Measure {measure-id :id} {:name "Total Quantity"
                                                      :table_id orders-id
                                                      :definition (-> (lib/query mp orders)
                                                                      (lib/aggregate (lib/sum quantity)))}]
        (let [mp' (mt/metadata-provider)]
          (mt/with-temp [:model/Card card {:dataset_query (-> (lib/query mp' orders)
                                                              (lib/aggregate (lib.metadata/measure mp' measure-id)))}]
            (is (= {:card #{} :measure #{measure-id} :segment #{} :table #{orders-id}}
                   (calculation/upstream-deps:card card)))))))))

(deftest upstream-deps-measure-with-segment-test
  (testing "Measure with conditional aggregation using segment depends on that segment"
    (let [mp (mt/metadata-provider)
          orders-id (mt/id :orders)
          orders (lib.metadata/table mp orders-id)
          quantity (lib.metadata/field mp (mt/id :orders :quantity))
          total-field-id (mt/id :orders :total)]
      (mt/with-temp [:model/Segment {segment-id :id} {:table_id orders-id
                                                      :definition {:filter [:> [:field total-field-id nil] 100]}}]
        (let [mp' (mt/metadata-provider)
              segment-meta (lib.metadata/segment mp' segment-id)]
          (mt/with-temp [:model/Measure measure {:name "Quantity Where Total > 100"
                                                 :table_id orders-id
                                                 :definition (-> (lib/query mp' orders)
                                                                 (lib/aggregate (lib/sum-where quantity (lib/ref segment-meta))))}]
            (is (= {:measure #{} :segment #{segment-id} :table #{orders-id}}
                   (calculation/upstream-deps:measure measure)))))))))

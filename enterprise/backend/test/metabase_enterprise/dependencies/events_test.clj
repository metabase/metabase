(ns metabase-enterprise.dependencies.events-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest dashboard-update-sets-correct-dependencies
  (mt/with-test-user :rasta
    (let [mp (mt/metadata-provider)
          products-id (mt/id :products)
          orders-id (mt/id :orders)
          products (lib.metadata/table mp products-id)
          orders (lib.metadata/table mp orders-id)
          category-field (lib.metadata/field mp (mt/id :products :category))]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp  [:model/Card {basic-card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Card {series-card-id :id} {:dataset_query (lib/query mp orders)}
                        :model/Card {param-source-card-id :id} {:dataset_query (-> (lib/query mp products)
                                                                                   (lib/aggregate (lib/count))
                                                                                   (lib/breakout category-field))}
                        :model/Dashboard {dashboard-id :id :as dashboard} {:parameters [{:id "category-param"
                                                                                         :type "category"
                                                                                         :values_source_type "card"
                                                                                         :values_source_config {:card_id param-source-card-id}}]}
                        :model/DashboardCard {basic-dashcard-id :id} {:dashboard_id dashboard-id
                                                                      :card_id basic-card-id}
                        :model/DashboardCardSeries _ {:dashboardcard_id basic-dashcard-id
                                                      :card_id series-card-id
                                                      :position 0}]
          (events/publish-event! :event/dashboard-create {:object dashboard :user-id api/*current-user-id*})
          (is (=? #{{:from_entity_type :dashboard
                     :from_entity_id dashboard-id
                     :to_entity_type :card
                     :to_entity_id basic-card-id}
                    {:from_entity_type :dashboard
                     :from_entity_id dashboard-id
                     :to_entity_type :card
                     :to_entity_id series-card-id}
                    {:from_entity_type :dashboard
                     :from_entity_id dashboard-id
                     :to_entity_type :card
                     :to_entity_id param-source-card-id}}
                  (into #{} (map #(dissoc % :id)
                                 (t2/select :model/Dependency :from_entity_id dashboard-id)))))
          (t2/delete! :model/DashboardCard :id basic-dashcard-id)
          (t2/update! :model/Dashboard dashboard-id {:parameters []})
          (mt/with-temp [:model/Card {scalar-card-id :id} {:dataset_query (-> (lib/query mp products)
                                                                              (lib/aggregate (lib/count)))
                                                           :display :scalar}
                         :model/Card {scalar-click-target-card-id :id} {:dataset_query (lib/query mp products)}
                         :model/DashboardCard _ {:dashboard_id dashboard-id
                                                 :card_id scalar-card-id
                                                 :visualization_settings {:click_behavior {:type "link"
                                                                                           :linkType "question"
                                                                                           :targetId scalar-click-target-card-id}}}
                         :model/Card {scalar-card-2-id :id} {:dataset_query (-> (lib/query mp orders)
                                                                                (lib/aggregate (lib/count)))
                                                             :display :scalar}
                         :model/Dashboard {scalar-click-target-dashboard-id :id} {}
                         :model/DashboardCard _ {:dashboard_id dashboard-id
                                                 :card_id scalar-card-2-id
                                                 :visualization_settings {:click_behavior {:type "link"
                                                                                           :linkType "dashboard"
                                                                                           :targetId scalar-click-target-dashboard-id}}}
                         :model/Card {table-card-id :id} {:dataset_query (-> (lib/query mp products)
                                                                             (lib/breakout category-field)
                                                                             (lib/aggregate (lib/count)))
                                                          :display :table}
                         :model/Card {column-click-target-card-id :id} {:dataset_query (lib/query mp products)}
                         :model/DashboardCard _ {:dashboard_id dashboard-id
                                                 :card_id table-card-id
                                                 :visualization_settings {:column_settings {"[\"name\",\"CATEGORY\"]" {:click_behavior {:type "link"
                                                                                                                                        :linkType "question"
                                                                                                                                        :targetId column-click-target-card-id}}}}}
                         :model/Dashboard {column-click-target-dashboard-id :id} {}
                         :model/Card {table-card-2-id :id} {:dataset_query (-> (lib/query mp orders)
                                                                               (lib/breakout category-field)
                                                                               (lib/aggregate (lib/count)))
                                                            :display :table}
                         :model/DashboardCard _ {:dashboard_id dashboard-id
                                                 :card_id table-card-2-id
                                                 :visualization_settings {:column_settings {"[\"name\",\"CATEGORY\"]" {:click_behavior {:type "link"
                                                                                                                                        :linkType "dashboard"
                                                                                                                                        :targetId column-click-target-dashboard-id}}}}}]
            (let [updated-dashboard (t2/select-one :model/Dashboard :id dashboard-id)]
              (events/publish-event! :event/dashboard-update {:object updated-dashboard :user-id api/*current-user-id*})
              (is (=? #{{:from_entity_type :dashboard
                         :from_entity_id dashboard-id
                         :to_entity_type :card
                         :to_entity_id scalar-card-id}
                        {:from_entity_type :dashboard
                         :from_entity_id dashboard-id
                         :to_entity_type :card
                         :to_entity_id scalar-click-target-card-id}
                        {:from_entity_type :dashboard
                         :from_entity_id dashboard-id
                         :to_entity_type :card
                         :to_entity_id scalar-card-2-id}
                        {:from_entity_type :dashboard
                         :from_entity_id dashboard-id
                         :to_entity_type :dashboard
                         :to_entity_id scalar-click-target-dashboard-id}
                        {:from_entity_type :dashboard
                         :from_entity_id dashboard-id
                         :to_entity_type :card
                         :to_entity_id table-card-id}
                        {:from_entity_type :dashboard
                         :from_entity_id dashboard-id
                         :to_entity_type :card
                         :to_entity_id column-click-target-card-id}
                        {:from_entity_type :dashboard
                         :from_entity_id dashboard-id
                         :to_entity_type :card
                         :to_entity_id table-card-2-id}
                        {:from_entity_type :dashboard
                         :from_entity_id dashboard-id
                         :to_entity_type :dashboard
                         :to_entity_id column-click-target-dashboard-id}}
                      (into #{} (map #(dissoc % :id)
                                     (t2/select :model/Dependency :from_entity_id dashboard-id)))))
              (t2/delete! :model/Dashboard dashboard-id)
              (events/publish-event! :event/dashboard-delete {:object updated-dashboard :user-id api/*current-user-id*})
              (is (empty? (t2/select :model/Dependency :from_entity_id dashboard-id))))))))))


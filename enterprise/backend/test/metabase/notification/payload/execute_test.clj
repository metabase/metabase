(ns metabase.notification.payload.execute-test
  (:require
   [clojure.test :refer :all]
   [metabase.notification.payload.execute :as notification.payload.execute]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest viz-settings-is-correctly-returned
  (testing (str "2 questions with the same query but different viz-settings on a dashboard "
                "with caching enabled should returns the correct viz-settings #57793")
    (let [query (mt/mbql-query orders {:aggregation [[:count]
                                                     [:sum $total]]})
          result-for-dashcard (fn [dashboard-id dashcard-id card-id]
                                (-> (mt/as-admin
                                      (notification.payload.execute/execute-dashboard-subscription-card
                                       {:dashboard_id dashboard-id
                                        :card_id      card-id
                                        :id           dashcard-id}
                                       []))
                                    :result))
          result-for-card (fn [card-id]
                            (-> (notification.payload.execute/execute-card
                                 (mt/user->id :crowberto)
                                 card-id)
                                :result))]
      (t2/delete! :model/QueryCache)
      (mt/with-premium-features #{:cache-granular-controls}
        (mt/with-temp
          ;; Card 1 has count hidden, sum visible
          [:model/Card {card-1 :id}              {:dataset_query query
                                                  :visualization_settings
                                                  {:table.cell_column "count", :table.columns [{:name "count", :enabled false} {:name "sum", :enabled true}]}}
           ;; Card 2 has count visible, sum hidden
           :model/Card {card-2 :id}              {:dataset_query query
                                                  :visualization_settings
                                                  {:table.cell_column "count", :table.columns [{:name "count", :enabled true} {:name "sum", :enabled false}]}}
           :model/Dashboard {dashboard-id :id}   {}
           :model/DashboardCard {dashcard-1 :id} {:dashboard_id dashboard-id
                                                  :card_id     card-1}
           :model/DashboardCard {dashcard-2 :id} {:dashboard_id dashboard-id
                                                  :card_id     card-2}
           :model/CacheConfig _                  {:model    "database"
                                                  :model_id (mt/id)
                                                  :strategy :duration
                                                  :config   {:unit    :hours
                                                             :duration 1}}]
          (testing "Card 1 has count hidden and sum visible"
            (is (=? {:cached nil?
                     :data {:viz-settings {:metabase.models.visualization-settings/table-columns
                                           [{:metabase.models.visualization-settings/table-column-enabled false
                                             :metabase.models.visualization-settings/table-column-name "count"}
                                            {:metabase.models.visualization-settings/table-column-enabled true
                                             :metabase.models.visualization-settings/table-column-name "sum"}]}}}
                    (result-for-dashcard dashboard-id dashcard-1 card-1)))
            (is (=? {:cached some?
                     :data {:viz-settings {:metabase.models.visualization-settings/table-columns
                                           [{:metabase.models.visualization-settings/table-column-enabled true
                                             :metabase.models.visualization-settings/table-column-name "count"}
                                            {:metabase.models.visualization-settings/table-column-enabled false
                                             :metabase.models.visualization-settings/table-column-name "sum"}]}}}
                    (result-for-dashcard dashboard-id dashcard-2 card-2))))
          (testing "Card 2 has count visible and sum hidden"
            (is (=? {:cached some?
                     :data {:viz-settings {:metabase.models.visualization-settings/table-columns
                                           [{:metabase.models.visualization-settings/table-column-enabled false
                                             :metabase.models.visualization-settings/table-column-name "count"}
                                            {:metabase.models.visualization-settings/table-column-enabled true
                                             :metabase.models.visualization-settings/table-column-name "sum"}]}}}
                    (result-for-card card-1)))
            (is (=? {:cached some?
                     :data {:viz-settings {:metabase.models.visualization-settings/table-columns
                                           [{:metabase.models.visualization-settings/table-column-enabled true
                                             :metabase.models.visualization-settings/table-column-name "count"}
                                            {:metabase.models.visualization-settings/table-column-enabled false
                                             :metabase.models.visualization-settings/table-column-name "sum"}]}}}
                    (result-for-card card-2)))))))))

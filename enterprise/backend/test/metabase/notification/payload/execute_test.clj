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

(deftest viz-settings-reflect-card-edit-after-cache-hit-test
  (testing (str "Editing a card's visualization_settings after its query has been cached should "
                "produce current viz-settings on subsequent subscription runs, not the stale "
                "cached ones (#72922 / GDGT-2327)")
    (let [query            (mt/mbql-query orders {:aggregation [[:count] [:sum $total]]})
          initial-setting  {:table.cell_column "count"
                            :table.columns     [{:name "count"   :enabled true}
                                                {:name "sum"     :enabled true}
                                                {:name "extra-1" :enabled true}
                                                {:name "extra-2" :enabled true}]}
          edited-setting   {:table.cell_column "count"
                            :table.columns     [{:name "count" :enabled true}
                                                {:name "sum"   :enabled true}]}
          table-columns-of (fn [result]
                             (get-in result [:data :viz-settings
                                             :metabase.models.visualization-settings/table-columns]))]
      (t2/delete! :model/QueryCache)
      (mt/with-premium-features #{:cache-granular-controls}
        (mt/with-temp
          [:model/Card          {card-id :id} {:dataset_query          query
                                               :visualization_settings initial-setting}
           :model/Dashboard     {dash-id :id} {}
           :model/DashboardCard {dc-id :id}   {:dashboard_id dash-id :card_id card-id}
           :model/CacheConfig   _             {:model    "database"
                                               :model_id (mt/id)
                                               :strategy :duration
                                               :config   {:unit :hours :duration 1}}]
          (let [dashcard {:dashboard_id dash-id :card_id card-id :id dc-id}
                run-sub! (fn [] (:result (mt/as-admin
                                           (notification.payload.execute/execute-dashboard-subscription-card
                                            dashcard []))))]
            (testing "initial run populates cache with four columns"
              (let [result (run-sub!)]
                (is (= 4 (count (table-columns-of result))))
                (is (pos? (t2/count :model/QueryCache))
                    "The query should have been cached")))
            (t2/update! :model/Card card-id {:visualization_settings edited-setting})
            (testing "after card edit, cache-hit run reflects the two-column setting"
              (let [result (run-sub!)]
                (is (= 2 (count (table-columns-of result))))
                (is (= ["count" "sum"]
                       (map :metabase.models.visualization-settings/table-column-name
                            (table-columns-of result))))))))))))

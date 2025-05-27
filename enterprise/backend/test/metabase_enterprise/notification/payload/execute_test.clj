(ns metabase-enterprise.notification.payload.execute-test
  (:require
   [clojure.test :refer :all]
   [metabase.notification.payload.execute :as notification.payload.execute]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest viz-settings-is-correctly-returned
  (testing (str "2 questions with the same query but different viz-settings on a dashboard "
                "with caching enabled should returns the correct viz-settings #57793")
    (let [query (mt/mbql-query orders {:limit 1})
          viz-settings-for-dashcard (fn [dashboard-id dashcard-id card-id]
                                      (-> (mt/as-admin
                                            (notification.payload.execute/execute-dashboard-subscription-card
                                             {:dashboard_id dashboard-id
                                              :card_id      card-id
                                              :id           dashcard-id}
                                             []))
                                          :result
                                          :data
                                          :viz-settings :ver))
          viz-settings-for-card (fn [card-id]
                                  (-> (notification.payload.execute/execute-card
                                       (mt/user->id :crowberto)
                                       card-id)
                                      :result
                                      :data
                                      :viz-settings :ver))]
      (t2/delete! :model/QueryCache)
      (mt/with-temp
        [:model/Card {card-1 :id}              {:dataset_query query
                                                :visualization_settings {:ver 1}}
         :model/Card {card-2 :id}              {:dataset_query query
                                                :visualization_settings {:ver 2}}
         :model/Dashboard {dashboard-id :id}   {}
         :model/DashboardCard {dashcard-1 :id} {:dashboard_id dashboard-id
                                                :card_id     card-1}
         :model/DashboardCard {dashcard-2 :id} {:dashboard_id dashboard-id
                                                :card_id     card-2}
         :model/CacheConfig _                  {:model    "dashboard"
                                                :model_id dashboard-id
                                                :strategy :duration
                                                :config   {:unit    :hours
                                                           :duration 1}}]
        (is (= 1 (viz-settings-for-dashcard dashboard-id dashcard-1 card-1)))
        (is (= 1 (viz-settings-for-card card-1)))
        (testing "card 2 should have viz-settings is 2"
          (is (= 2 (viz-settings-for-card card-2)))
          (is (= 2 (viz-settings-for-dashcard dashboard-id dashcard-2 card-2))))))))

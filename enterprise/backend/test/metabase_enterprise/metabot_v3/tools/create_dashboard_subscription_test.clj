(ns metabase-enterprise.metabot-v3.tools.create-dashboard-subscription-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription
    :as metabot-v3.tools.create-dashboard-subscription]
   [metabase.api.common :as api]
   [metabase.test :as mt]))

(deftest create-dashboard-subscription-test
  (mt/with-model-cleanup [:model/Pulse]
    (mt/with-temp [:model/User          {:keys [email] user-id :id} {:email "email@example.com"}
                   :model/Collection    {collection-id :id} {}
                   :model/Dashboard     {dashboard-id :id} {:collection_id collection-id}
                   :model/Card          {card-id-0 :id} {}
                   :model/DashboardTab  {dashboard-tab-id-0 :id} {:dashboard_id dashboard-id
                                                                  :position 0}
                   :model/DashboardCard _normal-dashcard-0 {:dashboard_id dashboard-id
                                                            :card_id card-id-0
                                                            :dashboard_tab_id dashboard-tab-id-0
                                                            :row 1
                                                            :col 0}
                   :model/Card          {card-id-1 :id} {}
                   :model/DashboardTab  {dashboard-tab-id-1 :id} {:dashboard_id dashboard-id
                                                                  :position 1}
                   :model/DashboardCard _normal-dashcard-1 {:dashboard_id dashboard-id
                                                            :card_id card-id-1
                                                            :dashboard_tab_id dashboard-tab-id-1
                                                            :row 2
                                                            :col 3}
                   :model/DashboardCard _cardless-dashcard {:dashboard_id dashboard-id
                                                            :dashboard_tab_id dashboard-tab-id-0
                                                            :row 0
                                                            :col 0}]
      (let [invoke-tool #(binding [api/*current-user-id* user-id]
                           (metabot-v3.tools.create-dashboard-subscription/create-dashboard-subscription %))
            base-data {:dashboard-id dashboard-id
                       :email email
                       :schedule {:frequency "monthly"
                                  :day_of_month "last-sunday"
                                  :hour 7}}]
        (testing "Subscription can be created"
          (is (= {:output "success"}
                 (invoke-tool base-data))))
        (testing "Return an error message if the user cannot be found"
          (is (= {:output "no user with this email found"}
                 (invoke-tool (update base-data :email str ".hu")))))
        (testing "Return an error message if the dashboard-id is invalid"
          (is (= {:output "invalid dashboard_id"}
                 (invoke-tool (update base-data :dashboard-id str)))))
        (testing "Return an error message if the dashboard cannot be found"
          (is (= {:output "no dashboard with this dashboard_id found"}
                 (invoke-tool (update base-data :dashboard-id -)))))))))

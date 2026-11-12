(ns metabase.dashboards.write-test
  (:require
   [clojure.test :refer :all]
   [metabase.dashboards.write :as dashboards.write]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private new-dashcard
  {:id -1 :row 0 :col 0 :size_x 4 :size_y 4})

(deftest update-dashboard!-restores-and-saves-dashcards-test
  (testing "A save with `:archived false` and `:dashcards` restores the dashboard and saves the cards (BOT-2578)"
    (mt/with-temp [:model/Card      {card-id :id}      {}
                   :model/Dashboard {dashboard-id :id} {:archived true}]
      (mt/with-current-user (mt/user->id :crowberto)
        (dashboards.write/update-dashboard!
         dashboard-id
         {:archived false :dashcards [(assoc new-dashcard :card_id card-id)] :tabs []}))
      (is (=? {:archived  false
               :dashcards [{:card_id card-id}]}
              (-> (t2/select-one :model/Dashboard :id dashboard-id)
                  (t2/hydrate :dashcards)))))))

(deftest update-dashboard!-refuses-dashcards-on-trashed-dashboard-test
  (testing "A save with `:dashcards` but no restore still fails on an archived dashboard"
    (mt/with-temp [:model/Card      {card-id :id}      {}
                   :model/Dashboard {dashboard-id :id} {:archived true}]
      (mt/with-current-user (mt/user->id :crowberto)
        (is (=? {:status-code 404 :error_code "archived"}
                (try
                  (dashboards.write/update-dashboard!
                   dashboard-id
                   {:dashcards [(assoc new-dashcard :card_id card-id)] :tabs []})
                  (catch clojure.lang.ExceptionInfo e
                    (ex-data e)))))
        (is (= 0 (t2/count :model/DashboardCard :dashboard_id dashboard-id)))))))

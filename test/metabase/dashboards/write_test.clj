(ns metabase.dashboards.write-test
  (:require
   [clojure.test :refer :all]
   [metabase.dashboards.write :as dashboards.write]
   [metabase.lib.core :as lib]
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

(deftest copy-dashboard!-with-dashboard-questions-records-two-revisions-test
  (testing "Copying a Dashboard that holds a dashboard question creates the bare Dashboard, then its cards, then its parts: two Revisions, one audit row for the cards"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Dashboard     {from-id :id}     {}
                     :model/Card          {question-id :id} {:dashboard_id  from-id
                                                             :database_id   (mt/id)
                                                             :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1")}
                     :model/DashboardCard _                 {:dashboard_id from-id :card_id question-id}]
        (mt/with-model-cleanup [:model/Card :model/Dashboard :model/DashboardCard :model/Revision :model/AuditLog]
          (mt/with-current-user (mt/user->id :crowberto)
            (let [{copy-id :id} (dashboards.write/copy-dashboard! from-id {:name "Copy" :is_deep_copy true})
                  revisions     (t2/select :model/Revision :model "Dashboard" :model_id copy-id {:order-by [[:id :asc]]})
                  copied-card   (t2/select-one-fn :card_id :model/DashboardCard :dashboard_id copy-id)
                  topics        (map :topic (t2/select :model/AuditLog :model "Dashboard" :model_id copy-id {:order-by [[:id :asc]]}))]
              (is (not= question-id copied-card))
              (is (=? [{:is_creation true :object {:cards empty?}}
                       {:is_creation false :object {:cards [{:card_id copied-card}]}}]
                      revisions))
              (is (= [:dashboard-create :dashboard-add-cards] topics)))))))))

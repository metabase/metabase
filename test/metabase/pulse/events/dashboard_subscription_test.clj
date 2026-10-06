(ns metabase.pulse.events.dashboard-subscription-test
  (:require
   [clojure.test :refer :all]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users :web-server))

(defn- push-dashboard-revision! [dashboard-id creation?]
  (revision/push-revision! {:entity       :model/Dashboard
                            :id           dashboard-id
                            :object       (t2/select-one :model/Dashboard :id dashboard-id)
                            :user-id      (mt/user->id :crowberto)
                            :is-creation? creation?}))

(defn- revert-to-first-revision! [dashboard-id]
  (let [first-rev-id (t2/select-one-pk :model/Revision :model "Dashboard" :model_id dashboard-id
                                       {:order-by [[:id :asc]]})]
    (mt/user-http-request :crowberto :post 200 "revision/revert"
                          {:entity "dashboard" :id dashboard-id :revision_id first-rev-id})))

(deftest dashboard-revert-that-adds-back-a-dashcard-adds-the-subscription-card-test
  (mt/with-model-cleanup [:model/PulseCard :model/DashboardCard]
    (mt/with-temp [:model/Card          {card-id :id}      {:name "Subscribed card"}
                   :model/Dashboard     {dashboard-id :id} {:name "Dashboard"}
                   :model/DashboardCard {dashcard-id :id}  {:dashboard_id dashboard-id :card_id card-id}]
      (push-dashboard-revision! dashboard-id true)
      (t2/delete! :model/DashboardCard :id dashcard-id)
      (push-dashboard-revision! dashboard-id false)
      (mt/with-temp [:model/Pulse {pulse-id :id} {:name "Dashboard" :dashboard_id dashboard-id}]
        (is (empty? (t2/select-fn-vec :card_id :model/PulseCard :pulse_id pulse-id)))
        (revert-to-first-revision! dashboard-id)
        (let [[new-dashcard-id :as dashcard-ids] (t2/select-pks-vec :model/DashboardCard :dashboard_id dashboard-id)]
          (testing "the revert adds back the dashcard"
            (is (= [card-id] (t2/select-fn-vec :card_id :model/DashboardCard :dashboard_id dashboard-id)))
            (is (= 1 (count dashcard-ids))))
          (testing "the subscription gets the card of the restored dashcard"
            (is (=? [{:card_id card-id :dashboard_card_id new-dashcard-id}]
                    (t2/select :model/PulseCard :pulse_id pulse-id)))))))))

(deftest dashboard-name-revert-updates-the-subscription-name-test
  (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Name one"}]
    (push-dashboard-revision! dashboard-id true)
    (t2/update! :model/Dashboard dashboard-id {:name "Name two"})
    (push-dashboard-revision! dashboard-id false)
    (mt/with-temp [:model/Pulse {pulse-id :id} {:name "Name two" :dashboard_id dashboard-id}]
      (revert-to-first-revision! dashboard-id)
      (testing "the revert restores the dashboard name"
        (is (= "Name one" (t2/select-one-fn :name :model/Dashboard :id dashboard-id))))
      (testing "the subscription gets the restored name"
        (is (= "Name one" (t2/select-one-fn :name :model/Pulse :id pulse-id)))))))

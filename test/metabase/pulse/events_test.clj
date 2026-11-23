(ns metabase.pulse.events-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.app-db.query :as mdb.query]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.pulse.events :as pulse.events]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest dashboard-writes-sync-subscriptions-test
  (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Before"}
                 :model/Card      {card-id :id}      {}
                 :model/Pulse     {pulse-id :id}     {:dashboard_id dashboard-id}]
    (testing "renaming the dashboard renames its subscriptions"
      (dashboard/update-dashboards! [{:id dashboard-id :name "After"}])
      (is (= "After" (t2/select-one-fn :name :model/Pulse :id pulse-id))))
    (testing "adding a dashcard adds its card to the subscriptions"
      (dashboard/update-dashboard! dashboard-id {:dashcards [{:id -1 :card_id card-id :row 0 :col 0 :size_x 4 :size_y 4}]})
      (is (= [card-id] (t2/select-fn-vec :card_id :model/PulseCard :pulse_id pulse-id))))))

(defn- sync-statement-count!
  "The number of statements that the subscription sync makes after `dashboard-count` Dashboards, each with a
  subscription, are renamed."
  [dashboard-count]
  (let [dashboards (t2/insert-returning-instances! :model/Dashboard
                                                   (vec (for [i (range dashboard-count)]
                                                          (assoc (mt/with-temp-defaults :model/Dashboard)
                                                                 :name (str "Before " i)))))]
    (try
      (t2/insert! :model/Pulse
                  (vec (for [{:keys [id name]} dashboards]
                         (assoc (mt/with-temp-defaults :model/Pulse) :dashboard_id id :name name))))
      (let [changes (vec (for [{:keys [id] :as before} dashboards]
                           (do
                             (t2/update! :model/Dashboard :id id {:name (str "After " id)})
                             {:previous-object before
                              :object          (t2/select-one :model/Dashboard :id id)})))]
        (u/prog1 (t2/with-call-count [call-count]
                   (#'pulse.events/sync-subscriptions! {:changes changes :user-id nil})
                   (call-count))
          (is (= (sort (map #(str "After " (:id %)) dashboards))
                 (sort (t2/select-fn-vec :name :model/Pulse :dashboard_id [:in (map :id dashboards)]))))))
      (finally
        (t2/delete! :model/Pulse :dashboard_id [:in (map :id dashboards)])
        (t2/delete! :model/Dashboard :id [:in (map :id dashboards)])))))

(deftest renaming-dashboards-syncs-subscriptions-in-fixed-statements-test
  (testing "the subscription sync makes the same number of statements for 2 and for 6 renamed Dashboards"
    (sync-statement-count! 1)
    (is (= (sync-statement-count! 2) (sync-statement-count! 6)))))

(deftest sync-handles-events-with-more-rows-than-one-batch-test
  (testing "every Dashboard of an event larger than one batch gets its subscriptions renamed"
    (let [unbatched (sync-statement-count! 5)]
      (with-redefs [mdb.query/update-partition-size 2
                    mdb.query/create-partition-size 2]
        (is (< unbatched (sync-statement-count! 5)))))))

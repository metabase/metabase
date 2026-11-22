(ns metabase.dashboards.models.dashboard-card-series-test
  (:require
   [clojure.test :refer :all]
   [metabase.dashboards.models.dashboard-card-series :as dashboard-card-series]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(deftest ^:parallel series-position-schema-test
  (testing "DashboardCardSeries has position that is not negative"
    (is (not (mr/validate ::dashboards.schema/dashboard-card-series.update {:id 1 :position -1})))
    (is (mr/validate ::dashboards.schema/dashboard-card-series.update {:id 1 :position 0}))))

(deftest series-dashcard-is-frozen-test
  (testing "DashboardCardSeries stays on its DashboardCard"
    (mt/with-temp [:model/Dashboard           dash     {}
                   :model/DashboardCard       dashcard {:dashboard_id (u/the-id dash)}
                   :model/DashboardCard       other    {:dashboard_id (u/the-id dash)}
                   :model/Card                card     {}
                   :model/DashboardCardSeries series   {:dashboardcard_id (u/the-id dashcard)
                                                        :card_id          (u/the-id card)
                                                        :position         0}]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"cannot move"
                            (t2/update! :model/DashboardCardSeries :id (u/the-id series) {:dashboardcard_id (u/the-id other)}))))))

(deftest series-position-is-unique-test
  (testing "Two series of a DashboardCard do not share a position"
    (mt/with-temp [:model/Dashboard           dash       {}
                   :model/DashboardCard       dashcard   {:dashboard_id (u/the-id dash)}
                   :model/Card                card       {}
                   :model/Card                other-card {}
                   :model/DashboardCardSeries _          {:dashboardcard_id (u/the-id dashcard)
                                                          :card_id          (u/the-id card)
                                                          :position         0}]
      (is (thrown? Exception
                   (t2/with-transaction [_conn]
                     (t2/insert! :model/DashboardCardSeries {:dashboardcard_id (u/the-id dashcard)
                                                             :card_id          (u/the-id other-card)
                                                             :position         0})))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Dashboard {dashboard-id :id} {}]
    (mt/with-model-cleanup [:model/DashboardCardSeries :model/DashboardCard :model/Card]
      (let [rows    (fn [n]
                      (let [dashcard-id (t2/insert-returning-pk! :model/DashboardCard
                                                                 (assoc (mt/with-temp-defaults :model/DashboardCard) :dashboard_id dashboard-id))]
                        (mapv (fn [i]
                                {:dashboardcard_id dashcard-id
                                 :card_id          (t2/insert-returning-pk! :model/Card (mt/with-temp-defaults :model/Card))
                                 :position         i})
                              (range n))))
            fresh!  (fn [n] (mapv :id (dashboard-card-series/create-dashboard-card-series! (rows n))))
            counted (fn [f]
                      (f 1)
                      (is (= (f 2) (f 6))))]
        (testing "creating series"
          (counted (fn [n] (let [rows (rows n)] (events.tu/statement-count! #(dashboard-card-series/create-dashboard-card-series! rows))))))
        (testing "updating series, some already holding the new value"
          (counted (fn [n]
                     (let [ids (fresh! n)]
                       (dashboard-card-series/update-dashboard-card-series! (mapv (fn [id] {:id id :card_id (t2/insert-returning-pk! :model/Card (mt/with-temp-defaults :model/Card))}) (take-nth 2 ids)))
                       (let [card-id (t2/insert-returning-pk! :model/Card (mt/with-temp-defaults :model/Card))]
                         (dashboard-card-series/update-dashboard-card-series! (mapv (fn [id] {:id id :card_id card-id}) (take-nth 2 ids)))
                         (events.tu/statement-count!
                          #(dashboard-card-series/update-dashboard-card-series! (mapv (fn [id] {:id id :card_id card-id}) ids))))))))
        (testing "deleting series"
          (counted (fn [n] (let [ids (fresh! n)] (events.tu/statement-count! #(dashboard-card-series/delete-dashboard-card-series! ids))))))))))

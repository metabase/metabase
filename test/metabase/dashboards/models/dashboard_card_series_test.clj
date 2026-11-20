(ns metabase.dashboards.models.dashboard-card-series-test
  (:require
   [clojure.test :refer :all]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.dashboards.write :as dashboards.write]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(deftest ^:parallel series-position-schema-test
  (testing "DashboardCardSeries has position that is not negative"
    (is (not (mr/validate ::dashboards.schema/dashboard-card-series.update {:position -1})))
    (is (mr/validate ::dashboards.schema/dashboard-card-series.update {:position 0}))))

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
                            (dashboards.write/update-dashcard-series! (u/the-id series) {:dashboardcard_id (u/the-id other)} {}))))))

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

(deftest update-dashcard-series-publishes-update-event-test
  (let [published (atom [])]
    (events/register-owned-consumer! ::series-events
                                     (fn [{:keys [model]}] (when (= :model/DashboardCardSeries model) :series))
                                     (fn [_owner events _all] (swap! published into events)))
    (try
      (mt/with-temp [:model/Dashboard           dash     {}
                     :model/DashboardCard       dashcard {:dashboard_id (u/the-id dash)}
                     :model/Card                card     {}
                     :model/DashboardCardSeries series   {:dashboardcard_id (u/the-id dashcard)
                                                          :card_id          (u/the-id card)
                                                          :position         0}]
        (reset! published [])
        (mt/with-test-user :crowberto
          (dashboards.write/update-dashcard-series! (:id series) {:position 1} {}))
        (testing "one update event with the row before and after the update"
          (is (=? [{:operation       :update
                    :id              (:id series)
                    :user-id         (mt/user->id :crowberto)
                    :previous-object {:position 0}
                    :object          {:position 1}}]
                  @published))))
      (finally
        (events.tu/unregister! ::series-events)))))

(deftest update-dashcard-series-query-count-test
  (testing "a warm update-dashcard-series! issues no more queries than master's t2/update! with the hooks, 8, the events consumers included"
    (mt/with-temp [:model/Dashboard           dash     {}
                   :model/DashboardCard       dashcard {:dashboard_id (u/the-id dash)}
                   :model/Card                card     {}
                   :model/DashboardCardSeries series   {:dashboardcard_id (u/the-id dashcard)
                                                        :card_id          (u/the-id card)
                                                        :position         0}]
      (mt/with-test-user :crowberto
        (binding [search.ingestion/*disable-updates* true]
          (dashboards.write/update-dashcard-series! (:id series) {:position 1} {})
          (t2/with-call-count [call-count]
            (dashboards.write/update-dashcard-series! (:id series) {:position 2} {})
            (is (<= (call-count) 8))))))))

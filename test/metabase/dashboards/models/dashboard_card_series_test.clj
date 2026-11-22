(ns metabase.dashboards.models.dashboard-card-series-test
  (:require
   [clojure.test :refer :all]
   [metabase.dashboards.schema :as dashboards.schema]
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

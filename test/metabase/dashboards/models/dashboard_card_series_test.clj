(ns metabase.dashboards.models.dashboard-card-series-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest check-series-columns-test
  (testing "A DashboardCardSeries has a position that is not negative and stays on its DashboardCard"
    (mt/with-temp [:model/Dashboard           dash       {}
                   :model/DashboardCard       dashcard   {:dashboard_id (u/the-id dash)}
                   :model/DashboardCard       other      {:dashboard_id (u/the-id dash)}
                   :model/Card                card       {}
                   :model/Card                other-card {}
                   :model/DashboardCardSeries series     {:dashboardcard_id (u/the-id dashcard)
                                                          :card_id          (u/the-id card)
                                                          :position         0}]
      (is (thrown? clojure.lang.ExceptionInfo
                   (t2/insert! :model/DashboardCardSeries {:dashboardcard_id (u/the-id dashcard)
                                                           :card_id          (u/the-id other-card)
                                                           :position         -1})))
      (is (thrown? clojure.lang.ExceptionInfo
                   (t2/update! :model/DashboardCardSeries :id (u/the-id series) {:position -1})))
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
                   (t2/insert! :model/DashboardCardSeries {:dashboardcard_id (u/the-id dashcard)
                                                           :card_id          (u/the-id other-card)
                                                           :position         0}))))))

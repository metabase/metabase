(ns metabase.dashboards.models.dashboard-card-checks-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- check-cost
  "Rasta's read checks of the first `n` of the DashboardCards with `ids`, selected without hydration in one request,
  and the number of queries the checks ran."
  [ids n]
  (request/with-current-user (mt/user->id :rasta)
    (let [dashcards (t2/select :model/DashboardCard :id [:in (take n ids)] {:order-by [[:id :asc]]})]
      (t2/with-call-count [call-count]
        [(mapv mi/can-read? dashcards) (call-count)]))))

(deftest dashcard-read-checks-test
  (testing "read checks of DashboardCards follow the collections of their Cards and series, and cost the same for two as for three"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection          readable   {}
                     :model/Collection          unreadable {}
                     :model/Dashboard           dashboard  {:collection_id (:id readable)}
                     :model/Card                k1 {:collection_id (:id readable)}
                     :model/Card                k2 {:collection_id (:id unreadable)}
                     :model/Card                k3 {:collection_id (:id readable)}
                     :model/Card                series-card {:collection_id (:id unreadable)}
                     :model/DashboardCard       dc1 {:dashboard_id (:id dashboard) :card_id (:id k1)}
                     :model/DashboardCard       dc2 {:dashboard_id (:id dashboard) :card_id (:id k2)}
                     :model/DashboardCard       dc3 {:dashboard_id (:id dashboard) :card_id (:id k3)}
                     :model/DashboardCardSeries _ {:dashboardcard_id (:id dc3) :card_id (:id series-card) :position 0}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) readable)
        (let [ids (map :id [dc1 dc2 dc3])]
          (check-cost ids 2)
          (let [[two two-count] (check-cost ids 2)
                [all all-count] (check-cost ids 3)]
            (is (= [true false false] all))
            (is (= two (take 2 all)))
            (is (= two-count all-count))))))))

(ns metabase.pulse.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.pulse.db :as pulse.db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest dashcards-for-dashboards-keep-id-order-over-partitions-test
  (mt/with-temp [:model/Dashboard {d1 :id} {}
                 :model/Dashboard {d2 :id} {}
                 :model/Dashboard {d3 :id} {}
                 :model/Card {card-id :id} {}
                 :model/DashboardCard _ {:dashboard_id d3, :card_id card-id}
                 :model/DashboardCard _ {:dashboard_id d1, :card_id card-id}
                 :model/DashboardCard _ {:dashboard_id d2, :card_id card-id}]
    (let [read-rows (fn [] (pulse.db/dashcards-with-cards-for-dashboards [d1 d2 d3]))
          single    (read-rows)]
      (is (= 3 (count single)))
      (is (= (map :id single) (sort (map :id single))))
      (is (= single (mt/with-partition-size 2 (read-rows))))
      (is (< (t2/with-call-count [calls] (read-rows) (calls))
             (t2/with-call-count [calls] (mt/with-partition-size 2 (read-rows)) (calls)))))))

(deftest updates-for-dashboards-sum-over-partitions-test
  (mt/with-temp [:model/Dashboard {d1 :id} {}
                 :model/Dashboard {d2 :id} {}
                 :model/Dashboard {d3 :id} {}
                 :model/Pulse {p1 :id} {:dashboard_id d1}
                 :model/Pulse {p2 :id} {:dashboard_id d2}
                 :model/Pulse {p3 :id} {:dashboard_id d3}]
    (let [changes {d1 {:name "one"}, d2 {:name "two"}, d3 {:name "three"}}]
      (is (= 3 (mt/with-partition-size 2 (pulse.db/update-pulses-for-dashboards! changes))))
      (is (= {p1 "one", p2 "two", p3 "three"}
             (update-vals (mt/with-partition-size 2 (pulse.db/pulses-by-ids [p1 p2 p3])) :name))))))

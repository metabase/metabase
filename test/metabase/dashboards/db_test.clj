(ns metabase.dashboards.db-test
  (:require
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:parallel link-card-id-compiles-as-query-parameter-test
  (testing "a non-integer id is rejected when building the link-card query"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"must be an integer"
         (#'dashboards.db/link-card-info-query-for-model "card" {:raw "x"}))))
  (testing "single-id and collection forms both pass a legitimate id as a bind parameter"
    (doseq [ids [42 #{42} [42]]]
      (let [[query & params] (sql/format (#'dashboards.db/link-card-info-query-for-model "card" ids))]
        (is (re-find #"\?" query) "the id appears as a bind parameter")
        (is (= [42] params))))))

(deftest partitioned-reads-match-whole-reads-test
  (mt/with-temp [:model/Dashboard    {d1 :id} {}
                 :model/Dashboard    {d2 :id} {}
                 :model/Dashboard    {d3 :id} {}
                 :model/Dashboard    {d4 :id} {}
                 :model/Dashboard    {d5 :id} {}
                 :model/DashboardTab {t1 :id} {:dashboard_id d5 :position 1}
                 :model/DashboardTab {t2 :id} {:dashboard_id d4 :position 0}
                 :model/DashboardTab {t3 :id} {:dashboard_id d5 :position 0}
                 :model/DashboardTab {t4 :id} {:dashboard_id d3 :position 0}
                 :model/DashboardTab {t5 :id} {:dashboard_id d1 :position 0}
                 :model/Card         {c1 :id} {}
                 :model/DashboardCard {dc1 :id} {:dashboard_id d3 :card_id c1}
                 :model/DashboardCard {dc2 :id} {:dashboard_id d1 :card_id c1}
                 :model/DashboardCard {dc3 :id} {:dashboard_id d5 :card_id c1}
                 :model/DashboardCard {dc4 :id} {:dashboard_id d2 :card_id c1}
                 :model/DashboardCard {dc5 :id} {:dashboard_id d4 :card_id c1}]
    (let [dashboard-ids [d1 d2 d3 d4 d5]
          reads         {:ordered-tabs      #(mapv :id (dashboards.db/dashboard-tabs-for-dashboards dashboard-ids))
                         :ordered-dashcards #(mapv :id (dashboards.db/dashcards-with-visible-cards-for-dashboards dashboard-ids))
                         :map-by-id         #(dashboards.db/dashboards-by-ids dashboard-ids)
                         :id-map            #(dashboards.db/id->dashcard [dc1 dc2 dc3 dc4 dc5])
                         :tab-dashboards    #(:tab-dashboard-ids (dashboards.db/dashcard-reference-problems [t1 t2 t3 t4 t5] nil))}]
      (doseq [[read-name read-fn] reads]
        (testing read-name
          (let [whole (read-fn)]
            (is (seq whole))
            (is (= whole (mt/with-partition-size 2
                           (read-fn))))))))))

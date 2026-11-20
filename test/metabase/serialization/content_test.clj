(ns metabase.serialization.content-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- query-count [thunk]
  (t2/with-call-count [call-count]
    (thunk)
    (call-count)))

(defn- extract-one [model-name entity]
  (let [[x] (into [] (serialization/export model-name [entity]))]
    (when (instance? Throwable x)
      (throw x))
    x))

(deftest dashboard-round-trip-test
  (testing "a Dashboard exports its tabs, dashcards and their series, and imports them back over itself"
    (mt/with-temp [:model/Collection          {coll-id :id}           {}
                   :model/Card                {card-id :id}           {:collection_id coll-id}
                   :model/Card                {series-id :id}         {:collection_id coll-id}
                   :model/Dashboard           {dash-id :id :as dash}  {:collection_id coll-id}
                   :model/DashboardTab        {tab-id :id}            {:dashboard_id dash-id :name "Tab" :position 0}
                   :model/DashboardCard       {dashcard-id :id}       {:dashboard_id dash-id :card_id card-id
                                                                       :dashboard_tab_id tab-id :row 0 :col 0}
                   :model/DashboardCard       _                       {:dashboard_id dash-id :card_id card-id
                                                                       :dashboard_tab_id tab-id :row 1 :col 0}
                   :model/DashboardCardSeries _                       {:dashboardcard_id dashcard-id :card_id series-id
                                                                       :position 0}]
      (let [card-eid (t2/select-one-fn :entity_id :model/Card :id card-id)
            exported (extract-one :model/Dashboard dash)]
        (is (=? {:tabs      [{:name "Tab"}]
                 :dashcards [{:card_id card-eid :row 0 :series [{:position 0}]}
                             {:card_id card-eid :row 1 :series []}]}
                exported))
        (testing "and re-imports the dashcards it lost"
          (t2/delete! :model/DashboardCard :dashboard_id dash-id)
          (serialization/load :model/Dashboard [exported])
          (is (= [[0 card-id 1] [1 card-id 0]]
                 (for [dashcard (t2/select :model/DashboardCard :dashboard_id dash-id {:order-by [[:row :asc]]})]
                   [(:row dashcard) (:card_id dashcard)
                    (t2/count :model/DashboardCardSeries :dashboardcard_id (:id dashcard))]))))))))

(deftest extract-dashboards-query-count-test
  (testing "exporting Dashboards takes as many queries for many Dashboards as for few"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card       {card-id :id} {:collection_id coll-id}]
      (let [dashboards (vec (for [i (range 6)]
                              (let [dash (t2/insert-returning-instance! :model/Dashboard {:name (str "D" i)
                                                                                          :collection_id coll-id
                                                                                          :creator_id (mt/user->id :rasta)
                                                                                          :parameters []})]
                                (t2/insert! :model/DashboardCard {:dashboard_id (:id dash) :card_id card-id
                                                                  :row 0 :col 0 :size_x 4 :size_y 4})
                                dash)))
            extract    #(into [] (serialization/export :model/Dashboard %))]
        (try
          (is (= (query-count #(extract (take 2 dashboards)))
                 (query-count #(extract dashboards))))
          (finally
            (t2/delete! :model/Dashboard :id [:in (map :id dashboards)])))))))

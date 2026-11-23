(ns metabase.dashboards.models.dashboard-tab-test
  (:require
   [clojure.test :refer :all]
   [metabase.dashboards.models.dashboard-tab :as dashboard-tab]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.events.test-util :as events.tu]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(use-fixtures
  :once
  (fixtures/initialize :test-users-personal-collections))

(defn do-with-dashtab-in-personal-collection [f]
  (let [owner-id (mt/user->id :rasta)
        coll     (t2/select-one :model/Collection :personal_owner_id owner-id)]
    (mt/with-temp
      [:model/Card            card     {}
       :model/Dashboard       dash     {:collection_id (:id coll)}
       :model/DashboardTab dashtab  {:dashboard_id (:id dash)}
       :model/DashboardCard   dashcard {:dashboard_id (:id dash) :card_id (:id card) :dashboard_tab_id (:id dashtab)}]
      (f {:owner-id   owner-id
          :collection coll
          :card       card
          :dashboard  dash
          :dashcard   dashcard
          :dashtab    dashtab}))))

(defmacro with-dashtab-in-personal-collection
  [binding & body]
  `(do-with-dashtab-in-personal-collection (fn [~binding] ~@body)))

(deftest perms-test
  (with-dashtab-in-personal-collection {:keys [dashtab] :as _dashtab}
    (testing "A user that can't see the Collection that the Dashboard is in can't read and write the dashtab"
      (mt/with-current-user (mt/user->id :lucky)
        (is (= false (mi/can-read? (t2/hydrate dashtab :can_read))))
        (is (= false (mi/can-write? (t2/hydrate dashtab :can_write))))))
    (testing "A user that can see the Collection that the Dashboard is in can read and write the dashtab"
      (mt/with-current-user (mt/user->id :rasta)
        (is (true? (mi/can-read? (t2/hydrate dashtab :can_read))))
        (is (true? (mi/can-write? (t2/hydrate dashtab :can_write))))))))

(deftest dependency-test
  (testing "Deleting a dashtab should delete the associated dashboardcards"
    (with-dashtab-in-personal-collection {:keys [dashtab dashcard]}
      (t2/delete! dashtab)
      (is (= nil (t2/select-one :model/DashboardCard :id (:id dashcard))))))
  (testing "Deleting a dashboard will delete all its dashcards"
    (with-dashtab-in-personal-collection {:keys [dashboard dashtab dashcard]}
      (t2/delete! dashboard)
      (is (= nil (t2/select-one :model/DashboardTab :id (:id dashtab))))
      (is (= nil (t2/select-one :model/DashboardCard :id (:id dashcard)))))))

(deftest hydration-test
  (testing "hydrate a dashboard will return all of its tabs"
    (mt/with-temp
      [:model/Card            card      {}
       :model/Dashboard       dashboard {}
       :model/DashboardTab dashtab-1 {:dashboard_id (:id dashboard) :position 0}
       :model/DashboardTab dashtab-2 {:dashboard_id (:id dashboard) :position 1}
       :model/DashboardCard   _         {:dashboard_id (:id dashboard) :card_id (:id card) :dashboard_tab_id (:id dashtab-1)}
       :model/DashboardCard   _         {:dashboard_id (:id dashboard) :card_id (:id card) :dashboard_tab_id (:id dashtab-2)}]
      (is (=? {:tabs [{:id (:id dashtab-1), :position 0, :dashboard_id (:id dashboard)}
                      {:id (:id dashtab-2), :position 1, :dashboard_id (:id dashboard)}]}
              (t2/hydrate dashboard :tabs))))))

(deftest hydrate-tabs-card-test
  (mt/with-temp
    [:model/Dashboard    {dashboard-id :id}    {}
     :model/DashboardTab {tab-2-id :id}        {:name         "Tab 2"
                                                :dashboard_id dashboard-id
                                                :position     1}
     :model/DashboardTab {tab-1-id :id}        {:name         "Tab 1"
                                                :dashboard_id dashboard-id
                                                :position     0}
     :model/DashboardTab {empty-tab-id :id}    {:name         "Empty Tab"
                                                :dashboard_id dashboard-id
                                                :position     2}
     :model/DashboardCard {dash-2-tab1-id :id} {:dashboard_id     dashboard-id
                                                :row              0
                                                :col              1
                                                :dashboard_tab_id tab-1-id}
     :model/DashboardCard {dash-1-tab1-id :id} {:dashboard_id     dashboard-id
                                                :row              0
                                                :col              0
                                                :dashboard_tab_id tab-1-id}
     :model/DashboardCard {dash-2-tab2-id :id} {:dashboard_id     dashboard-id
                                                :row              1
                                                :dashboard_tab_id tab-2-id}
     :model/DashboardCard {dash-1-tab2-id :id} {:dashboard_id     dashboard-id
                                                :row              0
                                                :dashboard_tab_id tab-2-id}]
    (is (=? [{:id    tab-1-id
              :cards [{:id dash-1-tab1-id}
                      {:id dash-2-tab1-id}]}
             {:id    tab-2-id
              :cards [{:id dash-1-tab2-id}
                      {:id dash-2-tab2-id}]}
             {:id    empty-tab-id
              :cards []}]
            (t2/hydrate (t2/select :model/DashboardTab :dashboard_id dashboard-id) :tab-cards)))))

(deftest ^:parallel dashtab-columns-schema-test
  (testing "DashboardTab has name and position that is not negative"
    (doseq [bad [{:name " "} {:position -1}]]
      (testing (pr-str bad)
        (is (not (mr/validate ::dashboards.schema/dashboard-tab.update (assoc bad :id 1))))))
    (is (mr/validate ::dashboards.schema/dashboard-tab.update {:id 1 :name "Tab" :position 0}))))

(deftest dashtab-dashboard-is-frozen-test
  (testing "DashboardTab stays in its Dashboard"
    (mt/with-temp [:model/Dashboard dash  {}
                   :model/Dashboard other {}
                   :model/DashboardTab tab {:dashboard_id (u/the-id dash)}]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"cannot move"
                            (t2/update! :model/DashboardTab :id (u/the-id tab) {:dashboard_id (u/the-id other)})))
      (is (= (u/the-id dash) (t2/select-one-fn :dashboard_id :model/DashboardTab :id (u/the-id tab)))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Dashboard {dashboard-id :id} {}]
    (mt/with-model-cleanup [:model/DashboardTab]
      (let [rows    (fn [n] (mapv (fn [i] {:dashboard_id dashboard-id :name (str "Tab " i) :position i}) (range n)))
            fresh!  (fn [n] (mapv :id (dashboard-tab/create-dashboard-tabs! (rows n))))
            counted (fn [f]
                      (f 1)
                      (is (= (f 2) (f 6))))
            counted-updates (fn [f]
                              (f 1)
                              (is (<= (- (f 6) (f 2)) (* 2 (- 6 2)))
                                  "each more row costs its SELECT by the hook and its UPDATE"))]
        (testing "creating tabs"
          (counted (fn [n] (let [rows (rows n)] (events.tu/statement-count! #(dashboard-tab/create-dashboard-tabs! rows))))))
        (testing "updating tabs, some already holding the new value"
          (counted-updates (fn [n]
                     (let [ids (fresh! n)]
                       (dashboard-tab/update-dashboard-tabs! (mapv (fn [id] {:id id :name "Same"}) (take-nth 2 ids)))
                       (events.tu/statement-count!
                        #(dashboard-tab/update-dashboard-tabs! (mapv (fn [id] {:id id :name "Same"}) ids)))))))
        (testing "deleting tabs"
          (counted (fn [n] (let [ids (fresh! n)] (events.tu/statement-count! #(dashboard-tab/delete-dashboard-tabs! ids))))))
        (testing "replacing the tabs of a dashboard"
          (counted (fn [n]
                     (let [ids     (fresh! n)
                           current (mapv (fn [id] (t2/select-one [:model/DashboardTab :id :name :position] :id id)) ids)
                           new-tabs (concat (map-indexed (fn [i tab] (cond-> tab (even? i) (assoc :name "Renamed"))) (rest current))
                                            [{:id -1 :name "New" :position 99}])]
                       (events.tu/statement-count!
                        #(dashboard-tab/replace-dashboard-tabs! [{:dashboard_id dashboard-id :current-tabs current :new-tabs (vec new-tabs)}]))))))))))

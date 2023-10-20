(ns metabase.models.dashboard-tab-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.models :refer [Card Collection Dashboard DashboardCard]]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(use-fixtures
  :once
  (fixtures/initialize :test-users-personal-collections))

(defn do-with-dashtab-in-personal-collection [f]
  (let [owner-id (mt/user->id :rasta)
        coll     (t2/select-one Collection :personal_owner_id owner-id)]
    (t2.with-temp/with-temp
      [Card            card     {}
       Dashboard       dash     {:collection_id (:id coll)}
       :model/DashboardTab dashtab  {:dashboard_id (:id dash)}
       DashboardCard   dashcard {:dashboard_id (:id dash) :card_id (:id card) :dashboard_tab_id (:id dashtab)}]
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
  (with-dashtab-in-personal-collection {:keys [collection dashboard dashtab] :as _dashtab}
    (testing "dashtab's permission is the permission of dashboard they're on"
      (is (= (mi/perms-objects-set dashtab :read)
             (mi/perms-objects-set dashboard :read)))
      (is (= (mi/perms-objects-set dashtab :write)
             (mi/perms-objects-set dashboard :write))))

    (testing (str "Check that if a Dashtab of a Dashboard is in a Collection, someone who would not be able to see it under the old "
                  "artifact-permissions regime will be able to see it if they have permissions for that Collection")
      (binding [api/*current-user-permissions-set* (delay #{(perms/collection-read-path collection)})]
        (mi/perms-objects-set dashtab :read)
        (is (= true (mi/can-read? dashtab)))
        (is (= false (mi/can-write? dashtab)))))

    (testing "Do we have *write* Permissions for a dashtab if we have *write* Permissions for the Collection it's in?"
      (binding [api/*current-user-permissions-set* (delay #{(perms/collection-readwrite-path collection)})]
        (is (= true (mi/can-read? dashtab)))
        (is (= true (mi/can-write? dashtab)))))

    (testing "A user that can't see the Collection that the Dashboard is in can't read and write the dashtab"
      (mt/with-current-user (mt/user->id :lucky)
        (is (= false (mi/can-read? dashboard)))
        (is (= false (mi/can-write? dashboard)))))

    (testing "A user that can see the Collection that the Dashboard is in can read and write the dashtab"
      (mt/with-current-user (mt/user->id :rasta)
        (is (= true (mi/can-read? dashboard)))
        (is (= true (mi/can-write? dashboard)))))))

(deftest dependency-test
  (testing "Deleting a dashtab should delete the associated dashboardcards"
    (with-dashtab-in-personal-collection {:keys [dashtab dashcard]}
      (t2/delete! dashtab)
      (is (= nil (t2/select-one DashboardCard :id (:id dashcard))))))

  (testing "Deleting a dashboard will delete all its dashcards"
    (with-dashtab-in-personal-collection {:keys [dashboard dashtab dashcard]}
      (t2/delete! dashboard)
      (is (= nil (t2/select-one :model/DashboardTab :id (:id dashtab))))
      (is (= nil (t2/select-one DashboardCard :id (:id dashcard)))))))

(deftest hydration-test
  (testing "hydrate a dashboard will return all of its tabs"
    (t2.with-temp/with-temp
      [Card            card      {}
       Dashboard       dashboard {}
       :model/DashboardTab dashtab-1 {:dashboard_id (:id dashboard) :position 0}
       :model/DashboardTab dashtab-2 {:dashboard_id (:id dashboard) :position 1}
       DashboardCard   _         {:dashboard_id (:id dashboard) :card_id (:id card) :dashboard_tab_id (:id dashtab-1)}
       DashboardCard   _         {:dashboard_id (:id dashboard) :card_id (:id card) :dashboard_tab_id (:id dashtab-2)}]
      (is (=? {:tabs [{:id (:id dashtab-1), :position 0, :dashboard_id (:id dashboard)}
                      {:id (:id dashtab-2), :position 1, :dashboard_id (:id dashboard)}]}
              (t2/hydrate dashboard :tabs))))))

(deftest hydrate-tabs-card-test
  (t2.with-temp/with-temp
    [:model/Dashboard    {dashboard-id :id}    {}
     :model/DashboardTab {tab-2-id :id}        {:name         "Tab 2"
                                                :dashboard_id dashboard-id
                                                :position     1}
     :model/DashboardTab {tab-1-id :id}        {:name         "Tab 1"
                                                :dashboard_id dashboard-id
                                                :position     0}
     :model/DashboardCard {dash-2-tab1-id :id} {:dashboard_id     dashboard-id
                                                :row             0
                                                :col             1
                                                :dashboard_tab_id tab-1-id}
     :model/DashboardCard {dash-1-tab1-id :id} {:dashboard_id     dashboard-id
                                                :row             0
                                                :col             0
                                                :dashboard_tab_id tab-1-id}
     :model/DashboardCard {dash-2-tab2-id :id} {:dashboard_id     dashboard-id
                                                :row             1
                                                :dashboard_tab_id tab-2-id}
     :model/DashboardCard {dash-1-tab2-id :id} {:dashboard_id     dashboard-id
                                                :row             0
                                                :dashboard_tab_id tab-2-id}]
    (is (=? [{:id    tab-1-id
              :cards [{:id dash-1-tab1-id}
                      {:id dash-2-tab1-id}]}
             {:id    tab-2-id
              :cards [{:id dash-1-tab2-id}
                      {:id dash-2-tab2-id}]}]
            (t2/hydrate (t2/select :model/DashboardTab :dashboard_id dashboard-id) :tab-cards)))))

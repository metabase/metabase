(ns metabase.models.dashboard-test
  (:require [clojure.test :refer :all]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards.core :as magic]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.dashboard :as dashboard :refer :all]
            [metabase.models.dashboard-card :as dashboard-card :refer [DashboardCard]]
            [metabase.models.dashboard-card-series :refer [DashboardCardSeries]]
            [metabase.models.database :refer [Database]]
            [metabase.models.interface :as mi]
            [metabase.models.permissions :as perms]
            [metabase.models.pulse :refer [Pulse]]
            [metabase.models.pulse-card :refer [PulseCard]]
            [metabase.models.table :refer [Table]]
            [metabase.models.user :as user]
            [metabase.test :as mt]
            [metabase.test.data :refer :all]
            [metabase.test.data.users :as users]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; ## Dashboard Revisions

(deftest serialize-dashboard-test
  (tt/with-temp* [Dashboard           [{dashboard-id :id :as dashboard} {:name "Test Dashboard"}]
                  Card                [{card-id :id}]
                  Card                [{series-id-1 :id}]
                  Card                [{series-id-2 :id}]
                  DashboardCard       [{dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}]
                  DashboardCardSeries [_                 {:dashboardcard_id dashcard-id, :card_id series-id-1, :position 0}]
                  DashboardCardSeries [_                 {:dashboardcard_id dashcard-id, :card_id series-id-2, :position 1}]]
    (is (= {:name         "Test Dashboard"
            :description  nil
            :cards        [{:sizeX   2
                            :sizeY   2
                            :row     0
                            :col     0
                            :id      true
                            :card_id true
                            :series  true}]}
           (update (serialize-dashboard dashboard) :cards (fn [[{:keys [id card_id series], :as card}]]
                                                            [(assoc card
                                                                    :id      (= dashcard-id id)
                                                                    :card_id (= card-id card_id)
                                                                    :series  (= [series-id-1 series-id-2] series))]))))))


(deftest diff-dashboards-str-test
  (is (= "renamed it from \"Diff Test\" to \"Diff Test Changed\" and added a description."
         (#'dashboard/diff-dashboards-str
          nil
          {:name        "Diff Test"
           :description nil
           :cards       []}
          {:name        "Diff Test Changed"
           :description "foobar"
           :cards       []})))

  (is (= "added a card."
         (#'dashboard/diff-dashboards-str
          nil
          {:name        "Diff Test"
           :description nil
           :cards       []}
          {:name        "Diff Test"
           :description nil
           :cards       [{:sizeX   2
                          :sizeY   2
                          :row     0
                          :col     0
                          :id      1
                          :card_id 1
                          :series  []}]})))

  (is (= "rearranged the cards, modified the series on card 1 and added some series to card 2."
         (#'dashboard/diff-dashboards-str
          nil
          {:name        "Diff Test"
           :description nil
           :cards       [{:sizeX   2
                          :sizeY   2
                          :row     0
                          :col     0
                          :id      1
                          :card_id 1
                          :series  [5 6]}
                         {:sizeX   2
                          :sizeY   2
                          :row     0
                          :col     0
                          :id      2
                          :card_id 2
                          :series  []}]}
          {:name        "Diff Test"
           :description nil
           :cards       [{:sizeX   2
                          :sizeY   2
                          :row     0
                          :col     0
                          :id      1
                          :card_id 1
                          :series  [4 5]}
                         {:sizeX   2
                          :sizeY   2
                          :row     2
                          :col     0
                          :id      2
                          :card_id 2
                          :series  [3 4 5]}]}))))

(deftest revert-dashboard!-test
  (tt/with-temp* [Dashboard           [{dashboard-id :id, :as dashboard}    {:name "Test Dashboard"}]
                  Card                [{card-id :id}]
                  Card                [{series-id-1 :id}]
                  Card                [{series-id-2 :id}]
                  DashboardCard       [{dashcard-id :id :as dashboard-card} {:dashboard_id dashboard-id, :card_id card-id}]
                  DashboardCardSeries [_                                    {:dashboardcard_id dashcard-id, :card_id series-id-1, :position 0}]
                  DashboardCardSeries [_                                    {:dashboardcard_id dashcard-id, :card_id series-id-2, :position 1}]]
    (let [check-ids            (fn [[{:keys [id card_id series] :as card}]]
                                 [(assoc card
                                         :id      (= dashcard-id id)
                                         :card_id (= card-id card_id)
                                         :series  (= [series-id-1 series-id-2] series))])
          serialized-dashboard (serialize-dashboard dashboard)]
      (testing "original state"
        (is (= {:name         "Test Dashboard"
                :description  nil
                :cards        [{:sizeX   2
                                :sizeY   2
                                :row     0
                                :col     0
                                :id      true
                                :card_id true
                                :series  true}]}
               (update serialized-dashboard :cards check-ids))))
      (testing "delete the dashcard and modify the dash attributes"
        (dashboard-card/delete-dashboard-card! dashboard-card (users/user->id :rasta))
        (db/update! Dashboard dashboard-id
          :name        "Revert Test"
          :description "something")
        (testing "capture updated Dashboard state"
          (is (= {:name        "Revert Test"
                  :description "something"
                  :cards       []}
                 (serialize-dashboard (Dashboard dashboard-id))))))
      (testing "now do the reversion; state should return to original"
        (#'dashboard/revert-dashboard! nil dashboard-id (users/user->id :crowberto) serialized-dashboard)
        (is (= {:name         "Test Dashboard"
                :description  nil
                :cards        [{:sizeX   2
                                :sizeY   2
                                :row     0
                                :col     0
                                :id      false
                                :card_id true
                                :series  true}]}
               (update (serialize-dashboard (Dashboard dashboard-id)) :cards check-ids)))))))

(deftest public-sharing-test
  (testing "test that a Dashboard's :public_uuid comes back if public sharing is enabled..."
    (tu/with-temporary-setting-values [enable-public-sharing true]
      (tt/with-temp Dashboard [dashboard {:public_uuid (str (java.util.UUID/randomUUID))}]
        (is (schema= u/uuid-regex
                     (:public_uuid dashboard)))))

    (testing "...but if public sharing is *disabled* it should come back as `nil`"
      (tu/with-temporary-setting-values [enable-public-sharing false]
        (tt/with-temp Dashboard [dashboard {:public_uuid (str (java.util.UUID/randomUUID))}]
          (is (= nil
                 (:public_uuid dashboard))))))))

(deftest post-update-test
  (tt/with-temp* [Dashboard           [{dashboard-id :id} {:name "Lucky the Pigeon's Lucky Stuff"}]
                  Card                [{card-id :id}]
                  Pulse               [{pulse-id :id} {:dashboard_id dashboard-id}]
                  DashboardCard       [{dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}]
                  PulseCard           [{pulse-card-id :id} {:pulse_id pulse-id, :card_id card-id, :dashboard_card_id dashcard-id}]]
    (testing "Pulse name updates"
      (db/update! Dashboard dashboard-id :name "Lucky's Close Shaves")
      (is (= "Lucky's Close Shaves"
             (db/select-one-field :name Pulse :id pulse-id))))
    (testing "PulseCard syncing"
      (tt/with-temp Card [{new-card-id :id}]
        (add-dashcard! dashboard-id new-card-id)
        (db/update! Dashboard dashboard-id :name "Lucky's Close Shaves")
        (is (not (nil? (db/select-one PulseCard :card_id new-card-id))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Collections Permissions Tests                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn do-with-dash-in-collection [f]
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection    [collection]
                    Dashboard     [dash  {:collection_id (u/the-id collection)}]
                    Database      [db    {:engine :h2}]
                    Table         [table {:db_id (u/the-id db)}]
                    Card          [card  {:dataset_query {:database (u/the-id db)
                                                          :type     :query
                                                          :query    {:source-table (u/the-id table)}}}]
                    DashboardCard [_ {:dashboard_id (u/the-id dash), :card_id (u/the-id card)}]]
      (f db collection dash))))

(defmacro with-dash-in-collection
  "Execute `body` with a Dashboard in a Collection. Dashboard will contain one Card in a Database."
  {:style/indent 1}
  [[db-binding collection-binding dash-binding] & body]
  `(do-with-dash-in-collection
    (fn [~db-binding ~collection-binding ~dash-binding]
      ~@body)))

(deftest perms-test
  (with-dash-in-collection [db collection dash]
    (testing (str "Check that if a Dashboard is in a Collection, someone who would not be able to see it under the old "
                  "artifact-permissions regime will be able to see it if they have permissions for that Collection")
      (binding [api/*current-user-permissions-set* (atom #{(perms/collection-read-path collection)})]
        (is (= true
               (mi/can-read? dash)))))

    (testing (str "Check that if a Dashboard is in a Collection, someone who would otherwise be able to see it under "
                  "the old artifact-permissions regime will *NOT* be able to see it if they don't have permissions for "
                  "that Collection"))
    (binding [api/*current-user-permissions-set* (atom #{(perms/object-path (u/the-id db))})]
      (is (= false
             (mi/can-read? dash))))

    (testing "Do we have *write* Permissions for a Dashboard if we have *write* Permissions for the Collection its in?"
      (binding [api/*current-user-permissions-set* (atom #{(perms/collection-readwrite-path collection)})]
        (mi/can-write? dash)))))

(deftest transient-dashboards-test
  (testing "test that we save a transient dashboard"
    (tu/with-model-cleanup [Card Dashboard DashboardCard Collection]
      (binding [api/*current-user-id*              (users/user->id :rasta)
                api/*current-user-permissions-set* (-> :rasta
                                                       users/user->id
                                                       user/permissions-set
                                                       atom)]
        (let [dashboard                  (magic/automagic-analysis (Table (id :venues)) {})
              rastas-personal-collection (db/select-one-field :id 'Collection
                                           :personal_owner_id api/*current-user-id*)
              saved-dashboard            (save-transient-dashboard! dashboard rastas-personal-collection)]
          (is (= (db/count 'DashboardCard :dashboard_id (:id saved-dashboard))
                 (-> dashboard :ordered_cards count))))))))

(deftest validate-collection-namespace-test
  (mt/with-temp Collection [{collection-id :id} {:namespace "currency"}]
    (testing "Shouldn't be able to create a Dashboard in a non-normal Collection"
      (let [dashboard-name (mt/random-name)]
        (try
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"A Dashboard can only go in Collections in the \"default\" namespace"
               (db/insert! Dashboard (assoc (tt/with-temp-defaults Dashboard) :collection_id collection-id, :name dashboard-name))))
          (finally
            (db/delete! Dashboard :name dashboard-name)))))

    (testing "Shouldn't be able to move a Dashboard to a non-normal Collection"
      (mt/with-temp Dashboard [{card-id :id}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A Dashboard can only go in Collections in the \"default\" namespace"
             (db/update! Dashboard card-id {:collection_id collection-id})))))))

(deftest validate-parameters-test
  (testing "Should validate Dashboard :parameters when"
    (testing "creating"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #":parameters must be a sequence of maps with String :id keys"
           (mt/with-temp Dashboard [_ {:parameters {:a :b}}]))))
    (testing "updating"
      (mt/with-temp Dashboard [{:keys [id]} {:parameters []}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #":parameters must be a sequence of maps with String :id keys"
             (db/update! Dashboard id :parameters [{:id 100}])))))))

(ns metabase.models.dashboard-test
  (:require [expectations :refer :all]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards.core :as magic]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [dashboard :as dashboard :refer :all]
             [dashboard-card :as dashboard-card :refer [DashboardCard]]
             [dashboard-card-series :refer [DashboardCardSeries]]
             [database :refer [Database]]
             [interface :as mi]
             [permissions :as perms]
             [table :refer [Table]]
             [user :as user]]
            [metabase.test
             [data :refer :all]
             [util :as tu]]
            [metabase.test.data.users :as users]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; ## Dashboard Revisions

;; serialize-dashboard
(expect
  {:name         "Test Dashboard"
   :description  nil
   :cards        [{:sizeX   2
                   :sizeY   2
                   :row     0
                   :col     0
                   :id      true
                   :card_id true
                   :series  true}]}
  (tt/with-temp* [Dashboard           [{dashboard-id :id :as dashboard} {:name "Test Dashboard"}]
                  Card                [{card-id :id}]
                  Card                [{series-id-1 :id}]
                  Card                [{series-id-2 :id}]
                  DashboardCard       [{dashcard-id :id}                {:dashboard_id dashboard-id, :card_id card-id}]
                  DashboardCardSeries [_                                {:dashboardcard_id dashcard-id, :card_id series-id-1, :position 0}]
                  DashboardCardSeries [_                                {:dashboardcard_id dashcard-id, :card_id series-id-2, :position 1}]]
    (update (serialize-dashboard dashboard) :cards (fn [[{:keys [id card_id series], :as card}]]
                                                     [(assoc card
                                                             :id      (= dashcard-id id)
                                                             :card_id (= card-id card_id)
                                                             :series  (= [series-id-1 series-id-2] series))]))))


;; diff-dashboards-str
(expect
  "renamed it from \"Diff Test\" to \"Diff Test Changed\" and added a description."
  (diff-dashboards-str
    {:name         "Diff Test"
     :description  nil
     :cards        []}
    {:name         "Diff Test Changed"
     :description  "foobar"
     :cards        []}))

(expect
  "added a card."
  (diff-dashboards-str
    {:name         "Diff Test"
     :description  nil
     :cards        []}
    {:name         "Diff Test"
     :description  nil
     :cards        [{:sizeX   2
                     :sizeY   2
                     :row     0
                     :col     0
                     :id      1
                     :card_id 1
                     :series  []}]}))

(expect
  "rearranged the cards, modified the series on card 1 and added some series to card 2."
  (diff-dashboards-str
    {:name         "Diff Test"
     :description  nil
     :cards        [{:sizeX   2
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
    {:name         "Diff Test"
     :description  nil
     :cards        [{:sizeX   2
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
                     :series  [3 4 5]}]}))


;;; #'dashboard/revert-dashboard!

(expect
  [{:name         "Test Dashboard"
    :description  nil
    :cards        [{:sizeX   2
                    :sizeY   2
                    :row     0
                    :col     0
                    :id      true
                    :card_id true
                    :series  true}]}
   {:name         "Revert Test"
    :description  "something"
    :cards        []}
   {:name         "Test Dashboard"
    :description  nil
    :cards        [{:sizeX   2
                    :sizeY   2
                    :row     0
                    :col     0
                    :id      false
                    :card_id true
                    :series  true}]}]
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
      ;; delete the dashcard and modify the dash attributes
      (dashboard-card/delete-dashboard-card! dashboard-card (users/user->id :rasta))
      (db/update! Dashboard dashboard-id
        :name        "Revert Test"
        :description "something")
      ;; capture our updated dashboard state
      (let [serialized-dashboard2 (serialize-dashboard (Dashboard dashboard-id))]
        ;; now do the reversion
        (#'dashboard/revert-dashboard! dashboard-id (users/user->id :crowberto) serialized-dashboard)
        ;; final output is original-state, updated-state, reverted-state
        [(update serialized-dashboard :cards check-ids)
         serialized-dashboard2
         (update (serialize-dashboard (Dashboard dashboard-id)) :cards check-ids)]))))


;; test that a Dashboard's :public_uuid comes back if public sharing is enabled...
(expect
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Dashboard [dashboard {:public_uuid (str (java.util.UUID/randomUUID))}]
      (boolean (:public_uuid dashboard)))))

;; ...but if public sharing is *disabled* it should come back as `nil`
(expect
  nil
  (tu/with-temporary-setting-values [enable-public-sharing false]
    (tt/with-temp Dashboard [dashboard {:public_uuid (str (java.util.UUID/randomUUID))}]
      (:public_uuid dashboard))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Collections Permissions Tests                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn do-with-dash-in-collection [f]
  (tt/with-temp* [Collection    [collection]
                  Dashboard     [dash  {:collection_id (u/get-id collection)}]
                  Database      [db    {:engine :h2}]
                  Table         [table {:db_id (u/get-id db)}]
                  Card          [card  {:dataset_query {:database (u/get-id db)
                                                        :type     :query
                                                        :query    {:source-table (u/get-id table)}}}]
                  DashboardCard [_ {:dashboard_id (u/get-id dash), :card_id (u/get-id card)}]]
    (f db collection dash)))

(defmacro with-dash-in-collection
  "Execute `body` with a Dashboard in a Collection. Dashboard will contain one Card in a Database."
  {:style/indent 1}
  [[db-binding collection-binding dash-binding] & body]
  `(do-with-dash-in-collection
    (fn [~db-binding ~collection-binding ~dash-binding]
      ~@body)))

;; Check that if a Dashboard is in a Collection, someone who would not be able to see it under the old
;; artifact-permissions regime will be able to see it if they have permissions for that Collection
(expect
  (with-dash-in-collection [_ collection dash]
    (binding [api/*current-user-permissions-set* (atom #{(perms/collection-read-path collection)})]
      (mi/can-read? dash))))

;; Check that if a Dashboard is in a Collection, someone who would otherwise be able to see it under the old
;; artifact-permissions regime will *NOT* be able to see it if they don't have permissions for that Collection
(expect
  false
  (with-dash-in-collection [db _ dash]
    (binding [api/*current-user-permissions-set* (atom #{(perms/object-path (u/get-id db))})]
      (mi/can-read? dash))))

;; Do we have *write* Permissions for a Dashboard if we have *write* Permissions for the Collection its in?
(expect
  (with-dash-in-collection [_ collection dash]
    (binding [api/*current-user-permissions-set* (atom #{(perms/collection-readwrite-path collection)})]
      (mi/can-write? dash))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Transient Dashboard Tests                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; test that we save a transient dashboard
(expect
  8
  (tu/with-model-cleanup ['Card 'Dashboard 'DashboardCard 'Collection]
    (binding [api/*current-user-id*              (users/user->id :rasta)
              api/*current-user-permissions-set* (-> :rasta
                                                     users/user->id
                                                     user/permissions-set
                                                     atom)]
      (->> (magic/automagic-analysis (Table (id :venues)) {})
           save-transient-dashboard!
           :id
           (db/count 'DashboardCard :dashboard_id)))))

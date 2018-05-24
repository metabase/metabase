(ns metabase.models.dashboard-test
  (:require [expectations :refer :all]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards.core :as magic]
            [metabase.models
             [card :refer [Card]]
             [dashboard :refer :all :as dashboard]
             [dashboard-card :as dashboard-card :refer [DashboardCard]]
             [dashboard-card-series :refer [DashboardCardSeries]]
             [table :refer [Table]]
             [user :as user]]
            [metabase.test
             [data :refer :all]
             [util :as tu]]
            [metabase.test.data.users :refer :all]
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
      (dashboard-card/delete-dashboard-card! dashboard-card (user->id :rasta))
      (db/update! Dashboard dashboard-id
        :name        "Revert Test"
        :description "something")
      ;; capture our updated dashboard state
      (let [serialized-dashboard2 (serialize-dashboard (Dashboard dashboard-id))]
        ;; now do the reversion
        (#'dashboard/revert-dashboard! dashboard-id (user->id :crowberto) serialized-dashboard)
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


;; test that we save a transient dashboard
(expect
  8
  (tu/with-model-cleanup ['Card 'Dashboard 'DashboardCard 'Collection]
    (binding [api/*current-user-id*              (user->id :rasta)
              api/*current-user-permissions-set* (-> :rasta
                                                     user->id
                                                     user/permissions-set
                                                     atom)]
      (->> (magic/automagic-analysis (Table (id :venues)) {})
           save-transient-dashboard!
           :id
           (db/count 'DashboardCard :dashboard_id)))))

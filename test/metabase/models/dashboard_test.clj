(ns metabase.models.dashboard-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.models.card :refer [Card]]
            [metabase.models.dashboard :refer :all]
            [metabase.models.dashboard-card :refer [DashboardCard]]
            [metabase.models.dashboard-card-series :refer [DashboardCardSeries]]
            [metabase.models.hydrate :refer :all]
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]
            [metabase.models.dashboard-card :as dashboard-card]))

;; ## Dashboard Revisions

;; serialize-dashboard
(expect
  {:name         "Test Dashboard"
   :description  nil
   :public_perms 0
   :cards        [{:sizeX   2
                   :sizeY   2
                   :row     nil
                   :col     nil
                   :id      true
                   :card_id true
                   :series  true}]}
  (tu/with-temp Dashboard [{dashboard-id :id :as dashboard} {:name         "Test Dashboard"
                                                             :public_perms 0
                                                             :creator_id   (user->id :rasta)}]
    (tu/with-temp Card [{card-id :id} {:name                   "Dashboard Test Card"
                                       :creator_id             (user->id :rasta)
                                       :public_perms           0
                                       :display                "scalar"
                                       :dataset_query          {:something "simple"}
                                       :visualization_settings {:global {:title nil}}}]
      (tu/with-temp Card [{series-id1 :id} {:name                   "Additional Series Card 1"
                                            :creator_id             (user->id :rasta)
                                            :public_perms           0
                                            :display                "scalar"
                                            :dataset_query          {:something "simple"}
                                            :visualization_settings {:global {:title nil}}}]
        (tu/with-temp Card [{series-id2 :id} {:name                   "Additional Series Card 2"
                                              :creator_id             (user->id :rasta)
                                              :public_perms           0
                                              :display                "scalar"
                                              :dataset_query          {:something "simple"}
                                              :visualization_settings {:global {:title nil}}}]
          (tu/with-temp DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id
                                                          :card_id      card-id}]
            (tu/with-temp DashboardCardSeries [_ {:dashboardcard_id dashcard-id
                                                  :card_id          series-id1
                                                  :position         0}]
              (tu/with-temp DashboardCardSeries [_ {:dashboardcard_id dashcard-id
                                                    :card_id          series-id2
                                                    :position         1}]
                (update-in (serialize-dashboard dashboard) [:cards] (fn [[{:keys [id card_id series] :as card}]]
                                                                        [(assoc card
                                                                           :id      (= dashcard-id id)
                                                                           :card_id (= card-id card_id)
                                                                           :series  (= [series-id1 series-id2] series))]))))))))))


;; diff-dashboards-str
(expect
  "renamed it from \"Diff Test\" to \"Diff Test Changed\" and added a description."
  (diff-dashboards-str
    {:name         "Diff Test"
     :description  nil
     :public_perms 0
     :cards        []}
    {:name         "Diff Test Changed"
     :description  "foobar"
     :public_perms 0
     :cards        []}))

(expect
  "added a card."
  (diff-dashboards-str
    {:name         "Diff Test"
     :description  nil
     :public_perms 0
     :cards        []}
    {:name         "Diff Test"
     :description  nil
     :public_perms 0
     :cards        [{:sizeX   2
                     :sizeY   2
                     :row     nil
                     :col     nil
                     :id      1
                     :card_id 1
                     :series  []}]}))

(expect
  "rearranged the cards, modified the series on card 1 and added some series to card 2."
  (diff-dashboards-str
    {:name         "Diff Test"
     :description  nil
     :public_perms 0
     :cards        [{:sizeX   2
                     :sizeY   2
                     :row     nil
                     :col     nil
                     :id      1
                     :card_id 1
                     :series  [5 6]}
                    {:sizeX   2
                     :sizeY   2
                     :row     nil
                     :col     nil
                     :id      2
                     :card_id 2
                     :series  []}]}
    {:name         "Diff Test"
     :description  nil
     :public_perms 0
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


;; revert-dashboard
(expect
  [{:name         "Test Dashboard"
    :description  nil
    :public_perms 0
    :cards        [{:sizeX   2
                    :sizeY   2
                    :row     nil
                    :col     nil
                    :id      true
                    :card_id true
                    :series  true}]}
   {:name         "Revert Test"
    :description  "something"
    :public_perms 0
    :cards        []}
   {:name         "Test Dashboard"
    :description  nil
    :public_perms 0
    :cards        [{:sizeX   2
                    :sizeY   2
                    :row     nil
                    :col     nil
                    :id      false
                    :card_id true
                    :series  true}]}]
  (tu/with-temp Dashboard [{dashboard-id :id :as dashboard} {:name         "Test Dashboard"
                                                             :public_perms 0
                                                             :creator_id   (user->id :rasta)}]
    (tu/with-temp Card [{card-id :id} {:name                   "Dashboard Test Card"
                                       :creator_id             (user->id :rasta)
                                       :public_perms           0
                                       :display                "scalar"
                                       :dataset_query          {:something "simple"}
                                       :visualization_settings {:global {:title nil}}}]
      (tu/with-temp Card [{series-id1 :id} {:name                   "Additional Series Card 1"
                                            :creator_id             (user->id :rasta)
                                            :public_perms           0
                                            :display                "scalar"
                                            :dataset_query          {:something "simple"}
                                            :visualization_settings {:global {:title nil}}}]
        (tu/with-temp Card [{series-id2 :id} {:name                   "Additional Series Card 2"
                                              :creator_id             (user->id :rasta)
                                              :public_perms           0
                                              :display                "scalar"
                                              :dataset_query          {:something "simple"}
                                              :visualization_settings {:global {:title nil}}}]
          (tu/with-temp DashboardCard [{dashcard-id :id :as dashboard-card} {:dashboard_id dashboard-id
                                                                             :card_id      card-id}]
            (tu/with-temp DashboardCardSeries [_ {:dashboardcard_id dashcard-id
                                                  :card_id          series-id1
                                                  :position         0}]
              (tu/with-temp DashboardCardSeries [_ {:dashboardcard_id dashcard-id
                                                    :card_id          series-id2
                                                    :position         1}]
                (let [check-ids            (fn [[{:keys [id card_id series] :as card}]]
                                             [(assoc card
                                                :id      (= dashcard-id id)
                                                :card_id (= card-id card_id)
                                                :series  (= [series-id1 series-id2] series))])
                      serialized-dashboard (serialize-dashboard dashboard)]
                  ;; delete the dashcard and modify the dash attributes
                  (dashboard-card/delete-dashboard-card dashboard-card (user->id :rasta))
                  (db/upd Dashboard dashboard-id
                          :name        "Revert Test"
                          :description "something")
                  ;; capture our updated dashboard state
                  (let [serialized-dashboard2 (serialize-dashboard (db/sel :one Dashboard :id dashboard-id))]
                    ;; now do the reversion
                    (revert-dashboard dashboard-id (user->id :crowberto) serialized-dashboard)
                    ;; final output is original-state, updated-state, reverted-state
                    [(update serialized-dashboard :cards check-ids)
                     serialized-dashboard2
                     (update (serialize-dashboard (db/sel :one Dashboard :id dashboard-id)) :cards check-ids)]))))))))))

(ns metabase.models.card-test
  (:require [expectations :refer :all]
            [metabase.api.common :refer [*current-user-permissions-set*]]
            [metabase.models
             [card :refer :all]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [interface :as mi]
             [permissions :as perms]]
            [metabase.query-processor.expand :as ql]
            [metabase.test
             [data :refer [id]]
             [util :as tu :refer [random-name]]]
            [metabase.test.data.users :refer :all]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- create-dash! [dash-name]
  ((user->client :rasta) :post 200 "dashboard" {:name dash-name}))

;; Check that the :dashboard_count delay returns the correct count of Dashboards a Card is in
(expect
  [0 1 2]
  (tt/with-temp Card [{card-id :id}]
    (let [get-dashboard-count (fn [] (dashboard-count (Card card-id)))]

      [(get-dashboard-count)
       (do (db/insert! DashboardCard :card_id card-id, :dashboard_id (:id (create-dash! (random-name))), :parameter_mappings [])
           (get-dashboard-count))
       (do (db/insert! DashboardCard :card_id card-id, :dashboard_id (:id (create-dash! (random-name))), :parameter_mappings [])
           (get-dashboard-count))])))


;; card-dependencies

(expect
  {:Segment #{2 3}
   :Metric  nil}
  (card-dependencies Card 12 {:dataset_query {:type :query
                                              :query {:aggregation ["rows"]
                                                      :filter      ["AND" [">" 4 "2014-10-19"] ["=" 5 "yes"] ["SEGMENT" 2] ["SEGMENT" 3]]}}}))

(expect
  {:Segment #{1}
   :Metric #{7}}
  (card-dependencies Card 12 {:dataset_query {:type :query
                                              :query {:aggregation ["METRIC" 7]
                                                      :filter      ["AND" [">" 4 "2014-10-19"] ["=" 5 "yes"] ["OR" ["SEGMENT" 1] ["!=" 5 "5"]]]}}}))

(expect
  {:Segment nil
   :Metric  nil}
  (card-dependencies Card 12 {:dataset_query {:type :query
                                              :query {:aggregation nil
                                                      :filter      nil}}}))


;;; ------------------------------------------------------------ Permissions Checking ------------------------------------------------------------

(expect
  false
  (tt/with-temp Card [card {:dataset_query {:database (id), :type "native"}}]
    (binding [*current-user-permissions-set* (delay #{})]
      (mi/can-read? card))))

(expect
  (tt/with-temp Card [card {:dataset_query {:database (id), :type "native"}}]
    (binding [*current-user-permissions-set* (delay #{(perms/native-read-path (id))})]
      (mi/can-read? card))))

;; in order to *write* a native card user should need native readwrite access
(expect
  false
  (tt/with-temp Card [card {:dataset_query {:database (id), :type "native"}}]
    (binding [*current-user-permissions-set* (delay #{(perms/native-read-path (id))})]
      (mi/can-write? card))))

(expect
  (tt/with-temp Card [card {:dataset_query {:database (id), :type "native"}}]
    (binding [*current-user-permissions-set* (delay #{(perms/native-readwrite-path (id))})]
      (mi/can-write? card))))


;;; check permissions sets for queries
;; native read
(defn- native [query]
  {:database 1
   :type     :native
   :native   {:query query}})

(expect
  #{"/db/1/native/read/"}
  (query-perms-set (native "SELECT count(*) FROM toucan_sightings;") :read))

;; native write
(expect
  #{"/db/1/native/"}
  (query-perms-set (native "SELECT count(*) FROM toucan_sightings;") :write))


(defn- mbql [query]
  {:database (id)
   :type     :query
   :query    query})

;; MBQL w/o JOIN
(expect
  #{(perms/object-path (id) "PUBLIC" (id :venues))}
  (query-perms-set (mbql (ql/query
                           (ql/source-table (id :venues))))
                   :read))

;; MBQL w/ JOIN
(expect
  #{(perms/object-path (id) "PUBLIC" (id :checkins))
    (perms/object-path (id) "PUBLIC" (id :venues))}
  (query-perms-set (mbql (ql/query
                           (ql/source-table (id :checkins))
                           (ql/order-by (ql/asc (ql/fk-> (id :checkins :venue_id) (id :venues :name))))))
                   :read))

;; invalid/legacy card should return perms for something that doesn't exist so no one gets to see it
(expect
  #{"/db/0/"}
  (query-perms-set (mbql {:filter [:WOW 100 200]})
                   :read))


;; Test that when somebody archives a Card, it is removed from any Dashboards it belongs to
(expect
  0
  (tt/with-temp* [Dashboard     [dashboard]
                  Card          [card]
                  DashboardCard [dashcard  {:dashboard_id (u/get-id dashboard), :card_id (u/get-id card)}]]
    (db/update! Card (u/get-id card) :archived true)
    (db/count DashboardCard :dashboard_id (u/get-id dashboard))))


;; test that a Card's :public_uuid comes back if public sharing is enabled...
(expect
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card {:public_uuid (str (java.util.UUID/randomUUID))}]
      (boolean (:public_uuid card)))))

;; ...but if public sharing is *disabled* it should come back as `nil`
(expect
  nil
  (tu/with-temporary-setting-values [enable-public-sharing false]
    (tt/with-temp Card [card {:public_uuid (str (java.util.UUID/randomUUID))}]
      (:public_uuid card))))

(ns metabase.models.card-test
  (:require [cheshire.core :as json]
            [expectations :refer :all]
            [metabase.api.common :refer [*current-user-permissions-set*]]
            [metabase.models
             [card :refer :all :as card]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [database :as database]
             [interface :as mi]
             [permissions :as perms]]
            [metabase.query-processor.middleware.expand :as ql]
            [metabase.test
             [data :as data]
             [util :as tu]]
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
       (do (db/insert! DashboardCard :card_id card-id, :dashboard_id (:id (create-dash! (tu/random-name))), :parameter_mappings [])
           (get-dashboard-count))
       (do (db/insert! DashboardCard :card_id card-id, :dashboard_id (:id (create-dash! (tu/random-name))), :parameter_mappings [])
           (get-dashboard-count))])))


;; card-dependencies

(expect
  {:Segment #{2 3}
   :Metric  nil}
  (card-dependencies
   {:dataset_query {:type :query
                    :query {:aggregation ["rows"]
                            :filter      ["AND" [">" 4 "2014-10-19"] ["=" 5 "yes"] ["SEGMENT" 2] ["SEGMENT" 3]]}}}))

(expect
  {:Segment #{1}
   :Metric #{7}}
  (card-dependencies
   {:dataset_query {:type :query
                    :query {:aggregation ["METRIC" 7]
                            :filter      ["AND" [">" 4 "2014-10-19"] ["=" 5 "yes"] ["OR" ["SEGMENT" 1] ["!=" 5 "5"]]]}}}))

(expect
  {:Segment nil
   :Metric  nil}
  (card-dependencies
   {:dataset_query {:type :query
                    :query {:aggregation nil
                            :filter      nil}}}))


;;; ---------------------------------------------- Permissions Checking ----------------------------------------------

(expect
  false
  (tt/with-temp Card [card {:dataset_query {:database (data/id), :type "native"}}]
    (binding [*current-user-permissions-set* (delay #{})]
      (mi/can-read? card))))

(expect
  (tt/with-temp Card [card {:dataset_query {:database (data/id), :type "native"}}]
    (binding [*current-user-permissions-set* (delay #{(perms/native-read-path (data/id))})]
      (mi/can-read? card))))

;; in order to *write* a native card user should need native readwrite access
(expect
  false
  (tt/with-temp Card [card {:dataset_query {:database (data/id), :type "native"}}]
    (binding [*current-user-permissions-set* (delay #{(perms/native-read-path (data/id))})]
      (mi/can-write? card))))

(expect
  (tt/with-temp Card [card {:dataset_query {:database (data/id), :type "native"}}]
    (binding [*current-user-permissions-set* (delay #{(perms/native-readwrite-path (data/id))})]
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
  {:database (data/id)
   :type     :query
   :query    query})

;; MBQL w/o JOIN
(expect
  #{(perms/object-path (data/id) "PUBLIC" (data/id :venues))}
  (query-perms-set (mbql (ql/query
                           (ql/source-table (data/id :venues))))
                   :read))

;; MBQL w/ JOIN
(expect
  #{(perms/object-path (data/id) "PUBLIC" (data/id :checkins))
    (perms/object-path (data/id) "PUBLIC" (data/id :venues))}
  (query-perms-set (mbql (ql/query
                           (ql/source-table (data/id :checkins))
                           (ql/order-by (ql/asc (ql/fk-> (data/id :checkins :venue_id) (data/id :venues :name))))))
                   :read))

;; MBQL w/ nested MBQL query
(defn- query-with-source-card [card]
  {:database database/virtual-id, :type "query", :query {:source_table (str "card__" (u/get-id card))}})

(expect
  #{(perms/object-path (data/id) "PUBLIC" (data/id :venues))}
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :query
                                            :query    {:source-table (data/id :venues)}}}]
    (query-perms-set (query-with-source-card card) :read)))

;; MBQL w/ nested MBQL query including a JOIN
(expect
  #{(perms/object-path (data/id) "PUBLIC" (data/id :checkins))
    (perms/object-path (data/id) "PUBLIC" (data/id :users))}
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :query
                                            :query    {:source-table (data/id :checkins)
                                                       :order-by     [[:asc [:fk-> (data/id :checkins :user_id) (data/id :users :id)]]]}}}]
    (query-perms-set (query-with-source-card card) :read)))

;; MBQL w/ nested NATIVE query
(expect
  #{(perms/native-read-path (data/id))}
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query "SELECT * FROM CHECKINS"}}}]
    (query-perms-set (query-with-source-card card) :read)))

;; You should still only need native READ permissions if you want to save a Card based on another Card you can already
;; READ.
(expect
  #{(perms/native-read-path (data/id))}
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query "SELECT * FROM CHECKINS"}}}]
    (query-perms-set (query-with-source-card card) :write)))

;; However if you just pass in the same query directly as a `:source-query` you will still require READWRITE
;; permissions to save the query since we can't verify that it belongs to a Card that you can view.
(expect
  #{(perms/native-readwrite-path (data/id))}
  (query-perms-set {:database (data/id)
                    :type     :query
                    :query    {:source-query {:native "SELECT * FROM CHECKINS"}}}
                   :write))

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

(defn- dummy-dataset-query [database-id]
  {:database (data/id)
   :type     :native
   :native   {:query "SELECT count(*) FROM toucan_sightings;"}})

(expect
  [{:name "some name"    :database_id (data/id)}
   {:name "another name" :database_id (data/id)}]
  (tt/with-temp Card [{:keys [id] :as card} {:name          "some name"
                                             :dataset_query (dummy-dataset-query (data/id))
                                             :database_id   (data/id)}]
    [(into {} (db/select-one [Card :name :database_id] :id id))
     (do
       (db/update! Card id {:name          "another name"
                            :dataset_query (dummy-dataset-query (data/id))})
       (into {} (db/select-one [Card :name :database_id] :id id)))]))



;;; ------------------------------------------ Circular Reference Detection ------------------------------------------

(defn- card-with-source-table
  "Generate values for a Card with `source-table` for use with `with-temp`."
  {:style/indent 1}
  [source-table & {:as kvs}]
  (merge {:dataset_query {:database (data/id)
                          :type     :query
                          :query    {:source-table source-table}}}
         kvs))

(defn- force-update-card-to-reference-source-table!
  "Skip normal pre-update stuff so we can force a Card to get into an invalid state."
  [card source-table]
  (db/update! Card {:where [:= :id (u/get-id card)]
                    :set   (-> (card-with-source-table source-table
                                 ;; clear out cached read permissions to make sure those aren't used for calcs
                                 :read_permissions nil)
                               ;; we have to manually JSON-encode since we're skipping normal pre-update stuff
                               (update :dataset_query json/generate-string))}))

;; No circular references = it should work!
(expect
  {:card-a #{(perms/object-path (data/id) "PUBLIC" (data/id :venues))}
   :card-b #{(perms/object-path (data/id) "PUBLIC" (data/id :venues))}}
  ;; Make two cards. Card B references Card A.
  (tt/with-temp* [Card [card-a (card-with-source-table (data/id :venues))]
                  Card [card-b (card-with-source-table (str "card__" (u/get-id card-a)))]]
    {:card-a (#'card/card-perms-set-taking-collection-etc-into-account (Card (u/get-id card-a)) :read)
     :card-b (#'card/card-perms-set-taking-collection-etc-into-account (Card (u/get-id card-b)) :read)}))

;; If a Card uses itself as a source, perms calculations should fallback to the 'only admins can see it' perms of
;; #{"/db/0"} (DB 0 will never exist, so regular users will never get to see it, but because admins have root perms,
;; they will still get to see it and perhaps fix it.)
(expect
  Exception
  (tt/with-temp Card [card (card-with-source-table (data/id :venues))]
    ;; now try to make the Card reference itself. Should throw Exception
    (db/update! Card (u/get-id card)
      (card-with-source-table (str "card__" (u/get-id card))))))

;; if for some reason somebody such an invalid Card was already saved in the DB make sure that calculating permissions
;; for it just returns the admin-only #{"/db/0"} perms set
(expect
  #{"/db/0/"}
  (tt/with-temp Card [card (card-with-source-table (data/id :venues))]
    ;; now *make* the Card reference itself
    (force-update-card-to-reference-source-table! card (str "card__" (u/get-id card)))
    ;; ok. Calculate perms. Should fail and fall back to admin-only perms
    (#'card/card-perms-set-taking-collection-etc-into-account (Card (u/get-id card)) :read)))

;; Do the same stuff with circular reference between two Cards... (A -> B -> A)
(expect
  Exception
  (tt/with-temp* [Card [card-a (card-with-source-table (data/id :venues))]
                  Card [card-b (card-with-source-table (str "card__" (u/get-id card-a)))]]
    (db/update! Card (u/get-id card-a)
      (card-with-source-table (str "card__" (u/get-id card-b))))))

(expect
  #{"/db/0/"}
  ;; Make two cards. Card B references Card A
  (tt/with-temp* [Card [card-a (card-with-source-table (data/id :venues))]
                  Card [card-b (card-with-source-table (str "card__" (u/get-id card-a)))]]
    ;; force Card A to reference Card B
    (force-update-card-to-reference-source-table! card-a (str "card__" (u/get-id card-b)))
    ;; perms calc should fail and we should get admin-only perms
    (#'card/card-perms-set-taking-collection-etc-into-account (Card (u/get-id card-a)) :read)))

;; ok now try it with A -> C -> B -> A
(expect
  Exception
  (tt/with-temp* [Card [card-a (card-with-source-table (data/id :venues))]
                  Card [card-b (card-with-source-table (str "card__" (u/get-id card-a)))]
                  Card [card-c (card-with-source-table (str "card__" (u/get-id card-b)))]]
    (db/update! Card (u/get-id card-a)
      (card-with-source-table (str "card__" (u/get-id card-c))))))

(expect
  #{"/db/0/"}
  (tt/with-temp* [Card [card-a (card-with-source-table (data/id :venues))]
                  Card [card-b (card-with-source-table (str "card__" (u/get-id card-a)))]
                  Card [card-c (card-with-source-table (str "card__" (u/get-id card-b)))]]
    ;; force Card A to reference Card C
    (force-update-card-to-reference-source-table! card-a (str "card__" (u/get-id card-c)))
    ;; perms calc should fail and we should get admin-only perms
    (#'card/card-perms-set-taking-collection-etc-into-account (Card (u/get-id card-a)) :read)))


;;; ---------------------------------------------- Updating Read Perms -----------------------------------------------

;; Make sure when saving a new Card read perms get calculated
(expect
  #{(format "/db/%d/native/read/" (data/id))}
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query "SELECT 1"}}}]
    ;; read_permissions should have been populated
    (db/select-one-field :read_permissions Card :id (u/get-id card))))

;; Make sure when updating a Card's query read perms get updated
(expect
  #{(format "/db/%d/schema/PUBLIC/table/%d/" (data/id) (data/id :venues))}
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query "SELECT 1"}}}]
    ;; now change the query...
    (db/update! Card (u/get-id card) :dataset_query {:database (data/id)
                                                     :type     :query
                                                     :query    {:source-table (data/id :venues)}})
    ;; read permissions should have been updated
    (db/select-one-field :read_permissions Card :id (u/get-id card))))

;; Make sure when updating a Card but not changing query read perms do not get changed
(expect
  #{(format "/db/%d/native/read/" (data/id))}
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query "SELECT 1"}}}]
    ;; now change something *besides* the query...
    (db/update! Card (u/get-id card) :name "Cam's super-awesome CARD")
    ;; read permissions should *not* have been updated
    (db/select-one-field :read_permissions Card :id (u/get-id card))))

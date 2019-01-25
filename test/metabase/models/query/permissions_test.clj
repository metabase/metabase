(ns metabase.models.query.permissions-test
  (:require [expectations :refer :all]
            [metabase.api.common :refer [*current-user-id* *current-user-permissions-set*]]
            [metabase.models
             [card :as card :refer :all]
             [collection :refer [Collection]]
             [database :as database :refer [Database]]
             [field :refer [Field]]
             [interface :as mi]
             [permissions :as perms]
             [permissions-group :as perms-group]
             [table :refer [Table]]]
            [metabase.models.query.permissions :as query-perms]
            [metabase.test.data :as data]
            [metabase.test.data.users :as users]
            [metabase.test.util.log :as tu.log]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

;;; ---------------------------------------------- Permissions Checking ----------------------------------------------

(defn- card []
  {:dataset_query {:database (data/id), :type "native"}})

(defn- card-in-collection [collection-or-id]
  (assoc (card) :collection_id (u/get-id collection-or-id)))

;; Shouldn't be able to read a Card not in Collection without permissions
(expect
  false
  (tt/with-temp Card [card (card)]
    (binding [*current-user-permissions-set* (delay #{})]
      (mi/can-read? card))))

;; ...or one in a Collection either!
(expect
  false
  (tt/with-temp* [Collection [collection]
                  Card       [card (card-in-collection collection)]]
    (binding [*current-user-permissions-set* (delay #{})]
      (mi/can-read? card))))

;; *should* be allowed to read a Card not in a Collection if you have Root collection perms
(expect
  (tt/with-temp Card [card (card)]
    (binding [*current-user-permissions-set* (delay #{"/collection/root/read/"})]
      (mi/can-read? card))))

;; ...but not if you have perms for some other Collection
(expect
  false
  (tt/with-temp Card [card (card)]
    (binding [*current-user-permissions-set* (delay #{"/collection/1337/read/"})]
      (mi/can-read? card))))

;; should be allowed to *read* a Card in a Collection if you have read perms for that Collection
(expect
  (tt/with-temp* [Collection [collection]
                  Card       [card (card-in-collection collection)]]
    (binding [*current-user-permissions-set* (delay #{(perms/collection-read-path collection)})]
      (mi/can-read? card))))

;; ...but not if you only have Root Collection perms
(expect
  false
  (tt/with-temp* [Collection [collection]
                  Card       [card (card-in-collection collection)]]
    (binding [*current-user-permissions-set* (delay #{"/collection/root/read/"})]
      (mi/can-read? card))))

;; to *write* a Card not in a Collection you need Root Collection Write Perms
(expect
  (tt/with-temp Card [card (card)]
    (binding [*current-user-permissions-set* (delay #{"/collection/root/"})]
      (mi/can-write? card))))

;; ...root Collection Read Perms shouldn't work
(expect
  false
  (tt/with-temp Card [card (card)]
    (binding [*current-user-permissions-set* (delay #{"/collection/root/read/"})]
      (mi/can-write? card))))

;; ...nor should write perms for another collection
(expect
  false
  (tt/with-temp Card [card (card)]
    (binding [*current-user-permissions-set* (delay #{"/collection/1337/"})]
      (mi/can-write? card))))

;; to *write* a Card *in* a Collection you need Collection Write Perms
(expect
  (tt/with-temp* [Collection [collection]
                  Card       [card (card-in-collection collection)]]
    (binding [*current-user-permissions-set* (delay #{(perms/collection-readwrite-path collection)})]
      (mi/can-write? card))))

;; ...Collection read perms shouldn't work
(expect
  false
  (tt/with-temp* [Collection [collection]
                  Card       [card (card-in-collection collection)]]
    (binding [*current-user-permissions-set* (delay #{(perms/collection-read-path collection)})]
      (mi/can-write? card))))

;; ...nor should write perms for the Root Collection
(expect
  false
  (tt/with-temp* [Collection [collection]
                  Card       [card (card-in-collection collection)]]
    (binding [*current-user-permissions-set* (delay #{"/collection/root/"})]
      (mi/can-write? card))))



;;; ----------------------------------------------- native read perms ------------------------------------------------

(defn- native [query]
  {:database 1
   :type     :native
   :native   {:query query}})

(expect
  #{"/db/1/native/"}
  (query-perms/perms-set (native "SELECT count(*) FROM toucan_sightings;")))


;;; ------------------------------------------------- MBQL w/o JOIN --------------------------------------------------

(expect
  #{(perms/object-path (data/id) "PUBLIC" (data/id :venues))}
  (query-perms/perms-set (data/mbql-query venues)))

(expect
  #{(perms/object-path (data/id) "PUBLIC" (data/id :venues))}
  (query-perms/perms-set
   {:query    {:source-table (data/id :venues)
               :filter       [:> [:field-id (data/id :venues :id)] 10]}
    :type     :query
    :database (data/id)}))

;; if current user is bound, we should ignore that for purposes of calculating query permissions
(tt/expect-with-temp [Database [db]
                      Table    [table {:db_id (u/get-id db), :schema nil}]
                      Field    [_     {:table_id (u/get-id table)}]]
  #{(perms/object-path db nil table)}
  (do
    (perms/revoke-permissions! (perms-group/all-users) db)
    (binding [*current-user-permissions-set* (atom nil)
              *current-user-id*              (users/user->id :rasta)]
      (query-perms/perms-set
       {:database (u/get-id db)
        :type     :query
        :query    {:source-table (u/get-id table)}}))))

;; should be able to calculate permissions of a query before normalization
(expect
  #{(perms/object-path (data/id) "PUBLIC" (data/id :venues))}
  (query-perms/perms-set
   {:query    {"SOURCE_TABLE" (data/id :venues)
               "FILTER"       [">" (data/id :venues :id) 10]}
    :type     :query
    :database (data/id)}))

;;; -------------------------------------------------- MBQL w/ JOIN --------------------------------------------------

;; you should need perms for both tables if you include a JOIN
(expect
  #{(perms/object-path (data/id) "PUBLIC" (data/id :checkins))
    (perms/object-path (data/id) "PUBLIC" (data/id :venues))}
  (query-perms/perms-set
   (data/mbql-query checkins
     {:order-by [[:asc $checkins.venue_id->venues.name]]})))


;;; ------------------------------------------- MBQL w/ nested MBQL query --------------------------------------------

(defn- query-with-source-card [card]
  {:database database/virtual-id, :type "query", :query {:source-table (str "card__" (u/get-id card))}})

;; if source card is *not* in a Collection, we require Root Collection read perms
(expect
  #{"/collection/root/read/"}
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :query
                                            :query    {:source-table (data/id :venues)}}}]
    (query-perms/perms-set (query-with-source-card card))))

;; if source Card *is* in a Collection, we require read perms for that Collection
(tt/expect-with-temp [Collection [collection {}]]
  #{(perms/collection-read-path collection)}
  (tt/with-temp Card [card {:collection_id (u/get-id collection)
                            :dataset_query {:database (data/id)
                                            :type     :query
                                            :query    {:source-table (data/id :venues)}}}]
    (query-perms/perms-set (query-with-source-card card))))


;;; ----------------------------------- MBQL w/ nested MBQL query including a JOIN -----------------------------------

;; If you run a query that uses a Card as its source query, and the source query has a JOIN, then you should still
;; only need Permissions for the Collection that Card is in.
(expect
  #{"/collection/root/read/"}
  (tt/with-temp Card [card {:dataset_query
                            {:database (data/id)
                             :type     :query
                             :query    {:source-table (data/id :checkins)
                                        :order-by     [[:asc [:fk-> (data/id :checkins :user_id) (data/id :users :id)]]]}}}]
    (query-perms/perms-set (query-with-source-card card))))


;;; ------------------------------------------ MBQL w/ nested NATIVE query -------------------------------------------

;; doesn't matter if it's a NATIVE query as the source; you should still just need read perms for the Card's collection
(expect
  #{"/collection/root/read/"}
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query "SELECT * FROM CHECKINS"}}}]
    (query-perms/perms-set (query-with-source-card card))))

;; However if you just pass in the same query directly as a `:source-query` you will still require READWRITE
;; permissions to save the query since we can't verify that it belongs to a Card that you can view.
(expect
  #{(perms/adhoc-native-query-path (data/id))}
  (query-perms/perms-set {:database (data/id)
                          :type     :query
                          :query    {:source-query {:native "SELECT * FROM CHECKINS"}}}))


;;; --------------------------------------------- invalid/legacy queries ---------------------------------------------

;; invalid/legacy queries should return perms for something that doesn't exist so no one gets to see it
(expect
  #{"/db/0/"}
  (tu.log/suppress-output
    (query-perms/perms-set (data/mbql-query venues
                             {:filter [:WOW 100 200]}))))

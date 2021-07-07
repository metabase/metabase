(ns metabase.models.query.permissions-test
  (:require [clojure.test :refer :all]
            [metabase.api.common :refer [*current-user-id* *current-user-permissions-set*]]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models.card :as card :refer :all]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.database :as database :refer [Database]]
            [metabase.models.field :refer [Field]]
            [metabase.models.interface :as mi]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.models.query.permissions :as query-perms]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test :as mt]
            [metabase.util :as u]))

;;; ---------------------------------------------- Permissions Checking ----------------------------------------------

(defn- card []
  {:dataset_query {:database (mt/id), :type "native"}})

(defn- card-in-collection [collection-or-id]
  (assoc (card) :collection_id (u/the-id collection-or-id)))

(deftest card-in-collection-test
  (mt/with-temp Collection [collection]
    (testing "Shouldn't be able to read a Card not in Collection without permissions"
      (mt/with-temp Card [card (card)]
        (binding [*current-user-permissions-set* (delay #{})]
          (is (= false
                 (mi/can-read? card)))))

      (testing "...or one in a Collection either!"
        (mt/with-temp Card [card (card-in-collection collection)]
          (binding [*current-user-permissions-set* (delay #{})]
            (is (= false
                   (mi/can-read? card)))))))

    (testing "*should* be allowed to read a Card not in a Collection if you have Root collection perms"
      (mt/with-temp Card [card (card)]
        (binding [*current-user-permissions-set* (delay #{"/collection/root/read/"})]
          (is (= true
                 (mi/can-read? card))))

        (testing "...but not if you have perms for some other Collection"
          (binding [*current-user-permissions-set* (delay #{"/collection/1337/read/"})]
            (is (= false
                   (mi/can-read? card)))))))

    (testing "should be allowed to *read* a Card in a Collection if you have read perms for that Collection"
      (mt/with-temp Card [card (card-in-collection collection)]
        (binding [*current-user-permissions-set* (delay #{(perms/collection-read-path collection)})]
          (is (= true
                 (mi/can-read? card))))

        (testing "...but not if you only have Root Collection perms"
          (binding [*current-user-permissions-set* (delay #{"/collection/root/read/"})]
            (is (= false
                   (mi/can-read? card)))))))

    (testing "to *write* a Card not in a Collection you need Root Collection Write Perms"
      (mt/with-temp Card [card (card)]
        (binding [*current-user-permissions-set* (delay #{"/collection/root/"})]
          (is (= true
                 (mi/can-write? card))))

        (testing "...root Collection Read Perms shouldn't work"
          (binding [*current-user-permissions-set* (delay #{"/collection/root/read/"})]
            (is (= false
                   (mi/can-write? card))))

          (testing "...nor should write perms for another collection"
            (binding [*current-user-permissions-set* (delay #{"/collection/1337/"})]
              (is (= false
                     (mi/can-write? card))))))))

    (testing "to *write* a Card *in* a Collection you need Collection Write Perms"
      (mt/with-temp Card [card (card-in-collection collection)]
        (binding [*current-user-permissions-set* (delay #{(perms/collection-readwrite-path collection)})]
          (is (= true
                 (mi/can-write? card))))

        (testing "...Collection read perms shouldn't work"
          (binding [*current-user-permissions-set* (delay #{(perms/collection-read-path collection)})]
            (is (= false
                   (mi/can-write? card))))

          (testing "...nor should write perms for the Root Collection"
            (binding [*current-user-permissions-set* (delay #{"/collection/root/"})]
              (is (= false
                     (mi/can-write? card))))))))))



;;; ----------------------------------------------- native read perms ------------------------------------------------

(defn- native [query]
  {:database 1
   :type     :native
   :native   {:query query}})

(deftest native-query-perms-test
  (is (= #{"/db/1/native/"}
         (query-perms/perms-set
          (native "SELECT count(*) FROM toucan_sightings;")))))


;;; ------------------------------------------------- MBQL w/o JOIN --------------------------------------------------

(deftest mbql-query-test
  (is (= #{(perms/table-query-path (mt/id) "PUBLIC" (mt/id :venues))}
         (query-perms/perms-set
          (mt/mbql-query venues))))

  (is (= #{(perms/table-query-path (mt/id) "PUBLIC" (mt/id :venues))}
         (query-perms/perms-set
          {:query    {:source-table (mt/id :venues)
                      :filter       [:> [:field-id (mt/id :venues :id)] 10]}
           :type     :query
           :database (mt/id)})))

  (testing "if current user is bound, we should ignore that for purposes of calculating query permissions"
    (mt/with-temp* [Database [db]
                    Table    [table {:db_id (u/the-id db), :schema nil}]
                    Field    [_     {:table_id (u/the-id table)}]]
      (perms/revoke-permissions! (perms-group/all-users) db)
      (binding [*current-user-permissions-set* (atom nil)
                *current-user-id*              (mt/user->id :rasta)]
        (is (= #{(perms/table-query-path db nil table)}
               (query-perms/perms-set
                {:database (u/the-id db)
                 :type     :query
                 :query    {:source-table (u/the-id table)}}))))))

  (testing "should be able to calculate permissions of a query before normalization"
    (is (= #{(perms/table-query-path (mt/id) "PUBLIC" (mt/id :venues))}
           (query-perms/perms-set
            {:query    {"SOURCE_TABLE" (mt/id :venues)
                        "FILTER"       [">" (mt/id :venues :id) 10]}
             :type     :query
             :database (mt/id)})))))


;;; -------------------------------------------------- MBQL w/ JOIN --------------------------------------------------

(deftest mbql-query-with-join-test
  (testing "you should need perms for both tables if you include a JOIN"
    (is (= #{(perms/table-query-path (mt/id) "PUBLIC" (mt/id :checkins))
             (perms/table-query-path (mt/id) "PUBLIC" (mt/id :venues))}
           (query-perms/perms-set
            (mt/mbql-query checkins
              {:order-by [[:asc $checkins.venue_id->venues.name]]}))))))


;;; ------------------------------------------- MBQL w/ nested MBQL query --------------------------------------------

(defn- query-with-source-card [card]
  {:database mbql.s/saved-questions-virtual-database-id, :type "query", :query {:source-table (str "card__" (u/the-id card))}})

(deftest nested-query-test
  (testing "if source card is *not* in a Collection, we require Root Collection read perms"
    (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                              :type     :query
                                              :query    {:source-table (mt/id :venues)}}}]
      (is (= #{"/collection/root/read/"}
             (query-perms/perms-set
              (query-with-source-card card))))))

  (testing "if source Card *is* in a Collection, we require read perms for that Collection"
    (mt/with-temp* [Collection [collection {}]
                    Card [card {:collection_id (u/the-id collection)
                                :dataset_query {:database (mt/id)
                                                :type     :query
                                                :query    {:source-table (mt/id :venues)}}}]]
      (is (= #{(perms/collection-read-path collection)}
             (query-perms/perms-set
              (query-with-source-card card)))))))


;;; ----------------------------------- MBQL w/ nested MBQL query including a JOIN -----------------------------------

(deftest nested-query-with-join-test
  (testing (str "If you run a query that uses a Card as its source query, and the source query has a JOIN, then you "
                "should still only need Permissions for the Collection that Card is in.")
    (mt/with-temp Card [card {:dataset_query
                              {:database (mt/id)
                               :type     :query
                               :query    {:source-table (mt/id :checkins)
                                          :order-by     [[:asc [:fk-> (mt/id :checkins :user_id) (mt/id :users :id)]]]}}}]
      (is (= #{"/collection/root/read/"}
             (query-perms/perms-set
              (query-with-source-card card)))))))


;;; ------------------------------------------ MBQL w/ nested NATIVE query -------------------------------------------

(deftest nested-native-query-test
  (testing (str "doesn't matter if it's a NATIVE query as the source; you should still just need read perms for the "
                "Card's collection")
    (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                              :type     :native
                                              :native   {:query "SELECT * FROM CHECKINS"}}}]
      (is (= #{"/collection/root/read/"}
             (query-perms/perms-set
              (query-with-source-card card))))))

  (testing (str "However if you just pass in the same query directly as a `:source-query` you will still require "
                "READWRITE permissions to save the query since we can't verify that it belongs to a Card that you can view.")
    (is (= #{(perms/adhoc-native-query-path (mt/id))}
           (query-perms/perms-set
            {:database (mt/id)
             :type     :query
             :query    {:source-query {:native "SELECT * FROM CHECKINS"}}}
            :throw-exceptions? true)))))


;;; --------------------------------------------- invalid/legacy queries ---------------------------------------------

(deftest invalid-queries-test
  (testing "invalid/legacy queries should return perms for something that doesn't exist so no one gets to see it"
    (is (= #{"/db/0/"}
           (query-perms/perms-set
            (mt/mbql-query venues
              {:filter [:WOW 100 200]}))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   JOINS 2.0                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest joins-test
  (testing "Are permissions calculated correctly for JOINs?"
    (mt/with-temp Card [{card-id :id} (qp.test-util/card-with-source-metadata-for-query
                                       (mt/mbql-query checkins
                                         {:aggregation [[:sum $id]]
                                          :breakout    [$user_id]}))]
      (is (= #{(perms/table-query-path (mt/id) "PUBLIC" (mt/id :checkins))
               (perms/table-query-path (mt/id) "PUBLIC" (mt/id :users))}
             (query-perms/perms-set
              (mt/mbql-query users
                {:joins [{:fields       :all
                          :alias        "__alias__"
                          :source-table (str "card__" card-id)
                          :condition    [:=
                                         $id
                                         [:field "USER_ID" {:base-type :type/Integer, :join-alias "__alias__"}]]}]
                 :limit 10})
              :throw-exceptions? true))))

    (is (= #{(perms/table-query-path (mt/id) "PUBLIC" (mt/id :checkins))
             (perms/table-query-path (mt/id) "PUBLIC" (mt/id :users))}
           (query-perms/perms-set
            (mt/mbql-query users
              {:joins [{:alias        "c"
                        :source-table $$checkins
                        :condition    [:= $id &c.*USER_ID/Integer]}]})
            :throw-exceptions? true)))))

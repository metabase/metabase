(ns metabase.query-permissions.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :refer [*current-user-id* *current-user-permissions-set*]]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.permissions.path :as permissions.path]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]))

;;; ---------------------------------------------- Permissions Checking ----------------------------------------------

(defn- card []
  {:dataset_query {:database (mt/id), :type "native"}})

(defn- card-in-collection [collection-or-id]
  (assoc (card) :collection_id (u/the-id collection-or-id)))

(deftest ^:parallel card-in-collection-test
  (mt/with-temp [:model/Collection collection]
    (testing "Shouldn't be able to read a Card not in Collection without permissions"
      (mt/with-temp [:model/Card card (card)]
        (binding [*current-user-permissions-set* (delay #{})]
          (is (not (mi/can-read? card)))))

      (testing "...or one in a Collection either!"
        (mt/with-temp [:model/Card card (card-in-collection collection)]
          (binding [*current-user-permissions-set* (delay #{})]
            (is (not (mi/can-read? card)))))))

    (testing "*should* be allowed to read a Card not in a Collection if you have Root collection perms"
      (mt/with-temp [:model/Card card (card)]
        (binding [*current-user-permissions-set* (delay #{"/collection/root/read/"})]
          (is (mi/can-read? card)))

        (testing "...but not if you have perms for some other Collection"
          (binding [*current-user-permissions-set* (delay #{"/collection/1337/read/"})]
            (is (not (mi/can-read? card)))))))

    (testing "should be allowed to *read* a Card in a Collection if you have read perms for that Collection"
      (mt/with-temp [:model/Card card (card-in-collection collection)]
        (binding [*current-user-permissions-set* (delay #{(permissions.path/collection-read-path collection)})]
          (is (mi/can-read? card)))

        (testing "...but not if you only have Root Collection perms"
          (binding [*current-user-permissions-set* (delay #{"/collection/root/read/"})]
            (is (not (mi/can-read? card)))))))

    (testing "to *write* a Card not in a Collection you need Root Collection Write Perms"
      (mt/with-temp [:model/Card card (card)]
        (binding [*current-user-permissions-set* (delay #{"/collection/root/"})]
          (is (mi/can-write? card)))

        (testing "...root Collection Read Perms shouldn't work"
          (binding [*current-user-permissions-set* (delay #{"/collection/root/read/"})]
            (is (not (mi/can-write? card))))

          (testing "...nor should write perms for another collection"
            (binding [*current-user-permissions-set* (delay #{"/collection/1337/"})]
              (is (not (mi/can-write? card))))))))

    (testing "to *write* a Card *in* a Collection you need Collection Write Perms"
      (mt/with-temp [:model/Card card (card-in-collection collection)]
        (binding [*current-user-permissions-set* (delay #{(permissions.path/collection-readwrite-path collection)})]
          (is (mi/can-write? card)))

        (testing "...Collection read perms shouldn't work"
          (binding [*current-user-permissions-set* (delay #{(permissions.path/collection-read-path collection)})]
            (is (not (mi/can-write? card))))

          (testing "...nor should write perms for the Root Collection"
            (binding [*current-user-permissions-set* (delay #{"/collection/root/"})]
              (is (not (mi/can-write? card))))))))))

(defn- native [query]
  {:database 1
   :type     :native
   :native   {:query query}})

(deftest ^:parallel native-query-perms-test
  (is (= {:perms/create-queries :query-builder-and-native
          :perms/view-data :unrestricted}
         (query-perms/required-perms-for-query
          (native "SELECT count(*) FROM toucan_sightings;")))))

(deftest ^:parallel mbql-query-test
  (is (= {:perms/view-data      {(mt/id :venues) :unrestricted}
          :perms/create-queries {(mt/id :venues) :query-builder}}
         (query-perms/required-perms-for-query (mt/mbql-query venues))))
  (is (= {:perms/view-data      {(mt/id :venues) :unrestricted}
          :perms/create-queries {(mt/id :venues) :query-builder}}
         (query-perms/required-perms-for-query
          {:query    {:source-table (mt/id :venues)
                      :filter       [:> [:field (mt/id :venues :id) nil] 10]}
           :type     :query
           :database (mt/id)}))))

(deftest mbql-query-test-2
  (testing "if current user is bound, we should ignore that for purposes of calculating query permissions"
    (mt/with-temp [:model/Database db    {}
                   :model/Table    table {:db_id (u/the-id db) :schema nil}
                   :model/Field    _     {:table_id (u/the-id table)}]
      (mt/with-no-data-perms-for-all-users!
        (binding [*current-user-permissions-set* (atom nil)
                  *current-user-id*              (mt/user->id :rasta)]
          (is (= {:perms/view-data      {(u/the-id table) :unrestricted}
                  :perms/create-queries {(u/the-id table) :query-builder}}
                 (query-perms/required-perms-for-query
                  {:database (u/the-id db)
                   :type     :query
                   :query    {:source-table (u/the-id table)}}))))))))

(deftest ^:parallel mbql-query-test-3
  (testing "should be able to calculate permissions of a query before normalization"
    (is (= {:perms/view-data      {(mt/id :venues) :unrestricted}
            :perms/create-queries {(mt/id :venues) :query-builder}}
           (query-perms/required-perms-for-query
            {:query    {"SOURCE_TABLE" (mt/id :venues)
                        "FILTER"       [">" (mt/id :venues :id) 10]}
             :type     :query
             :database (mt/id)})))))

(deftest ^:parallel mbql-query-with-join-test
  (testing "you should need perms for both tables if you include a JOIN"
    (is (= {:perms/view-data      {(mt/id :venues) :unrestricted
                                   (mt/id :checkins) :unrestricted}
            :perms/create-queries {(mt/id :venues) :query-builder
                                   (mt/id :checkins) :query-builder}}
           (query-perms/required-perms-for-query
            (mt/mbql-query checkins
              {:order-by [[:asc $checkins.venue_id->venues.name]]}))))))

(defn- query-with-source-card [card]
  {:database lib.schema.id/saved-questions-virtual-database-id, :type "query", :query {:source-table (str "card__" (u/the-id card))}})

(deftest ^:parallel nested-query-test
  (testing "if source card is *not* in a Collection, we require Root Collection read perms"
    (mt/with-temp [:model/Card card {:dataset_query {:database (mt/id)
                                                     :type     :query
                                                     :query    {:source-table (mt/id :venues)}}}]
      (is (= {:paths #{"/collection/root/read/"}}
             (query-perms/required-perms-for-query
              (query-with-source-card card)))))))

(deftest ^:parallel nested-query-test-2
  (testing "if source Card *is* in a Collection, we require read perms for that Collection"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (u/the-id collection)
                                     :dataset_query {:database (mt/id)
                                                     :type     :query
                                                     :query    {:source-table (mt/id :venues)}}}]
      (is (= {:paths #{(permissions.path/collection-read-path collection)}}
             (query-perms/required-perms-for-query
              (query-with-source-card card)))))))

(deftest ^:parallel nested-query-with-join-test
  (testing (str "If you run a query that uses a Card as its source query, and the source query has a JOIN, then you "
                "should still only need Permissions for the Collection that Card is in.")
    (mt/with-temp [:model/Card card {:dataset_query
                                     {:database (mt/id)
                                      :type     :query
                                      :query    {:source-table (mt/id :checkins)
                                                 :order-by     [[:asc [:field (mt/id :users :id) {:source-field (mt/id :checkins :user_id)}]]]}}}]
      (is (= {:paths #{"/collection/root/read/"}}
             (query-perms/required-perms-for-query
              (query-with-source-card card)))))))

(deftest ^:parallel nested-native-query-test
  (testing (str "doesn't matter if it's a NATIVE query as the source; you should still just need read perms for the "
                "Card's collection")
    (mt/with-temp [:model/Card card {:dataset_query {:database (mt/id)
                                                     :type     :native
                                                     :native   {:query "SELECT * FROM CHECKINS"}}}]
      (is (= {:paths #{"/collection/root/read/"}}
             (query-perms/required-perms-for-query
              (query-with-source-card card)))))))

(deftest ^:parallel nested-native-query-test-2
  (testing (str "However if you just pass in the same query directly as a `:source-query` you will still require "
                "READWRITE permissions to save the query since we can't verify that it belongs to a Card that you can view.")
    (is (= {:perms/view-data :unrestricted
            :perms/create-queries :query-builder-and-native}
           (query-perms/required-perms-for-query
            {:database (mt/id)
             :type     :query
             :query    {:source-query {:native "SELECT * FROM CHECKINS"}}}
            :throw-exceptions? true)))))

(deftest ^:parallel invalid-queries-test
  (testing "invalid/legacy queries should return perms for something that doesn't exist so no one gets to see it"
    (is (= {:perms/create-queries {0 :query-builder}}
           (query-perms/required-perms-for-query
            (mt/mbql-query venues
              {:filter [:WOW 100 200]}))))))

(deftest ^:parallel joins-test
  (testing "Are permissions calculated correctly for JOINs?"
    (mt/with-temp [:model/Card {card-id :id} (qp.test-util/card-with-source-metadata-for-query
                                              (mt/mbql-query checkins
                                                {:aggregation [[:sum $id]]
                                                 :breakout    [$user_id]}))]
      (is (= {:card-ids             #{card-id}
              :perms/view-data      {(mt/id :users) :unrestricted
                                     (mt/id :checkins) :unrestricted}
              :perms/create-queries {(mt/id :users) :query-builder}}
             (query-perms/required-perms-for-query
              (mt/mbql-query users
                {:joins [{:fields       :all
                          :alias        "__alias__"
                          :source-table (str "card__" card-id)
                          :condition    [:=
                                         $id
                                         [:field "USER_ID" {:base-type :type/Integer, :join-alias "__alias__"}]]}]
                 :limit 10})
              :throw-exceptions? true)))

      (is (= {:perms/view-data      {(mt/id :users) :unrestricted
                                     (mt/id :checkins) :unrestricted}
              :perms/create-queries {(mt/id :users) :query-builder
                                     (mt/id :checkins) :query-builder}}
             (query-perms/required-perms-for-query
              (mt/mbql-query users
                {:joins [{:alias        "c"
                          :source-table $$checkins
                          :condition    [:= $id &c.*USER_ID/Integer]}]})
              :throw-exceptions? true))))))

(deftest ^:parallel query->source-ids-join-cards-test
  (testing "query->source-ids should return both card IDs when joining one card to another"
    (mt/with-temp [:model/Card {card-1-id :id} (qp.test-util/card-with-source-metadata-for-query
                                                (mt/mbql-query venues
                                                  {:aggregation [[:count]]
                                                   :breakout    [$id]}))
                   :model/Card {card-2-id :id} (qp.test-util/card-with-source-metadata-for-query
                                                (mt/mbql-query checkins
                                                  {:aggregation [[:sum $id]]
                                                   :breakout    [$venue_id]}))]
      (let [query {:database (mt/id)
                   :type     :query
                   :query    {:source-table (str "card__" card-1-id)
                              :joins        [{:fields       :all
                                              :alias        "joined_card"
                                              :source-table (str "card__" card-2-id)
                                              :condition    [:=
                                                             [:field "ID" {:base-type :type/Integer}]
                                                             [:field "VENUE_ID" {:base-type :type/Integer, :join-alias "joined_card"}]]}]}}]
        (is (= #{card-1-id card-2-id}
               (:card-ids
                (query-perms/query->source-ids
                 (qp.preprocess/preprocess
                  query)))))))))

(deftest ^:parallel pmbql-query-test
  (testing "Should be able to calculate permissions for a pMBQL query (#39024)"
    (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          venues            (lib.metadata/table metadata-provider (mt/id :venues))
          query             (lib/query metadata-provider venues)]
      (is (= {:perms/view-data      {(mt/id :venues) :unrestricted}
              :perms/create-queries {(mt/id :venues) :query-builder}}
             (query-perms/required-perms-for-query query))))))

(deftest ^:parallel pmbql-native-query-test
  (testing "Should be able to calculate permissions for a pMBQL native query (#39024)"
    (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          query             (lib/query metadata-provider {:lib/type :mbql.stage/native
                                                          :native   "SELECT *;"})]
      (is (= {:perms/view-data :unrestricted
              :perms/create-queries :query-builder-and-native}
             (query-perms/required-perms-for-query query))))))

(deftest ^:parallel native-query-referenced-card-permissions-test
  (testing (str "Check permissions for native query card reference parameters"
                " (the `:query-permissions/referenced-card-ids` key(s))")
    (mt/with-temp [:model/Collection {collection-1-id :id} {}
                   :model/Collection {collection-2-id :id} {}
                   :model/Card       {card-1-id :id}       {:collection_id collection-1-id}
                   :model/Card       {card-2-id :id}       {:collection_id collection-2-id}]
      (testing "native query"
        (is (= {:perms/create-queries :query-builder-and-native
                :perms/view-data      :unrestricted
                :paths                #{(format "/collection/%d/read/" collection-1-id)
                                        (format "/collection/%d/read/" collection-2-id)}}
               (query-perms/required-perms-for-query
                {:database                              (mt/id)
                 :type                                  :native
                 :native                                "SELECT * FROM (SELECT * FROM whatever);"
                 :query-permissions/referenced-card-ids #{card-1-id card-2-id}}))))
      (testing "MBQL query with native source queries"
        (let [native-query {:database (mt/id)
                            :type     :query
                            :query    {:source-query {:native "SELECT * FROM (SELECT * FROM whatever);"
                                                      :query-permissions/referenced-card-ids #{card-1-id}}
                                       :joins        [{:alias        "J"
                                                       :source-query {:native "SELECT * FROM (SELECT * FROM whatever);"
                                                                      :query-permissions/referenced-card-ids #{card-2-id}}
                                                       :condition    [:= true false]}]}}]
          (is (= {:perms/create-queries :query-builder-and-native
                  :perms/view-data      :unrestricted
                  :paths                #{(format "/collection/%d/read/" collection-1-id)
                                          (format "/collection/%d/read/" collection-2-id)}}
                 (query-perms/required-perms-for-query native-query)))
          (testing "pMBQL query"
            (is (= {:perms/create-queries :query-builder-and-native
                    :perms/view-data      :unrestricted
                    :paths                #{(format "/collection/%d/read/" collection-1-id)
                                            (format "/collection/%d/read/" collection-2-id)}}
                   (query-perms/required-perms-for-query
                    (lib/query (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                               (lib/->pMBQL native-query)))))))))))

(deftest ^:parallel native-query-source-card-id-join-permissions-test
  (testing "MBQL query with native source card (#30077)"
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query {:database (mt/id)
                                                              :type :native
                                                              :native {:query "SELECT * FROM orders"}}}]
      (let [query {:database (mt/id)
                   :type     :query
                   :query    {:source-table (mt/id :products)
                              :joins        [{:alias "Join Alias"
                                              :condition [:= true false]
                                              :source-query
                                              {:qp/stage-is-from-source-card card-id
                                               :native "SELECT * FROM orders"}}]}}]
        ;; The source card of the joined native query is detected, and we don't require full native perms
        (is (= {:card-ids             #{card-id}
                :perms/create-queries {(mt/id :products) :query-builder}
                :perms/view-data      {(mt/id :products) :unrestricted}}
               (query-perms/required-perms-for-query query :already-preprocessed? true)))))))

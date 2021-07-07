(ns metabase-enterprise.sandbox.api.card-test
  (:require [clojure.test :refer :all]
            [metabase.api.card-test :as card-api.test]
            [metabase.models :refer [Card Collection Database PermissionsGroup PermissionsGroupMembership Table]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.test :as mt]
            [metabase.util :as u]))

(deftest users-with-segmented-perms-test
  (testing "Users with segmented permissions should be able to save cards"
    (let [card-name (mt/random-name)]
      (mt/with-model-cleanup [Card]
        (mt/with-temp* [Database                   [db]
                        Collection                 [collection]
                        Table                      [table {:db_id (u/the-id db)}]
                        PermissionsGroup           [group]
                        PermissionsGroupMembership [_ {:user_id (mt/user->id :rasta)
                                                       :group_id (u/the-id group)}]]
          (mt/with-db db
            (perms/revoke-permissions! (perms-group/all-users) db)
            (perms/grant-permissions! group (perms/table-segmented-query-path table))
            (perms/grant-collection-readwrite-permissions! group collection)
            (is (some? ((mt/user->client :rasta) :post 202 "card"
                        (assoc (card-api.test/card-with-name-and-query card-name (card-api.test/mbql-count-query db table))
                               :collection_id (u/the-id collection)))))))))

    (testing "Users with segmented permissions should be able to update the query associated to a card"
      (mt/with-model-cleanup [Card]
        (mt/with-temp* [Database                   [db]
                        Collection                 [collection]
                        Table                      [table {:db_id (u/the-id db)}]
                        PermissionsGroup           [group]
                        PermissionsGroupMembership [_ {:user_id (mt/user->id :rasta)
                                                       :group_id (u/the-id group)}]
                        Card                       [card {:name "Some Name"
                                                          :collection_id (u/the-id collection)}]]
          (mt/with-db db
            (perms/revoke-permissions! (perms-group/all-users) db)
            (perms/grant-permissions! group (perms/table-segmented-query-path table))
            (perms/grant-collection-readwrite-permissions! group collection)
            (is (= "Another Name"
                   (:name ((mt/user->client :rasta) :put 202 (str "card/" (u/the-id card))
                           {:name          "Another Name"
                            :dataset_query (card-api.test/mbql-count-query db table)}))))))))))

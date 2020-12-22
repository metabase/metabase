(ns metabase-enterprise.sandbox.api.card-test
  (:require [clojure.test :refer :all]
            [metabase
             [models :refer [Card Collection Database PermissionsGroup PermissionsGroupMembership Table]]
             [test :as mt]
             [util :as u]]
            [metabase.api.card-test :as card-api.test]
            [metabase.models
             [permissions :as perms]
             [permissions-group :as perms-group]]))

(deftest users-with-segmented-perms-test
  (testing "Users with segmented permissions should be able to save cards"
    (let [card-name (mt/random-name)]
      (mt/with-model-cleanup [Card]
        (mt/with-temp* [Database                   [db]
                        Collection                 [collection]
                        Table                      [table {:db_id (u/get-id db)}]
                        PermissionsGroup           [group]
                        PermissionsGroupMembership [_ {:user_id (mt/user->id :rasta)
                                                       :group_id (u/get-id group)}]]
          (mt/with-db db
            (perms/revoke-permissions! (perms-group/all-users) db)
            (perms/grant-permissions! group (perms/table-segmented-query-path table))
            (perms/grant-collection-readwrite-permissions! group collection)
            (is (some? ((mt/user->client :rasta) :post 202 "card"
                        (assoc (card-api.test/card-with-name-and-query card-name (card-api.test/mbql-count-query db table))
                               :collection_id (u/get-id collection)))))))))

    (testing "Users with segmented permissions should be able to update the query associated to a card"
      (mt/with-model-cleanup [Card]
        (mt/with-temp* [Database                   [db]
                        Collection                 [collection]
                        Table                      [table {:db_id (u/get-id db)}]
                        PermissionsGroup           [group]
                        PermissionsGroupMembership [_ {:user_id (mt/user->id :rasta)
                                                       :group_id (u/get-id group)}]
                        Card                       [card {:name "Some Name"
                                                          :collection_id (u/get-id collection)}]]
          (mt/with-db db
            (perms/revoke-permissions! (perms-group/all-users) db)
            (perms/grant-permissions! group (perms/table-segmented-query-path table))
            (perms/grant-collection-readwrite-permissions! group collection)
            (is (= "Another Name"
                   (:name ((mt/user->client :rasta) :put 202 (str "card/" (u/get-id card))
                           {:name          "Another Name"
                            :dataset_query (card-api.test/mbql-count-query db table)}))))))))))

(ns metabase-enterprise.sandbox.api.card-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.api.card-test :as api.card-test]
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
            (perms/revoke-data-perms! (perms-group/all-users) db)
            (perms/grant-permissions! group (perms/table-segmented-query-path table))
            (perms/grant-collection-readwrite-permissions! group collection)
            (is (some? (mt/user-http-request :rasta :post 200 "card"
                        (assoc (api.card-test/card-with-name-and-query card-name (api.card-test/mbql-count-query db table))
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
            (perms/revoke-data-perms! (perms-group/all-users) db)
            (perms/grant-permissions! group (perms/table-segmented-query-path table))
            (perms/grant-collection-readwrite-permissions! group collection)
            (is (= "Another Name"
                   (:name (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card))
                           {:name          "Another Name"
                            :dataset_query (api.card-test/mbql-count-query db table)}))))))))))

(deftest parameters-with-source-is-card-test
  (testing "a card with a parameter whose source is a card should respect sandboxing"
    (met/with-gtaps {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:<= $id 3]})}}}
      (mt/with-temp*
        [Card [{source-card-id :id}
               {:database_id   (mt/id)
                :table_id      (mt/id :categories)
                :dataset_query (mt/mbql-query categories)}]
         Card [{card-id         :id}
               {:database_id     (mt/id)
                :dataset_query   (mt/mbql-query categories)
                :parameters      [{:id                   "abc"
                                   :type                 "category"
                                   :name                 "CATEGORY"
                                   :values_source_type   "card"
                                   :values_source_config {:card_id     source-card-id
                                                          :value_field (mt/$ids $categories.name)}}]
                :table_id        (mt/id :venues)}]]

        (testing "when getting values"
          (let [get-values (fn [user]
                             (mt/user-http-request user :get 200 (api.card-test/param-values-url card-id "abc")))]
            ;; returns much more if not sandboxed
            (is (> (-> (get-values :crowberto) :values count) 3))
            (is (=? {:values          ["African" "American" "Artisan"]
                     :has_more_values false}
                    (get-values :rasta)))))

        (testing "when searching values"
          ;; return BBQ if not sandboxed
          (let [search (fn [user]
                         (mt/user-http-request user :get 200 (api.card-test/param-values-url card-id "abc" "bbq")))]
            (is (=? {:values          ["BBQ"]
                     :has_more_values false}
                    (search :crowberto)))

            (is (=? {:values          []
                     :has_more_values false}
                    (search :rasta)))))))))

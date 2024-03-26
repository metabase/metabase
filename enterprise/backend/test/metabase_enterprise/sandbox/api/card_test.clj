(ns metabase-enterprise.sandbox.api.card-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.api.card-test :as api.card-test]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.permissions :as perms]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest users-with-segmented-perms-test
  (testing "Users with segmented permissions should be able to save cards"
    (let [card-name (mt/random-name)]
      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/Database                   db {}
                       :model/Collection                 collection {}
                       :model/Table                      table {:db_id (u/the-id db)}
                       :model/PermissionsGroup           group {}
                       :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta)
                                                            :group_id (u/the-id group)}
                       :model/GroupTableAccessPolicy     _ {:group_id (u/the-id group)
                                                            :table_id (u/the-id table)}]
          (mt/with-db db
            (mt/with-no-data-perms-for-all-users!
              (data-perms/set-database-permission! group db :perms/view-data :unrestricted)
              (data-perms/set-table-permission! group table :perms/create-queries :query-builder)
              (perms/grant-collection-readwrite-permissions! group collection)
              (is (some? (mt/user-http-request :rasta :post 200 "card"
                                               (assoc (api.card-test/card-with-name-and-query card-name (api.card-test/mbql-count-query db table))
                                                      :collection_id (u/the-id collection))))))))))

    (testing "Users with segmented permissions should be able to update the query associated to a card"
      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/Database                   db {}
                       :model/Collection                 collection {}
                       :model/Table                      table {:db_id (u/the-id db)}
                       :model/PermissionsGroup           group {}
                       :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta)
                                                            :group_id (u/the-id group)}
                       :model/Card                       card {:name "Some Name"
                                                               :collection_id (u/the-id collection)}
                       :model/GroupTableAccessPolicy     _    {:group_id (u/the-id group)
                                                               :table_id (u/the-id table)}]
          (mt/with-db db
            (mt/with-no-data-perms-for-all-users!
              (data-perms/set-database-permission! group db :perms/view-data :unrestricted)
              (data-perms/set-table-permission! group table :perms/create-queries :query-builder)
              (perms/grant-collection-readwrite-permissions! group collection)
              (is (= "Another Name"
                     (:name (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card))
                                                  {:name          "Another Name"
                                                   :dataset_query (api.card-test/mbql-count-query db table)})))))))))))

(deftest parameters-with-source-is-card-test
  (testing "a card with a parameter whose source is a card should respect sandboxing"
    (met/with-gtaps! {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:<= $id 3]})}}}
      (mt/with-temp
          [:model/Card {source-card-id :id} {:database_id   (mt/id)
                                             :table_id      (mt/id :categories)
                                             :dataset_query (mt/mbql-query categories)}
           :model/Card {card-id         :id} {:database_id     (mt/id)
                                              :dataset_query   (mt/mbql-query categories)
                                              :parameters      [{:id                   "abc"
                                                                 :type                 "category"
                                                                 :name                 "CATEGORY"
                                                                 :values_source_type   "card"
                                                                 :values_source_config {:card_id     source-card-id
                                                                                        :value_field (mt/$ids $categories.name)}}]
                                              :table_id        (mt/id :venues)}]

        (testing "when getting values"
          (let [get-values (fn [user]
                             (mt/user-http-request user :get 200 (api.card-test/param-values-url card-id "abc")))]
            ;; returns much more if not sandboxed
            (is (> (-> (get-values :crowberto) :values count) 3))
            (is (=? {:values          [["African"] ["American"] ["Artisan"]]
                     :has_more_values false}
                    (get-values :rasta)))))

        (testing "when searching values"
          ;; return BBQ if not sandboxed
          (let [search (fn [user]
                         (mt/user-http-request user :get 200 (api.card-test/param-values-url card-id "abc" "bbq")))]
            (is (=? {:values          [["BBQ"]]
                     :has_more_values false}
                    (search :crowberto)))

            (is (=? {:values          []
                     :has_more_values false}
                    (search :rasta)))))))))

(deftest is-sandboxed-test
  (testing "Adding a GTAP to the all users group to a table makes it such that is_sandboxed returns true."
    (met/with-gtaps! {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:<= $id 3]})}}}
      (t2.with-temp/with-temp [:model/Card card {:database_id   (mt/id)
                                                 :table_id      (mt/id :categories)
                                                 :dataset_query (mt/mbql-query categories)}]
        (is (=? {:data {:is_sandboxed true}}
                (qp/process-query (qp/userland-query (:dataset_query card)))))))))

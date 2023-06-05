(ns metabase-enterprise.sandbox.api.permissions-test
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.models.group-table-access-policy
    :refer [GroupTableAccessPolicy]]
   [metabase-enterprise.test :as met]
   [metabase.models
    :refer [Card Database PermissionsGroup PersistedInfo Table]]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- db-graph-keypath [group]
  [:groups (u/the-id group) (mt/id) :data])

(defn- venues-perms-graph-keypath [group]
  (concat
   (db-graph-keypath group)
   [:schemas :PUBLIC (mt/id :venues)]))

(deftest revoke-perms-delete-gtaps-test
  (testing "PUT /api/permissions/graph"
    (testing "removing sandboxed permissions for a group should delete the associated GTAP (#16190)"
      (doseq [[message {:keys [updated-db-perms expected-perms]}]
              {"when revoking all permissions for DB"
               {:updated-db-perms (constantly {:native :none, :schemas :none})
                :expected-perms   (constantly nil)}

               "when revoking all permissions for schema"
               {:updated-db-perms (constantly {:native :none, :schemas {:PUBLIC :none}})
                :expected-perms   (constantly nil)}

               "when revoking all permissions for Table"
               {:updated-db-perms (fn []
                                    {:native :none, :schemas {:PUBLIC {(mt/id :venues) :none
                                                                       (mt/id :users)  :all}}})
                :expected-perms   (fn []
                                    {:schemas {:PUBLIC {(mt/id :users) "all"}}})}

               "when revoking segmented query permissions for Table"
               {:updated-db-perms (fn []
                                    {:native :none, :schemas {:PUBLIC {(mt/id :venues) {:read :all}}}})
                :expected-perms   (fn []
                                    {:schemas {:PUBLIC {(mt/id :venues) {:read "all"}}}})}

               "when changing permissions for DB to unrestricted access"
               {:updated-db-perms (constantly {:native :none, :schemas :all})
                :expected-perms   (constantly {:schemas "all"})}

               "when changing permissions for schema to unrestricted access"
               {:updated-db-perms (constantly {:native :none, :schemas {:PUBLIC :all}})
                :expected-perms   (constantly {:schemas {:PUBLIC "all"}})}

               "when changing permissions for Table to :query [grant full query perms]"
               {:updated-db-perms (fn []
                                    {:native :none, :schemas {:PUBLIC {(mt/id :venues) {:query :all}}}})
                :expected-perms   (fn []
                                    {:schemas {:PUBLIC {(mt/id :venues) {:query "all"}}}})}}]
        (met/with-gtaps {:gtaps {:venues {}}}
          (testing message
            (testing "sanity check"
              (testing "perms graph endpoint should return segmented perms for Venues table"
                (is (= {:query "segmented"}
                       (get-in (mt/user-http-request :crowberto :get 200 "permissions/graph")
                               (venues-perms-graph-keypath &group)))))
              (testing "GTAP should exist in application DB"
                (is (schema= [(s/one {:id                   su/IntGreaterThanZero
                                      :group_id             (s/eq (u/the-id &group))
                                      :table_id             (s/eq (mt/id :venues))
                                      :card_id              (s/eq nil)
                                      :attribute_remappings (s/eq nil)
                                      s/Keyword             s/Any}
                                     "GTAP")]
                             (t2/select GroupTableAccessPolicy :group_id (u/the-id &group))))))
            (let [graph    (mt/user-http-request :crowberto :get 200 "permissions/graph")
                  graph'   (assoc-in graph (db-graph-keypath &group) (updated-db-perms))
                  response (mt/user-http-request :crowberto :put 200 "permissions/graph" graph')]
              (mt/with-temp* [Database               [db-2]
                              Table                  [db-2-table {:db_id (u/the-id db-2)}]
                              GroupTableAccessPolicy [_ {:group_id (u/the-id &group)
                                                         :table_id (u/the-id db-2-table)}]
                              PermissionsGroup       [other-group]
                              GroupTableAccessPolicy [_ {:group_id (u/the-id other-group)
                                                         :table_id (mt/id :venues)}]]
                (testing "perms graph should be updated"
                  (testing "in API request response"
                    (is (= (expected-perms)
                           (get-in response (db-graph-keypath &group)))))
                  (testing "on subsequent fetch of the graph"
                    (is (= (expected-perms)
                           (get-in (mt/user-http-request :crowberto :get 200 "permissions/graph")
                                   (db-graph-keypath &group))))))
                (testing "GTAP should be deleted from application DB"
                  (is (= []
                         (t2/select GroupTableAccessPolicy
                                    :group_id (u/the-id &group)
                                    :table_id (mt/id :venues)))))
                (testing "GTAP for same group, other database should not be affected"
                  (is (schema= [(s/one {:id                   su/IntGreaterThanZero
                                        :group_id             (s/eq (u/the-id &group))
                                        :table_id             (s/eq (u/the-id db-2-table))
                                        :card_id              (s/eq nil)
                                        :permission_id        (s/eq nil)
                                        :attribute_remappings (s/eq nil)}
                                       "GTAP")]
                               (t2/select GroupTableAccessPolicy
                                          :group_id (u/the-id &group)
                                          :table_id (u/the-id db-2-table)))))
                (testing "GTAP for same table, other group should not be affected"
                  (is (schema= [(s/one {:id                   su/IntGreaterThanZero
                                        :group_id             (s/eq (u/the-id other-group))
                                        :table_id             (s/eq (mt/id :venues))
                                        :card_id              (s/eq nil)
                                        :permission_id        (s/eq nil)
                                        :attribute_remappings (s/eq nil)}
                                       "GTAP")]
                               (t2/select GroupTableAccessPolicy :group_id (u/the-id other-group)))))))))))))

(deftest grant-sandbox-perms-dont-delete-gtaps-test
  (testing "PUT /api/permissions/graph"
    (testing "granting sandboxed permissions for a group should *not* delete an associated GTAP (#16190)"
      (mt/with-temp-copy-of-db
        (t2.with-temp/with-temp [GroupTableAccessPolicy _ {:group_id (u/the-id (perms-group/all-users))
                                                           :table_id (mt/id :venues)}]
          (let [graph    (mt/user-http-request :crowberto :get 200 "permissions/graph")
                graph'   (assoc-in graph (db-graph-keypath (perms-group/all-users))
                                   {:schemas
                                    {"PUBLIC"
                                     {(mt/id :venues)
                                      {:read :all, :query :segmented}}}})]
            (mt/user-http-request :crowberto :put 200 "permissions/graph" graph')
            (testing "GTAP should not have been deleted"
              (is (t2/exists? GroupTableAccessPolicy :group_id (u/the-id (perms-group/all-users)), :table_id (mt/id :venues))))))))))

(defn- fake-persist-card! [card]
  (let [persisted-info (persisted-info/turn-on-model! (mt/user->id :rasta) card)]
    (t2/update! PersistedInfo {:card_id (u/the-id card)}
                {:definition (json/encode
                               (persisted-info/metadata->definition
                                 (:result_metadata card)
                                 (:table_name persisted-info)))
                 :active true
                 :state "persisted"
                 :query_hash (persisted-info/query-hash (:dataset_query card))})))

(deftest persistence-and-permissions
  (mt/with-model-cleanup [PersistedInfo]
    (testing "Queries from cache if not sandboxed"
      (mt/with-current-user (mt/user->id :rasta)
        (mt/with-temp*
          [Card [card {:dataset_query (mt/mbql-query venues)
                       :dataset true
                       :database_id (mt/id)}]]
          (fake-persist-card! card)
          (is (str/includes?
               (:query (qp/compile

                        {:database (mt/id)
                         :query {:source-table (str "card__" (u/the-id card))}
                         :type :query}))
               "metabase_cache")))))
    (testing "Queries from source if sandboxed"
      (met/with-gtaps
        {:gtaps {:venues {:query (mt/mbql-query venues)
                          :remappings {:cat ["variable" [:field (mt/id :venues :category_id) nil]]}}}
         :attributes {"cat" 50}}
        (mt/with-temp*
          [Card [card {:dataset_query (mt/mbql-query venues)
                       :dataset true
                       :database_id (mt/id)}]]
          (fake-persist-card! card)
          (is (not (str/includes?
                    (:query (qp/compile
                             {:database (mt/id)
                              :query {:source-table (str "card__" (u/the-id card))}
                              :type :query}))
                    "metabase_cache"))))))))

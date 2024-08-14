(ns metabase-enterprise.advanced-permissions.models.permissions.block-permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.models.group-table-access-policy
    :refer [GroupTableAccessPolicy]]
   [metabase.models
    :refer [Card
            Collection
            Database
            Permissions
            PermissionsGroup
            PermissionsGroupMembership
            User]]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.data-permissions.graph :as data-perms.graph]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

;;;; Graph-related stuff

(defn- test-db-perms [group-id]
  (get-in (data-perms.graph/api-graph) [:groups group-id (mt/id) :view-data]))

(defn- api-test-db-perms [group-id]
  (not-empty
   (into {}
         (map (fn [[k v]]
                [k (cond-> v (string? v) keyword)]))
         (get-in (mt/user-http-request :crowberto :get 200 "permissions/graph")
                 [:groups group-id (mt/id) :view-data]))))

(deftest graph-test
  (testing "block permissions are ellided from the graph"
    (doseq [[message perms] {"the graph function"
                             test-db-perms

                             "the API"
                             api-test-db-perms}]
      (testing (str message "\n"))
      (mt/with-temp [PermissionsGroup {group-id :id} {}]
        (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :blocked)
        (is (nil? (perms group-id)))))))

(defn- grant-block-perms! [group-id]
  (data-perms.graph/update-data-perms-graph!
   (-> (data-perms.graph/api-graph)
       (assoc-in [:groups group-id (mt/id) :view-data] :blocked)
       (assoc-in [:groups group-id (mt/id) :create-queries] :no))))

(defn- api-grant-block-perms! [group-id]
  (let [current-graph (data-perms.graph/api-graph)
        new-graph     (assoc-in current-graph [:groups group-id (mt/id) :view-data] :blocked)
        result        (mt/with-premium-features #{:advanced-permissions}
                        (mt/user-http-request :crowberto :put 200 "permissions/graph" new-graph))]
    (is (nil? (get-in result [:groups group-id (mt/id) :view-data])))))

(deftest api-throws-error-if-premium-feature-not-enabled
  (testing "PUT /api/permissions/graph"
    (testing (str "fails when a group has a block permission set, and the instance doesn't have the "
                  ":advanced-permissions premium feature enabled")
      (t2.with-temp/with-temp [PermissionsGroup {group-id :id}]
        ;; Revoke native perms so that we can set block perms
        (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :query-builder)
        (let [current-graph (data-perms.graph/api-graph)
              new-graph     (assoc-in current-graph [:groups group-id (mt/id) :view-data] :blocked)
              result        (mt/with-premium-features #{} ; disable premium features
                              (mt/user-http-request :crowberto :put 402 "permissions/graph" new-graph))]
          (is (= "The blocked permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
                 result)))))))

(deftest update-graph-test
  (testing "Should be able to set block permissions with"
    (doseq [[description grant!] {"the graph update function"
                                  (fn [group-id]
                                    (mt/with-premium-features #{:advanced-permissions}
                                      (grant-block-perms! group-id)))

                                  "the perms graph API endpoint"
                                  api-grant-block-perms!}]
      (testing (str description "\n")
        (t2.with-temp/with-temp [PermissionsGroup {group-id :id}]
          (testing "Group should have unrestricted view-data perms upon creation"
            (is (= :unrestricted
                   (test-db-perms group-id)))
            ; Revoke native perms so that we can set block perms
            (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :query-builder)
            (testing "group has no existing permissions"
              (mt/with-restored-data-perms-for-group! group-id
                (grant! group-id)
                (is (nil? (test-db-perms group-id))))))
          (testing "group has existing data permissions... :block should remove them"
            (mt/with-restored-data-perms-for-group! group-id
              (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :unrestricted)
              (grant! group-id)
              (is (nil? (test-db-perms group-id)))
              (is (= #{:blocked}
                     (t2/select-fn-set :perm_value
                                       :model/DataPermissions
                                       {:where [:and
                                                [:= :db_id (mt/id)]
                                                [:= :group_id group-id]
                                                [:= :perm_type (u/qualified-name :perms/view-data)]]}))))))))))

(deftest update-graph-delete-sandboxes-test
  (testing "When setting `:blocked` permissions any GTAP rows for that Group/Database should get deleted."
    (mt/with-premium-features #{:sandboxes :advanced-permissions}
      (mt/with-model-cleanup [Permissions]
        (mt/with-temp [PermissionsGroup       {group-id :id} {}
                       GroupTableAccessPolicy _ {:table_id (mt/id :venues)
                                                 :group_id group-id}]
          (grant-block-perms! group-id)
          (is (nil? (test-db-perms group-id)))
          (is (not (t2/exists? GroupTableAccessPolicy :group_id group-id))))))))

(deftest update-graph-data-perms-should-delete-block-perms-test
 (testing "granting data permissions for a table should delete existing block permissions"
   (mt/with-temp [PermissionsGroup {group-id :id} {}]
     (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :blocked)
     (is (nil? (test-db-perms group-id)))
     (data-perms/set-table-permission! group-id (mt/id :venues) :perms/view-data :unrestricted)
     (is (= {"PUBLIC" :unrestricted}
            (test-db-perms group-id))))))

(deftest update-graph-disallow-native-query-perms-test
  (testing "Disallow block permissions + native query permissions"
    (mt/with-temp [PermissionsGroup {group-id :id} {}]
      (testing "via the fn"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid DB permissions: If you have write access for native queries, you must have data access to all schemas."
             (data-perms.graph/update-data-perms-graph! [group-id (mt/id)] {:view-data :blocked
                                                                            :create-queries :query-builder-and-native}))))
      (testing "via the API"
        (let [current-graph (data-perms.graph/api-graph)
              new-graph     (assoc-in current-graph
                                      [:groups group-id (mt/id)]
                                      {:view-data :blocked :create-queries :query-builder-and-native})]
          (is (=? #"Cannot parse permissions graph because it is invalid.*"
                  (mt/with-premium-features #{:advanced-permissions}
                    (mt/user-http-request :crowberto :put 400 "permissions/graph" new-graph)))))))))

(deftest delete-database-delete-block-perms-test
  (testing "If a Database gets DELETED, any block permissions for it should get deleted too."
    (mt/with-temp [Database    {db-id :id} {}]
      (data-perms/set-database-permission! (u/the-id (perms-group/all-users)) db-id :perms/view-data :blocked)
      (letfn [(perms-exist? []
                (t2/exists? :model/DataPermissions :db_id db-id :perm_value :blocked))]
        (is (perms-exist?))
        (t2/delete! Database :id db-id)
        (is (not (perms-exist?)))))))

;;;; QP perms-check related stuff.

(deftest qp-block-permissions-test
  (mt/with-temp-copy-of-db
    (let [query {:database (mt/id)
                 :type     :query
                 :query    {:source-table (mt/id :venues)
                            :limit        1}}]
      (mt/with-temp [User                       {user-id :id} {}
                     PermissionsGroup           {group-id :id} {}
                     PermissionsGroupMembership _ {:group_id group-id :user_id user-id}
                     Collection                 {collection-id :id} {}
                     Card                       {card-id :id} {:collection_id collection-id
                                                               :dataset_query query}
                     Permissions                _ {:group_id group-id :object (perms/collection-read-path collection-id)}]
        (mt/with-premium-features #{:advanced-permissions}
          (mt/with-no-data-perms-for-all-users!
            (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
            (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :no)
            (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :unrestricted)
            (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :no)
            (letfn [(run-ad-hoc-query []
                      (mt/with-current-user user-id
                        (qp/process-query query)))
                    (run-saved-question []
                      (binding [qp.perms/*card-id* card-id]
                        (run-ad-hoc-query)))
                    (check-block-perms []
                      (mt/with-current-user user-id
                        (#'qp.perms/check-block-permissions query)))]
              (testing "sanity check: should not be able to run ad-hoc query"
                (is (thrown-with-msg?
                     clojure.lang.ExceptionInfo
                     #"You do not have permissions to run this query"
                     (run-ad-hoc-query))))
              (testing "sanity check: should be able to run query as saved Question before block perms are set."
                (is (run-saved-question))
                (is (= true (check-block-perms))))
              ;; 'grant' the block permissions.
              (testing "the highest permission level from any group wins (block doesn't override other groups anymore)"
                (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :blocked)
                (testing "if EE token does not have the `:advanced-permissions` feature: should not do check"
                  (mt/with-premium-features #{}
                    (is (nil? (check-block-perms)))))
                (testing "should still not be able to run ad-hoc query"
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"You do not have permissions to run this query"
                       (run-ad-hoc-query))))
                (testing "should STILL be able to run query as saved Question"
                  (is (run-saved-question))
                  (is (= true (check-block-perms)))))
              (testing "once blocked in all groups, now access is truly blocked"
                (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :blocked)
                (testing "disallow running the query"
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"Blocked: you are not allowed to run queries against Database \d+"
                       (check-block-perms)))
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"Blocked: you are not allowed to run queries against Database \d+"
                       (run-saved-question))))))))))))

(deftest legacy-no-self-service-test
  (mt/with-temp-copy-of-db
    (let [query {:database (mt/id)
                 :type     :query
                 :query    {:source-table (mt/id :venues)
                            :limit        1}}]
      (mt/with-temp [User                       {user-id :id} {}
                     PermissionsGroup           {group-id :id} {}
                     PermissionsGroupMembership _ {:group_id group-id :user_id user-id}]
        (mt/with-premium-features #{:advanced-permissions}
          (mt/with-no-data-perms-for-all-users!
            (testing "legacy-no-self-service does not override block perms for a table"
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :blocked)
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :no)
              (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :legacy-no-self-service)
              (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :no)
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"Blocked: you are not allowed to run queries against Database \d+"
                   (mt/with-current-user user-id
                     (#'qp.perms/check-block-permissions query)))))

            (testing "unrestricted overrides block perms for a table even if other tables have legacy-no-self-service"
              (data-perms/set-table-permission! group-id (mt/id :venues) :perms/view-data :unrestricted)
              (data-perms/set-table-permission! group-id (mt/id :orders) :perms/view-data :legacy-no-self-service)
              (is (true? (mt/with-current-user user-id
                           (#'qp.perms/check-block-permissions query)))))))))))

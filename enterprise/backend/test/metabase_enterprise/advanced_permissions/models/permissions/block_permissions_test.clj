(ns metabase-enterprise.advanced-permissions.models.permissions.block-permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.models.group-table-access-policy
    :refer [GroupTableAccessPolicy]]
   [metabase.api.common :as api]
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
  (get-in (data-perms.graph/api-graph) [:groups group-id (mt/id) :data]))

(defn- api-test-db-perms [group-id]
  (into {}
        (map (fn [[k v]]
               [k (cond-> v (string? v) keyword)]))
        (get-in (mt/user-http-request :crowberto :get 200 "permissions/graph")
                [:groups group-id (mt/id) :data])))

(deftest graph-test
  (testing "block permissions should come back from"
    (doseq [[message perms] {"the graph function"
                             test-db-perms

                             "the API"
                             api-test-db-perms}]
      (testing (str message "\n"))
      (mt/with-temp [PermissionsGroup {group-id :id} {}]
        (data-perms/set-database-permission! group-id (mt/id) :perms/data-access :block)
        (is (= {:schemas :block}
               (perms group-id)))))))

(defn- grant-block-perms! [group-id]
  (data-perms.graph/update-data-perms-graph! [group-id (mt/id) :data] {:schemas :block}))

(defn- api-grant-block-perms! [group-id]
  (let [current-graph (data-perms.graph/api-graph)
        new-graph     (assoc-in current-graph [:groups group-id (mt/id) :data] {:schemas :block})
        result        (mt/with-premium-features #{:advanced-permissions}
                        (mt/user-http-request :crowberto :put 200 "permissions/graph" new-graph))]
    (is (= "block"
           (get-in result [:groups group-id (mt/id) :data :schemas])))))

(deftest api-throws-error-if-premium-feature-not-enabled
  (testing "PUT /api/permissions/graph"
    (testing (str "fails when a group has a block permission set, and the instance doesn't have the "
                  ":advanced-permissions premium feature enabled")
      (t2.with-temp/with-temp [PermissionsGroup {group-id :id}]
        (let [current-graph (data-perms.graph/api-graph)
              new-graph     (assoc-in current-graph [:groups group-id (mt/id) :data] {:schemas :block})
              result        (mt/with-premium-features #{} ; disable premium features
                              (mt/user-http-request :crowberto :put 402 "permissions/graph" new-graph))]
          (is (= "The block permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
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
          (testing "Group should have no perms upon creation"
            (is (= nil
                   (test-db-perms group-id))))
          (testing "group has no existing permissions"
            (mt/with-model-cleanup [Permissions]
              (mt/with-restored-data-perms-for-group! group-id
                (grant! group-id)
                (is (= {:schemas :block}
                       (test-db-perms group-id))))))
          (testing "group has existing data permissions... :block should remove them"
            (mt/with-model-cleanup [Permissions]
              (mt/with-restored-data-perms-for-group! group-id
                (data-perms/set-database-permission! group-id (mt/id) :perms/data-access :unrestricted)
                (grant! group-id)
                (is (= {:schemas :block}
                       (test-db-perms group-id)))
                (is (= #{:block}
                       (t2/select-fn-set :perm_value
                                         :model/DataPermissions
                                         {:where [:and
                                                  [:= :db_id (mt/id)]
                                                  [:= :group_id group-id]
                                                  [:= :perm_type (u/qualified-name :perms/data-access)]]})))))))))))

(deftest update-graph-delete-sandboxes-test
  (testing "When setting `:block` permissions any GTAP rows for that Group/Database should get deleted."
    (mt/with-premium-features #{:sandboxes :advanced-permissions}
      (mt/with-model-cleanup [Permissions]
        (mt/with-temp [PermissionsGroup       {group-id :id} {}
                       GroupTableAccessPolicy _ {:table_id (mt/id :venues)
                                                 :group_id group-id}]
          (grant-block-perms! group-id)
          (is (= {:schemas :block}
                 (test-db-perms group-id)))
          (is (not (t2/exists? GroupTableAccessPolicy :group_id group-id))))))))

(deftest update-graph-data-perms-should-delete-block-perms-test
 (testing "granting data permissions for a table should delete existing block permissions"
   (mt/with-temp [PermissionsGroup {group-id :id} {}]
     (data-perms/set-database-permission! group-id (mt/id) :perms/data-access :block)
     (is (= {:schemas :block}
            (test-db-perms group-id)))
     (data-perms/set-table-permission! group-id (mt/id :venues) :perms/data-access :unrestricted)
     (is (= {:schemas {"PUBLIC" {(mt/id :venues) :all}}}
            (test-db-perms group-id))))))

(deftest update-graph-disallow-native-query-perms-test
  (testing "Disallow block permissions + native query permissions"
    (mt/with-temp [PermissionsGroup {group-id :id} {}]
      (testing "via the fn"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             ;; TODO -- this error message is totally garbage, fix this
             #"Invalid DB permissions: If you have write access for native queries, you must have data access to all schemas."
             ;; #"DB permissions with a valid combination of values for :native and :schemas"
             (data-perms.graph/update-data-perms-graph! [group-id (mt/id) :data]
                                                        {:schemas :block, :native :write}))))
      (testing "via the API"
        (let [current-graph (data-perms.graph/api-graph)
              new-graph     (assoc-in current-graph
                                      [:groups group-id (mt/id) :data]
                                      {:schemas :block, :native :write})]
          (is (=? {:message  #".*Invalid DB permissions: If you have write access for native queries, you must have data access to all schemas.*"}
                  (mt/with-premium-features #{:advanced-permissions}
                    (mt/user-http-request :crowberto :put 500 "permissions/graph" new-graph)))))))))

(deftest delete-database-delete-block-perms-test
  (testing "If a Database gets DELETED, any block permissions for it should get deleted too."
    (mt/with-temp [Database    {db-id :id} {}]
      (data-perms/set-database-permission! (u/the-id (perms-group/all-users)) db-id :perms/data-access :block)
      (letfn [(perms-exist? []
                (t2/exists? :model/DataPermissions :db_id db-id :perm_value :block))]
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
            (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/data-access :no-self-service)
            (data-perms/set-database-permission! group-id (mt/id) :perms/data-access :no-self-service)
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
                (is (not (contains? @api/*current-user-permissions-set*
                                    (perms/data-perms-path (mt/id)))))
                (is (thrown-with-msg?
                     clojure.lang.ExceptionInfo
                     #"You do not have permissions to run this query"
                     (run-ad-hoc-query))))
              (testing "sanity check: should be able to run query as saved Question before block perms are set."
                (is (run-saved-question))
                (is (= true (check-block-perms))))
              ;; 'grant' the block permissions.
              (data-perms/set-database-permission! group-id (mt/id) :perms/data-access :block)
              (testing "if EE token does not have the `:advanced-permissions` feature: should not do check"
                (mt/with-premium-features #{}
                  (is (nil? (check-block-perms)))))
              (testing "disallow running the query"
                (is (thrown-with-msg?
                     clojure.lang.ExceptionInfo
                     #"Blocked: you are not allowed to run queries against Database \d+"
                     (check-block-perms)))
                (is (thrown-with-msg?
                     clojure.lang.ExceptionInfo
                     #"Blocked: you are not allowed to run queries against Database \d+"
                     (run-saved-question))))
              (testing "\nAllow running if current User has data permissions from another group."
                (mt/with-temp [PermissionsGroup           {group-2-id :id} {}
                               PermissionsGroupMembership _ {:group_id group-2-id :user_id user-id}]
                  (doseq [[message perms-fn!] {"with full DB perms"
                                               #(data-perms/set-database-permission! group-2-id (mt/id) :perms/data-access :unrestricted)
                                               "with perms for the Table in question"
                                               #(data-perms/set-table-permission! group-2-id (mt/id :venues) :perms/data-access :unrestricted)}]
                    (perms-fn!)
                    (testing (format "Should be able to run the query %s" message)

                      (doseq [[message thunk] {"ad-hoc queries"  run-ad-hoc-query
                                               "Saved Questions" run-saved-question}]
                        (testing message
                          (is (=? {:status :completed}
                                  (thunk)))))))
                  (testing "\nSandboxed permissions"
                    (mt/with-premium-features #{:advanced-permissions :sandboxes}
                      (mt/with-temp [GroupTableAccessPolicy _ {:table_id (mt/id :venues) :group_id group-id}]
                        (testing "Should be able to run the query"
                          (doseq [[message thunk] {"ad-hoc queries"  run-ad-hoc-query
                                                   "Saved Questions" run-saved-question}]
                            (testing message
                              (is (=? {:status :completed}
                                      (thunk))))))))))))))))))

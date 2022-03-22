(ns metabase-enterprise.advanced-permissions.models.permissions.block-permissions-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.advanced-permissions.models.permissions.block-permissions :as block-perms]
            [metabase-enterprise.sandbox.models.group-table-access-policy :refer [GroupTableAccessPolicy]]
            [metabase.api.common :as api]
            [metabase.models :refer [Card Collection Database Permissions PermissionsGroup PermissionsGroupMembership User]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as group]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.permissions :as qp.perms]
            [metabase.test :as mt]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

;;;; Graph-related stuff

(defn- test-db-perms [group-id]
  (get-in (perms/data-perms-graph) [:groups group-id (mt/id) :data]))

(defn- api-test-db-perms [group-id]
  (into {}
        (map (fn [[k v]]
               [k (cond-> v (string? v) keyword)]))
        (get-in (mt/user-http-request :crowberto :get 200 "permissions/graph")
                [:groups
                 (keyword (str group-id))
                 (keyword (str (mt/id)))
                 :data])))

(deftest graph-test
  (testing "block permissions should come back from"
    (doseq [[message perms] {"the graph function"
                             test-db-perms

                             "the API"
                             api-test-db-perms}]
      (testing (str message "\n"))
      (mt/with-temp* [PermissionsGroup [{group-id :id}]
                      Permissions      [_ {:group_id group-id
                                           :object   (perms/database-block-perms-path (mt/id))}]]
        (is (= {:schemas :block}
               (perms group-id)))
        (testing (str "\nBlock perms and data perms shouldn't exist together at the same time, but if they do for some "
                      "reason, then the graph endpoint should ignore the data perms.")
          (doseq [path [(perms/data-perms-path (mt/id))
                        (perms/data-perms-path (mt/id) "public")
                        (perms/data-perms-path (mt/id) "public" (mt/id :venues))]]
            (testing (format "\nPath = %s" (pr-str path))
              (mt/with-temp* [Permissions [_ {:group_id group-id
                                              :object   path}]]
                (is (= (merge {:schemas :block}
                              ;; block perms won't affect the value of `:native`; if a given group has both
                              ;; `/db/1/` and `/block/db/1/` then the graph will come back with `:native
                              ;; :write` and `:schemas :block`. This state isn't normally allowed, but the
                              ;; graph code doesn't currently correct it if it happens. Not sure it's worth
                              ;; the extra code complexity since it should never happen in the first place.
                              (when (= path (perms/data-perms-path (mt/id)))
                                {:native :write}))
                       (perms group-id)))))))))))

(defn- grant-block-perms! [group-id]
  (perms/update-data-perms-graph! [group-id (mt/id) :data] {:schemas :block}))

(defn- api-grant-block-perms! [group-id]
  (let [current-graph (perms/data-perms-graph)
        new-graph     (assoc-in current-graph [:groups group-id (mt/id) :data] {:schemas :block})
        result        (premium-features-test/with-premium-features #{:advanced-permissions}
                        (mt/user-http-request :crowberto :put 200 "permissions/graph" new-graph))]
    (is (= "block"
           (get-in result [:groups
                           (keyword (str group-id))
                           (keyword (str (mt/id)))
                           :data
                           :schemas])))))

(deftest api-throws-error-if-premium-feature-not-enabled
  (testing "PUT /api/permissions/graph"
    (testing (str "fails when a group has a block permission set, and the instance doesn't have the "
                  ":advanced-permissions premium feature enabled")
      (mt/with-temp PermissionsGroup [{group-id :id}]
        (let [current-graph (perms/data-perms-graph)
              new-graph     (assoc-in current-graph [:groups group-id (mt/id) :data] {:schemas :block})
              result        (premium-features-test/with-premium-features #{} ; disable premium features
                              (mt/user-http-request :crowberto :put 402 "permissions/graph" new-graph))]
          (is (= "Can't use block permissions without having the advanced-permissions premium feature"
                 result)))))))

(deftest update-graph-test
  (testing "Should be able to set block permissions with"
    (doseq [[description grant!] {"the graph update function"
                                  (fn [group-id]
                                    (premium-features-test/with-premium-features #{:advanced-permissions}
                                      (grant-block-perms! group-id)))

                                  "the perms graph API endpoint"
                                  api-grant-block-perms!}]
      (testing (str description "\n")
        (mt/with-temp PermissionsGroup [{group-id :id}]
          (testing "Group should have no perms upon creation"
            (is (= nil
                   (test-db-perms group-id))))
          (testing "group has no existing permissions"
            (mt/with-model-cleanup [Permissions]
              (grant! group-id)
              (is (= {:schemas :block}
                     (test-db-perms group-id)))))
          (testing "group has existing data permissions... :block should remove them"
            (mt/with-model-cleanup [Permissions]
              (perms/grant-full-data-permissions! group-id (mt/id))
              (grant! group-id)
              (is (= {:schemas :block}
                     (test-db-perms group-id)))
              (is (= #{(perms/database-block-perms-path (mt/id))}
                     (db/select-field :object Permissions :group_id group-id))))))))))

(deftest update-graph-delete-sandboxes-test
  (testing "When setting `:block` permissions any GTAP rows for that Group/Database should get deleted."
    (premium-features-test/with-premium-features #{:sandboxes :advanced-permissions}
      (mt/with-model-cleanup [Permissions]
        (mt/with-temp* [PermissionsGroup       [{group-id :id}]
                        GroupTableAccessPolicy [_ {:table_id (mt/id :venues)
                                                   :group_id group-id}]]
          (grant-block-perms! group-id)
          (is (= {:schemas :block}
                 (test-db-perms group-id)))
          (is (not (db/exists? GroupTableAccessPolicy :group_id group-id))))))))

(deftest update-graph-data-perms-should-delete-block-perms-test
  (testing "granting data permissions should delete existing block permissions"
    (mt/with-temp* [PermissionsGroup [{group-id :id}]
                    Permissions      [_ {:group_id group-id, :object (perms/database-block-perms-path (mt/id))}]]
      (is (= {:schemas :block}
             (test-db-perms group-id)))
      (perms/update-data-perms-graph! [group-id (mt/id) :data :schemas] {"public" {(mt/id :venues) {:read :all}}})
      (is (= {:schemas {"public" {(mt/id :venues) {:read :all}}}}
             (test-db-perms group-id))))))

(deftest update-graph-disallow-native-query-perms-test
  (testing "Disallow block permissions + native query permissions"
    (mt/with-temp* [PermissionsGroup [{group-id :id}]
                    Permissions      [_ {:group_id group-id, :object (perms/data-perms-path (mt/id))}]]
      (testing "via the fn"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             ;; TODO -- this error message is totally garbage, fix this
             #"DB permissions with a valid combination of values for :native and :schemas"
             ;; #"DB permissions with a valid combination of values for :native and :schemas"
             (perms/update-data-perms-graph! [group-id (mt/id) :data]
                                             {:schemas :block, :native :write}))))
      (testing "via the API"
        (let [current-graph (perms/data-perms-graph)
              new-graph     (assoc-in current-graph
                                      [:groups group-id (mt/id) :data]
                                      {:schemas :block, :native :write})]
          (is (schema= {:message  #".*DB permissions with a valid combination of values for :native and :schemas.*"
                        s/Keyword s/Any}
                       (premium-features-test/with-premium-features #{:advanced-permissions}
                         (mt/user-http-request :crowberto :put 500 "permissions/graph" new-graph)))))))))

(deftest delete-database-delete-block-perms-test
  (testing "If a Database gets DELETED, any block permissions for it should get deleted too."
    (mt/with-temp* [Database    [{db-id :id}]
                    Permissions [_ {:group_id (u/the-id (group/all-users))
                                    :object   (perms/database-block-perms-path db-id)}]]
      (letfn [(perms-exist? []
                (db/exists? Permissions :object (perms/database-block-perms-path db-id)))]
        (is (perms-exist?))
        (db/delete! Database :id db-id)
        (is (not (perms-exist?)))))))

;;;; QP perms-check related stuff.

(deftest qp-block-permissions-test
  (mt/with-temp-copy-of-db
    (let [query {:database (mt/id)
                 :type     :query
                 :query    {:source-table (mt/id :venues)
                            :limit        1}}]
      (mt/with-temp* [User                       [{user-id :id}]
                      PermissionsGroup           [{group-id :id}]
                      PermissionsGroupMembership [_ {:group_id group-id, :user_id user-id}]
                      Collection                 [{collection-id :id}]
                      Card                       [{card-id :id} {:collection_id collection-id
                                                                 :dataset_query query}]
                      Permissions                [_ {:group_id group-id, :object (perms/collection-read-path collection-id)}]]
        (premium-features-test/with-premium-features #{:advanced-permissions}
          (perms/revoke-data-perms! (group/all-users) (mt/id))
          (perms/revoke-data-perms! group-id (mt/id))
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
              (is (= ::block-perms/no-block-permissions-for-db
                     (check-block-perms))))
            ;; 'grant' the block permissions.
            (mt/with-temp Permissions [_ {:group_id group-id, :object (perms/database-block-perms-path (mt/id))}]
              (testing "if EE token does not have the `:advanced-permissions` feature: should not do check"
                (premium-features-test/with-premium-features #{}
                  (is (= ::block-perms/advanced-permissions-not-enabled
                         (check-block-perms)))))
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
                (mt/with-temp* [PermissionsGroup           [{group-2-id :id}]
                                PermissionsGroupMembership [_ {:group_id group-2-id, :user_id user-id}]]
                  (doseq [[message perms] {"with full DB perms"                   (perms/data-perms-path (mt/id))
                                           "with perms for the Table in question" (perms/table-query-path (mt/id :venues))}]
                    (mt/with-temp Permissions [_ {:group_id group-2-id, :object perms}]
                      (testing "Should be able to run the query"
                        (doseq [[message f] {"ad-hoc queries"  run-ad-hoc-query
                                             "Saved Questions" run-saved-question}]
                          (testing message
                            (is (f)))))))
                  (testing "\nSandboxed permissions"
                    (premium-features-test/with-premium-features #{:advanced-permissions :sandboxing}
                      (mt/with-temp* [Permissions            [_ {:group_id group-2-id
                                                                 :object   (perms/table-segmented-query-path (mt/id :venues))}]
                                      GroupTableAccessPolicy [_ {:table_id (mt/id :venues), :group_id group-id}]]
                        (testing "Should be able to run the query"
                          (doseq [[message f] {"ad-hoc queries"  run-ad-hoc-query
                                               "Saved Questions" run-saved-question}]
                            (testing message
                              (is (f)))))))))))))))))

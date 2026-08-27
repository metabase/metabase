(ns metabase-enterprise.data-studio.permissions.query-test
  "Tests for published table query permissions.
  Published tables can be queried via collection permissions instead of data permissions."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.data-studio.permissions.query-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.test-util :as sandbox.tu]
   [metabase.api.common :refer [*current-user-id* *current-user-permissions-set* *is-superuser?*]]
   [metabase.permissions.core :as perms]
   [metabase.query-permissions.core :as query-perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- do-with-published-venues!
  "Publishes the venues table into a fresh `library-data` collection and configures the All Users
  group (which every fresh user joins automatically) so the ONLY route to querying venues is the
  collection-read grant on the published table: db/table `create-queries` are `:no`, table
  `view-data` is `:unrestricted`, and db `view-data` is `db-view-data`.

  Every row and permission here is COMMITTED, so the API server observes the intended permission
  state. (Wrapping this in a `:rollback-only` transaction made the assertions vacuous: the request
  thread never sees the uncommitted rows, so queries succeeded on the committed *default* full
  access instead of the published-table mechanism under test.) `mt/with-restored-data-perms-for-group!`
  restores the All Users data perms, the temp user/collection are cleaned up by `mt/with-temp`, and
  the venues table's published state is restored in a `finally` before the collection is torn down.

  Options:
    :db-view-data - db-level view-data perm for All Users (default :unrestricted)
    :grant?       - grant collection-read to All Users on the published collection (default true)

  Invokes `(f user-id collection-id)`."
  [{:keys [db-view-data grant?] :or {db-view-data :unrestricted grant? true}} f]
  (mt/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
    (mt/with-premium-features #{:library}
      (mt/with-temp [:model/User       {user-id :id}       {}
                     :model/Collection {collection-id :id} {:type "library-data"}]
        (try
          (t2/update! :model/Table (mt/id :venues) {:is_published true :collection_id collection-id})
          (let [all-users (perms/all-users-group)]
            (perms/set-database-permission! all-users (mt/id) :perms/view-data      db-view-data)
            (perms/set-database-permission! all-users (mt/id) :perms/create-queries :no)
            (if grant?
              (perms/grant-collection-read-permissions! all-users collection-id)
              (perms/revoke-collection-permissions!     all-users collection-id))
            (perms/set-table-permission! all-users (mt/id :venues) :perms/view-data      :unrestricted)
            (perms/set-table-permission! all-users (mt/id :venues) :perms/create-queries :no))
          (f user-id collection-id)
          (finally
            (t2/update! :model/Table (mt/id :venues) {:is_published false :collection_id nil})))))))

(deftest published-table-test
  (testing "Published tables grant query access via collection permissions only with library enabled\n"
    (doseq [features             [#{} #{:library}]
            collection-readable? [false true]
            table-is-published?  [false true]
            view-data            [:unrestricted :blocked]]
      (testing (format "with features %s, collection-readable? %s, table-is-published? %s, view-data %s"
                       (pr-str features) collection-readable? table-is-published? view-data)
        (mt/with-premium-features features
          (let [mbql-query (mt/mbql-query venues)]
            (mt/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
              (t2/with-transaction [_conn nil {:rollback-only true}]
                (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                               :model/User {user-id :id} {}
                               :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                               :model/Collection {collection-id :id} {:type "library-data"}]
                  ;; Ensure All Users group has no create-queries permission and matching view-data
                  ;; (user is automatically in this group)
                  (perms/set-database-permission! (perms/all-users-group) (mt/id)         :perms/view-data      view-data)
                  (perms/set-database-permission! (perms/all-users-group) (mt/id)         :perms/create-queries :no)
                  (perms/set-table-permission!    (perms/all-users-group) (mt/id :venues) :perms/create-queries :no)
                  ;; Set up permissions on custom group: user cannot create queries, view-data varies
                  (perms/set-database-permission! group-id (mt/id) :perms/view-data      view-data)
                  (perms/set-database-permission! group-id (mt/id) :perms/create-queries :no)
                  (when table-is-published?
                    (t2/update! :model/Table (mt/id :venues) {:is_published true :collection_id collection-id}))
                  (if collection-readable?
                    (perms/grant-collection-read-permissions! group-id collection-id)
                    (do
                      ;; Revoke from both groups since user is in All Users automatically
                      (perms/revoke-collection-permissions! group-id collection-id)
                      (perms/revoke-collection-permissions! (perms/all-users-group) collection-id)))
                  (binding [*current-user-id*              user-id
                            *current-user-permissions-set* (delay (if collection-readable?
                                                                    #{(perms/collection-read-path collection-id)}
                                                                    #{}))]
                    (perms/disable-perms-cache
                      ;; Query is only runnable when: library enabled AND collection readable AND table published AND view-data unrestricted
                      (is (= (and (contains? features :library)
                                  collection-readable?
                                  table-is-published?
                                  (not= view-data :blocked))
                             (query-perms/can-run-query? mbql-query))))))))))))))

(deftest published-table-does-not-grant-view-data-test
  (mt/with-premium-features #{:library}
    (testing "Published tables with collection permissions should NOT grant view-data permissions"
      (mt/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
        (t2/with-transaction [_conn nil {:rollback-only true}]
          ;; Create a test user that only belongs to all-users group (no extra permissions)
          (mt/with-temp [:model/User       {user-id :id} {:email "view-data-test@example.com"}
                         :model/Collection collection    {:type "library-data"}]
            ;; Publish the venues table into this collection
            (t2/update! :model/Table (mt/id :venues) {:is_published true :collection_id (u/the-id collection)})
            (let [all-users (perms/all-users-group)]
              ;; Set database-level permissions first to establish baseline
              (perms/set-database-permission! all-users (mt/id) :perms/view-data :blocked)
              (perms/set-database-permission! all-users (mt/id) :perms/create-queries :no)
              ;; Grant collection read permission
              (perms/grant-collection-read-permissions! all-users (u/the-id collection))
              ;; Set table-level permissions
              (perms/set-table-permission! all-users (mt/id :venues) :perms/create-queries :no)
              (perms/set-table-permission! all-users (mt/id :venues) :perms/view-data :blocked)
              (perms/disable-perms-cache
                (binding [*current-user-id*              user-id
                          *current-user-permissions-set* (delay (perms/user-permissions-set user-id))
                          *is-superuser?*                false]
                  (testing "Should grant create-queries via collection permissions"
                    (is (= :query-builder
                           (perms/table-permission-for-user user-id :perms/create-queries (mt/id) (mt/id :venues)))
                        "Collection permissions should grant query-builder permission"))
                  (testing "Should NOT grant view-data via collection permissions"
                    (is (= :blocked
                           (perms/table-permission-for-user user-id :perms/view-data (mt/id) (mt/id :venues)))
                        "Collection permissions should NOT grant view-data permission")))))))))))

(deftest published-table-grants-database-access-test
  (testing "POST /api/dataset in EE: published table access GRANTS database access"
    (do-with-published-venues! {:grant? true}
                               (fn [user-id _collection-id]
                                 (testing "Query should succeed because EE grants create-queries via published table mechanism"
                                   (is (=? {:status    "completed"
                                            :row_count pos-int?}
                                           (mt/with-current-user user-id
                                             (mt/user-http-request user-id :post 202 "dataset"
                                                                   (mt/mbql-query venues {:limit 1})))))))))
  (testing "POST /api/dataset in EE: without collection permission, published table does NOT grant access"
    (do-with-published-venues! {:grant? false}
                               (fn [user-id _collection-id]
                                 (testing "Query should fail because user has no collection permission on published table"
                                   (is (=? {:status "failed"
                                            :error  "You do not have permissions to run this query."}
                                           (mt/with-current-user user-id
                                             (mt/user-http-request user-id :post 403 "dataset"
                                                                   (mt/mbql-query venues {:limit 1}))))))))))

(deftest published-table-query-blocks-join-to-unpublished-table-test
  (testing "POST /api/dataset: a published table's entity-picker visibility is not itself a security boundary --
            a hand-crafted query joining an unpublished table must still be rejected"
    (do-with-published-venues! {:db-view-data :blocked}
                               (fn [user-id _collection-id]
                                 ;; categories is left blocked/unpublished -- no grant of any kind
                                 (is (=? {:status "failed"}
                                         (mt/with-current-user user-id
                                           (mt/user-http-request user-id :post 403 "dataset"
                                                                 (mt/mbql-query venues
                                                                   {:joins  [{:source-table $$categories
                                                                              :alias        "Cat"
                                                                              :condition    [:= $category_id &Cat.$categories.id]}]
                                                                    :limit  1})))))))))

(deftest published-table-segment-and-metric-resolve-under-collection-only-perms-test
  (do-with-published-venues! {}
                             (fn [user-id _collection-id]
                               (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :venues)
                                                                               :definition (:query (mt/mbql-query venues {:filter [:> $price 2]}))}
                                              :model/Card    {metric-id :id}  {:type          :metric
                                                                               :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
                                 (testing "a query referencing a :segment on the published table resolves"
                                   (is (=? {:status "completed"}
                                           (mt/with-current-user user-id
                                             (mt/user-http-request user-id :post 202 "dataset"
                                                                   (mt/mbql-query venues {:filter [:segment segment-id]}))))))
                                 (testing "a :metric card built on the published table resolves"
                                   (is (=? {:status "completed"}
                                           (mt/with-current-user user-id
                                             (mt/user-http-request user-id :post 202 (format "card/%d/query" metric-id))))))))))

(deftest published-table-field-values-resolve-under-collection-only-perms-test
  (do-with-published-venues! {}
                             (fn [user-id _collection-id]
                               (testing "GET /api/field/:id/values resolves via the collection grant"
                                 (is (=? {:field_id (mt/id :venues :price)}
                                         (mt/with-current-user user-id
                                           (mt/user-http-request user-id :get 200 (format "field/%d/values" (mt/id :venues :price)))))))
                               (testing "GET /api/field/:id/search/:search-id resolves via the collection grant"
                                 (is (some? (mt/with-current-user user-id
                                              (mt/user-http-request user-id :get 200
                                                                    (format "field/%d/search/%d?limit=3" (mt/id :venues :name) (mt/id :venues :name))))))))))

(deftest published-table-remap-to-unpublished-target-permission-error-test
  ;; venues is published; categories (the FK-remap target) is deliberately left unpublished/blocked
  (do-with-published-venues! {:db-view-data :blocked}
                             (fn [user-id _collection-id]
                               (mt/with-temp [:model/Dimension _ {:field_id                (mt/id :venues :category_id)
                                                                  :human_readable_field_id (mt/id :categories :name)
                                                                  :type                    :external}]
                                 (testing "querying venues (whose FK-remap target is unpublished) surfaces a permission error"
                                   (is (=? {:status "failed"}
                                           (mt/with-current-user user-id
                                             (mt/user-http-request user-id :post 403 "dataset"
                                                                   (mt/mbql-query venues {:limit 1}))))))))))

(deftest published-sandboxed-table-query-reflects-sandbox-not-full-access-test
  (mt/with-additional-premium-features #{:library}
    (testing "a table that is both published (collection-grant) and GTAP-sandboxed applies row-level sandboxing,
              not broader access, via the published-table path"
      (sandbox.tu/with-gtaps-for-user! :rasta
        {:gtaps {:venues {:query (mt/mbql-query venues {:filter [:= $venues.price 4]})}}}
        (mt/with-temp [:model/Collection {collection-id :id} {:type "library-data"}]
          (try
            (t2/update! :model/Table (mt/id :venues) {:is_published true :collection_id collection-id})
            (perms/grant-collection-read-permissions! &group collection-id)
            (testing "POST /api/dataset row count reflects the sandbox filter, not the full table"
              (let [full-count  (mt/with-test-user :crowberto
                                  (first (first (mt/formatted-rows [int]
                                                                   (mt/process-query
                                                                    (mt/mbql-query venues {:aggregation [[:count]]}))))))
                    result      (mt/user-http-request :rasta :post 202 "dataset" (mt/mbql-query venues))
                    price-index (->> result :data :cols
                                     (keep-indexed (fn [i col] (when (= "PRICE" (u/upper-case-en (:name col))) i)))
                                     first)]
                (is (=? {:status "completed" :row_count pos-int?} result))
                (is (< (:row_count result) full-count) "sanity: some rows filtered")
                (is (every? #(= 4 (nth % price-index)) (mt/rows result))
                    "every returned row has price = 4, per the sandbox filter")))
            (finally
              (t2/update! :model/Table (mt/id :venues) {:is_published false :collection_id nil}))))))))

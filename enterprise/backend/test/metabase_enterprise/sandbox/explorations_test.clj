(ns metabase-enterprise.sandbox.explorations-test
  "Tests that the result-access gate on `GET /api/exploration/query/:id` correctly blocks
  cached-blob streaming for sandboxed, impersonated, and data-perm-deficient viewers of a
  published exploration. Metadata access (via collection perms) stays open in the same
  scenarios."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- with-published-exploration!
  "Create a published exploration with one pending ExplorationQuery against the venues table,
  inside a collection, and call `f` with `{:exploration ... :query ... :collection ...}`. The
  query is left in `status=\"pending\"` and has no cached `result_data` row, so the API
  returns:
    - 403 when the result-access gate denies (sandbox, impersonation, or missing data perms)
    - 409 (pending status payload) when the gate allows
  This makes the per-scenario assertions straightforward."
  [f]
  (mt/with-temp [:model/User       owner {:email (mt/random-email)}
                 :model/Collection coll  {}
                 :model/Card       metric {:name          "metric"
                                           :type          :metric
                                           :creator_id    (:id owner)
                                           :database_id   (mt/id)
                                           :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                 :model/Exploration e   {:name          "shared"
                                         :creator_id    (:id owner)
                                         :collection_id (:id coll)
                                         :is_published  true}
                 :model/ExplorationThread th {:exploration_id (:id e)}
                 :model/ExplorationQuery  q  {:exploration_thread_id (:id th)
                                              :card_id      (:id metric)
                                              :dimension_id "d1"
                                              :status       "pending"
                                              :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
    (f {:exploration e :query q :collection coll :owner owner})))

(deftest sandboxed-viewer-blocked-from-cached-result-test
  (with-published-exploration!
    (fn [{:keys [exploration query collection]}]
      (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
      (met/with-gtaps-for-user! :rasta {:gtaps {:venues {}}}
        (testing "sandboxed viewer can still read the exploration metadata"
          (mt/user-http-request :rasta :get 200 (format "exploration/%d" (:id exploration))))
        (testing "but is blocked (403) from the cached query result"
          (mt/user-http-request :rasta :get 403 (format "exploration/query/%d" (:id query))))))))

(deftest impersonated-viewer-blocked-from-cached-result-test
  (with-published-exploration!
    (fn [{:keys [exploration query collection]}]
      (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
      ;; Impersonation is only "enforced" for a user when they don't ALSO have non-impersonated
      ;; access through some other group. Strip default all-users data perms first.
      (mt/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/PermissionsGroup           {gid :id} {}
                       :model/PermissionsGroupMembership _         {:user_id  (mt/user->id :rasta)
                                                                    :group_id gid}
                       :model/ConnectionImpersonation    _         {:db_id     (mt/id)
                                                                    :group_id  gid
                                                                    :attribute "role"}]
          (testing "impersonated viewer can still read the exploration metadata"
            (mt/user-http-request :rasta :get 200 (format "exploration/%d" (:id exploration))))
          (testing "but is blocked (403) from the cached query result"
            (mt/user-http-request :rasta :get 403 (format "exploration/query/%d" (:id query)))))))))

(deftest viewer-without-data-perms-blocked-from-cached-result-test
  (with-published-exploration!
    (fn [{:keys [exploration query collection]}]
      (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
      (mt/with-no-data-perms-for-all-users!
        (testing "viewer with collection-read but no data perms reads metadata"
          (mt/user-http-request :rasta :get 200 (format "exploration/%d" (:id exploration))))
        (testing "but cannot view the cached result"
          (mt/user-http-request :rasta :get 403 (format "exploration/query/%d" (:id query))))))))

(deftest viewer-with-perms-and-no-sandbox-passes-gate-test
  (with-published-exploration!
    (fn [{:keys [query collection]}]
      (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
      (testing "no sandbox + has data perms → gate passes; pending query returns 409 status"
        (let [body (mt/user-http-request :rasta :get 409 (format "exploration/query/%d" (:id query)))]
          (is (= "pending" (:status body))))))))

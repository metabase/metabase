(ns metabase.permissions.models.permissions-revision-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.models.application-permissions-revision :as application-permissions-revision]
   [metabase.permissions.models.collection-permission-graph-revision :as collection-permission-graph-revision]
   [metabase.permissions.models.permissions-revision :as permissions-revision]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- update-error
  "The ex-data of the error updating the `model` row with `id` by `changes`, or nil when the update succeeds."
  [model id changes]
  (try
    (t2/update! model :toucan/pk id changes)
    nil
    (catch clojure.lang.ExceptionInfo e
      (ex-data e))))

(deftest revision-update-test
  (doseq [[model latest-id] {:model/PermissionsRevision            permissions-revision/latest-id
                             :model/ApplicationPermissionsRevision application-permissions-revision/latest-id}]
    (testing model
      (let [id (inc (latest-id))]
        (t2/insert! model {:id      id
                           :before  {}
                           :after   {}
                           :user_id (mt/user->id :crowberto)})
        (try
          (is (=? {:status-code 400}
                  (update-error model id {:remark "changed"})))
          (is (=? {:status-code 400}
                  (update-error model id {:after {:groups {}}})))
          (finally
            (t2/delete! model :toucan/pk id)))))))

(deftest collection-graph-revision-details-update-test
  (let [id (inc (collection-permission-graph-revision/latest-id))]
    (t2/insert! :model/CollectionPermissionGraphRevision {:id      id
                                                          :before  ""
                                                          :after   ""
                                                          :user_id (mt/user->id :crowberto)})
    (try
      (testing "empty details are filled in once"
        (is (nil? (update-error :model/CollectionPermissionGraphRevision id {:before {:groups {}}
                                                                             :after  {:groups {}}})))
        (is (=? {:before {:groups {}} :after {:groups {}}}
                (t2/select-one :model/CollectionPermissionGraphRevision :id id))))
      (testing "filled details cannot change"
        (is (=? {:status-code 400}
                (update-error :model/CollectionPermissionGraphRevision id {:before {:groups {1 {}}}})))
        (is (=? {:status-code 400}
                (update-error :model/CollectionPermissionGraphRevision id {:after {:groups {1 {}}}}))))
      (testing "other columns cannot change"
        (is (=? {:status-code 400}
                (update-error :model/CollectionPermissionGraphRevision id {:remark "changed"}))))
      (finally
        (t2/delete! :model/CollectionPermissionGraphRevision :id id)))))

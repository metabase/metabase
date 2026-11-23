(ns metabase.permissions.models.permissions-revision-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.test-util :as events.tu]
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

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/PermissionsRevision :model/ApplicationPermissionsRevision
                          :model/CollectionPermissionGraphRevision]
    (doseq [[model latest-id create!] [[:model/PermissionsRevision
                                        permissions-revision/latest-id
                                        permissions-revision/create-permissions-revisions!]
                                       [:model/ApplicationPermissionsRevision
                                        application-permissions-revision/latest-id
                                        application-permissions-revision/create-application-permissions-revisions!]
                                       [:model/CollectionPermissionGraphRevision
                                        collection-permission-graph-revision/latest-id
                                        collection-permission-graph-revision/create-collection-permission-graph-revisions!]]]
      (testing (str "creating " model)
        (let [counted (fn [n]
                        (let [first-id (inc (latest-id))]
                          (events.tu/statement-count!
                           #(create! (mapv (fn [i] {:id (+ first-id i) :before {} :after {} :user_id (mt/user->id :crowberto)})
                                           (range n))))))]
          (counted 1)
          (is (= (counted 2) (counted 6))))))
    (testing "filling in collection graph revisions, half of them with an empty graph after already"
      (let [counted (fn [n]
                      (let [first-id (inc (collection-permission-graph-revision/latest-id))
                            ids      (mapv #(+ first-id %) (range n))]
                        (collection-permission-graph-revision/create-collection-permission-graph-revisions!
                         (mapv (fn [id] {:id id :before "" :after (if (even? id) {} "") :user_id (mt/user->id :crowberto)})
                               ids))
                        (events.tu/statement-count!
                         #(collection-permission-graph-revision/update-collection-permission-graph-revisions!
                           (mapv (fn [id] {:id id :before {:groups {}} :after {1 {2 :read}}}) ids)))))]
        (counted 1)
        (is (= (counted 2) (counted 6)))))))

(deftest update-collection-permission-graph-revisions-refuses-filled-details-test
  (mt/with-model-cleanup [:model/CollectionPermissionGraphRevision]
    (let [first-id (inc (collection-permission-graph-revision/latest-id))]
      (collection-permission-graph-revision/create-collection-permission-graph-revisions!
       [{:id first-id :before "" :after "" :user_id (mt/user->id :crowberto)}
        {:id (inc first-id) :before {:groups {1 {2 :read}}} :after "" :user_id (mt/user->id :crowberto)}])
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"once they are filled in"
                            (collection-permission-graph-revision/update-collection-permission-graph-revisions!
                             [{:id first-id :before {:revision 1}} {:id (inc first-id) :before {:revision 2}}])))
      (is (empty? (t2/select-one-fn :before :model/CollectionPermissionGraphRevision :id first-id)))
      (collection-permission-graph-revision/update-collection-permission-graph-revisions!
       [{:id first-id :before {:revision 1} :after {1 {2 :write}}}])
      (is (= {:revision 1} (t2/select-one-fn :before :model/CollectionPermissionGraphRevision :id first-id))))))

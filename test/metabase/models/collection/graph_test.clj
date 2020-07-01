(ns metabase.models.collection.graph-test
  (:require [clojure.test :refer :all]
            [medley.core :as m]
            [metabase
             [test :as mt]
             [util :as u]]
            [metabase.api.common :refer [*current-user-id*]]
            [metabase.models
             [collection :as collection :refer [Collection]]
             [collection-revision :refer [CollectionRevision]]
             [permissions :as perms]
             [permissions-group :as group :refer [PermissionsGroup]]]
            [metabase.models.collection.graph :as graph]
            [metabase.test
             [fixtures :as fixtures]
             [util :as tu]]
            [metabase.test.data.users :as test-users]
            [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :db :test-users :test-users-personal-collections))

(defn- lucky-collection-children-location []
  (collection/children-location (collection/user->personal-collection (test-users/user->id :lucky))))

(defn- replace-collection-ids
  "In Collection perms `graph`, replace instances of the ID of `collection-or-id` with `:COLLECTION`, making it possible
  to write tests that don't need to know its actual numeric ID."
  [collection-or-id graph]
  (update graph :groups (partial m/map-vals (partial m/map-keys (fn [collection-id]
                                                                  (if (= collection-id (u/get-id collection-or-id))
                                                                    :COLLECTION
                                                                    collection-id))))))

(defn- clear-graph-revisions! []
  (db/delete! CollectionRevision))

(defn- graph
  "Fetch collection graph. `:clear-revisions?` = delete any previously existing collection revision entries so we get
  revision = 0."
  [& {:keys [clear-revisions?]}]
  (when clear-revisions?
    (clear-graph-revisions!))
  ;; force lazy creation of the three magic groups as needed
  (group/all-users)
  (group/admin)
  (group/metabot)
  ;; now fetch the graph
  (graph/graph))

(deftest basic-test
  (testing "Check that the basic graph works"
    (tu/with-non-admin-groups-no-root-collection-perms
      (is (= {:revision 0
              :groups   {(u/get-id (group/all-users)) {:root :none}
                         (u/get-id (group/metabot))   {:root :none}
                         (u/get-id (group/admin))     {:root :write}}}
             (graph :clear-revisions? true))))))

(deftest new-collection-perms-test
  (testing "Creating a new Collection shouldn't give perms to anyone but admins"
    (tu/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp Collection [collection]
        (is (= {:revision 0
                :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :none}
                           (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
                           (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
               (replace-collection-ids collection (graph :clear-revisions? true))))))))

(deftest read-perms-test
  (testing "make sure read perms show up correctly"
    (tu/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp Collection [collection]
        (perms/grant-collection-read-permissions! (group/all-users) collection)
        (is (= {:revision 0
                :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :read}
                           (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
                           (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
               (replace-collection-ids collection (graph :clear-revisions? true))))))))

(deftest grant-write-perms-for-new-collections-test
  (testing "make sure we can grant write perms for new collections (!)"
    (tu/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp Collection [collection]
        (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
        (is (=  {:revision 0
                 :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :write}
                            (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
                            (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
                (replace-collection-ids collection (graph :clear-revisions? true))))))))

(deftest non-magical-groups-test
  (testing "make sure a non-magical group will show up"
    (mt/with-temp PermissionsGroup [new-group]
      (tu/with-non-admin-groups-no-root-collection-perms
        (is (=   {:revision 0
                  :groups   {(u/get-id (group/all-users)) {:root :none}
                             (u/get-id (group/metabot))   {:root :none}
                             (u/get-id (group/admin))     {:root :write}
                             (u/get-id new-group)         {:root :none}}}
                 (graph :clear-revisions? true)))))))

(deftest root-collection-read-perms-test
  (testing "How abut *read* permissions for the Root Collection?"
    (mt/with-temp PermissionsGroup [new-group]
      (tu/with-non-admin-groups-no-root-collection-perms
        (perms/grant-collection-read-permissions! new-group collection/root-collection)
        (is (= {:revision 0
                :groups   {(u/get-id (group/all-users)) {:root :none}
                           (u/get-id (group/metabot))   {:root :none}
                           (u/get-id (group/admin))     {:root :write}
                           (u/get-id new-group)         {:root :read}}}
               (graph :clear-revisions? true)))))))

(deftest root-collection-write-perms-test
  (testing "How about granting *write* permissions for the Root Collection?"
    (mt/with-temp PermissionsGroup [new-group]
      (tu/with-non-admin-groups-no-root-collection-perms
        (perms/grant-collection-readwrite-permissions! new-group collection/root-collection)
        (is (= {:revision 0
                :groups   {(u/get-id (group/all-users)) {:root :none}
                           (u/get-id (group/metabot))   {:root :none}
                           (u/get-id (group/admin))     {:root :write}
                           (u/get-id new-group)         {:root :write}}}
               (graph :clear-revisions? true)))))))

(deftest no-op-test
  (testing "Can we do a no-op update?"
    ;; need to bind *current-user-id* or the Revision won't get updated
    (clear-graph-revisions!)
    (tu/with-non-admin-groups-no-root-collection-perms
      (binding [*current-user-id* (test-users/user->id :crowberto)]
        (graph/update-graph! (graph :clear-revisions? true))
        (is (= {:revision 0
                :groups   {(u/get-id (group/all-users)) {:root :none}
                           (u/get-id (group/metabot))   {:root :none}
                           (u/get-id (group/admin))     {:root :write}}}
               (graph))
            "revision should not have changed, because there was nothing to do...")))))

(deftest grant-perms-test
  (testing "Can we give someone read perms via the graph?"
    (clear-graph-revisions!)
    (tu/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp Collection [collection]
        (binding [*current-user-id* (test-users/user->id :crowberto)]
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/get-id (group/all-users)) (u/get-id collection)]
                                         :read))
          (is (= {:revision 1
                  :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :read}
                             (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
                             (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
                 (replace-collection-ids collection (graph))))))))

  (testing "can we give them *write* perms?"
    (tu/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp Collection [collection]
        (binding [*current-user-id* (test-users/user->id :crowberto)]
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/get-id (group/all-users)) (u/get-id collection)]
                                         :write))
          (is (= {:revision 1
                  :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :write}
                             (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
                             (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
                 (replace-collection-ids collection (graph)))))))))

(deftest revoke-perms-test
  (testing "can we *revoke* perms?"
    (clear-graph-revisions!)
    (tu/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp Collection [collection]
        (binding [*current-user-id* (test-users/user->id :crowberto)]
          (perms/grant-collection-read-permissions! (group/all-users) collection)
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/get-id (group/all-users)) (u/get-id collection)]
                                         :none))
          (is (= {:revision 1
                  :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :none}
                             (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
                             (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
                 (replace-collection-ids collection (graph)))))))))

(deftest grant-root-permissions-test
  (testing "Can we grant *read* permissions for the Root Collection?"
    (mt/with-temp PermissionsGroup [new-group]
      (clear-graph-revisions!)
      (tu/with-non-admin-groups-no-root-collection-perms
        (binding [*current-user-id* (test-users/user->id :crowberto)]
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/get-id new-group) :root]
                                         :read))
          (is (= {:revision 1
                  :groups   {(u/get-id (group/all-users)) {:root :none}
                             (u/get-id (group/metabot))   {:root :none}
                             (u/get-id (group/admin))     {:root :write}
                             (u/get-id new-group)         {:root :read}}}
                 (graph)))))))

  (testing "How about granting *write* permissions for the Root Collection?"
    (mt/with-temp PermissionsGroup [new-group]
      (clear-graph-revisions!)
      (tu/with-non-admin-groups-no-root-collection-perms
        (binding [*current-user-id* (test-users/user->id :crowberto)]
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/get-id new-group) :root]
                                         :write))
          (is (= {:revision 1
                  :groups   {(u/get-id (group/all-users)) {:root :none}
                             (u/get-id (group/metabot))   {:root :none}
                             (u/get-id (group/admin))     {:root :write}
                             (u/get-id new-group)         {:root :write}}}
                 (graph))))))))

(deftest revoke-root-permissions-test
  (testing "can we *revoke* RootCollection perms?"
    (mt/with-temp PermissionsGroup [new-group]
      (clear-graph-revisions!)
      (tu/with-non-admin-groups-no-root-collection-perms
        (binding [*current-user-id* (test-users/user->id :crowberto)]
          (perms/grant-collection-readwrite-permissions! new-group collection/root-collection)
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/get-id new-group) :root]
                                         :none))
          (is (= {:revision 1
                  :groups   {(u/get-id (group/all-users)) {:root :none}
                             (u/get-id (group/metabot))   {:root :none}
                             (u/get-id (group/admin))     {:root :write}
                             (u/get-id new-group)         {:root :none}}}
                 (graph))))))))

(deftest personal-collections-should-not-appear-test
  (testing "Make sure that personal Collections *do not* appear in the Collections graph"
    (tu/with-non-admin-groups-no-root-collection-perms
      (is (= {:revision 0
              :groups   {(u/get-id (group/all-users)) {:root :none}
                         (u/get-id (group/metabot))   {:root :none}
                         (u/get-id (group/admin))     {:root :write}}}
             (graph :clear-revisions? true)))))

  (testing "Make sure descendants of Personal Collections do not come back as part of the graph either..."
    (clear-graph-revisions!)
    (tu/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp Collection [_ {:location (lucky-collection-children-location)}]
        (is (= {:revision 0
                :groups   {(u/get-id (group/all-users)) {:root :none}
                           (u/get-id (group/metabot))   {:root :none}
                           (u/get-id (group/admin))     {:root :write}}}
               (graph)))))))

(deftest disallow-editing-personal-collections-test
  (testing "Make sure that if we try to be sneaky and edit a Personal Collection via the graph, an Exception is thrown"
    (clear-graph-revisions!)
    (tu/with-non-admin-groups-no-root-collection-perms
      (let [lucky-personal-collection-id (u/get-id (collection/user->personal-collection (test-users/user->id :lucky)))]
        (is (thrown?
             Exception
             (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                            [:groups (u/get-id (group/all-users)) lucky-personal-collection-id]
                                            :read))))

        (testing "double-check that the graph is unchanged"
          (is (= {:revision 0
                  :groups   {(u/get-id (group/all-users)) {:root :none}
                             (u/get-id (group/metabot))   {:root :none}
                             (u/get-id (group/admin))     {:root :write}}}
                 (graph)))))))

  (testing "Make sure you can't be sneaky and edit descendants of Personal Collections either."
    (mt/with-temp Collection [collection {:location (lucky-collection-children-location)}]
      (let [lucky-personal-collection-id (u/get-id (collection/user->personal-collection (test-users/user->id :lucky)))]
        (is (thrown?
             Exception
             (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                            [:groups
                                             (u/get-id (group/all-users))
                                             lucky-personal-collection-id
                                             (u/get-id collection)]
                                            :read))))))))

(ns metabase.permissions.models.collection.graph-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.api.common :refer [*current-user-id*]]
   [metabase.audit-app.core :as audit]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.models.collection-permission-graph-revision :as c-perm-revision]
   [metabase.permissions.models.collection.graph :as graph]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users :test-users-personal-collections))

(defn- lucky-collection-children-location []
  (collection/children-location (collection/user->personal-collection (mt/user->id :lucky))))

(defn replace-collection-ids
  "In Collection perms `graph`, replace instances of the ID of `collection-or-id` with `:COLLECTION`, making it possible
  to write tests that don't need to know its actual numeric ID."
  ([collection-or-id graph]
   (replace-collection-ids collection-or-id graph :COLLECTION))

  ([collection-or-id graph replacement-key]
   (let [id (if (map? collection-or-id) (:id collection-or-id) collection-or-id)
         ;; match variations that pop up depending on whether the map was serialized to JSON. 100, :100, or "100"
         id-keys #{id (str id) (keyword (str id))}]
     (update graph :groups (partial m/map-vals (partial m/map-keys (fn [collection-id]
                                                                     (if (id-keys collection-id)
                                                                       replacement-key
                                                                       collection-id))))))))

(defn- clear-graph-revisions! []
  (t2/delete! :model/CollectionPermissionGraphRevision))

(defn- only-groups
  "Remove entries for non-'magic' groups from a fetched perms `graph`."
  [graph groups-or-ids]
  (update graph :groups select-keys (map u/the-id groups-or-ids)))

(defn- only-collections
  "Remove entries for Collections whose ID is not in `collection-ids` from a fetched perms `graph`."
  [graph collections-or-ids]
  (let [ids (for [collection-or-id collections-or-ids]
              (if (= :root collection-or-id)
                collection-or-id
                (u/the-id collection-or-id)))]
    (update graph :groups (fn [groups]
                            (m/map-vals #(select-keys % ids) groups)))))

(defn graph
  "Fetch collection graph.

  * `:clear-revisions?` = delete any previously existing collection revision entries so we get revision = 0
  * `:collections`      = IDs of Collections to keep. `:root` is always kept.
  * `:groups`           = IDs of Groups to keep. 'Magic' groups are always kept."
  [& {:keys [clear-revisions? collections groups]}]
  (when clear-revisions?
    (clear-graph-revisions!))
  ;; force lazy creation of the three magic groups as needed
  (perms-group/all-users)
  (perms-group/admin)
  ;; now fetch the graph
  (-> (graph/graph)
      (only-groups (concat [(perms-group/all-users) (perms-group/admin)] groups))
      (only-collections (cons :root collections))))

(deftest basic-test
  (testing "Check that the basic graph works (sparse - only groups with permissions)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (is (= {:revision 0
              :groups {(u/the-id (perms-group/admin)) {:root :write}}}
             (graph :clear-revisions? true))))))

(deftest new-collection-perms-test
  (testing "Creating a new Collection shouldn't give perms to anyone but admins (sparse - no :none entries)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection]
        (is (= {:revision 0
                :groups {(u/the-id (perms-group/admin)) {:root :write, :COLLECTION :write}}}
               (replace-collection-ids collection (graph :clear-revisions? true, :collections [collection]))))))))

(deftest audit-collections-graph-test
  (testing "Check that the audit collection has :read for admins (sparse - no :none entries)."
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {:namespace "analytics"}]
        (with-redefs [audit/default-audit-collection (constantly collection)]
          (is (= {:revision 0
                  :groups {(u/the-id (perms-group/admin)) {:root :write, :COLLECTION :read}}}
                 (replace-collection-ids collection (graph :clear-revisions? true, :collections [collection])))))))))

(deftest cannot-set-audit-permissions-for-non-admins-test
  (clear-graph-revisions!)
  (mt/with-premium-features #{}
    (testing "Cannot set write permissiosn with no feature flag"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection {:namespace "analytics"}]
          (with-redefs [audit/default-audit-collection (constantly collection)]
            (graph/update-graph! {:revision 0 :groups {(u/the-id (perms-group/all-users)) {(u/the-id collection) :write}}})
            (is (= {:revision 0
                    :groups {(u/the-id (perms-group/admin)) {:root :write, :COLLECTION :read}}}
                   (replace-collection-ids collection (graph :clear-revisions? true, :collections [collection]))))))))
    (testing "Cannot set read permissiosn with no feature flag"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection {:namespace "analytics"}]
          (with-redefs [audit/default-audit-collection (constantly collection)]
            (graph/update-graph! {:revision 0 :groups {(u/the-id (perms-group/all-users)) {(u/the-id collection) :read}}})
            (is (= {:revision 0
                    :groups {(u/the-id (perms-group/admin)) {:root :write, :COLLECTION :read}}}
                   (replace-collection-ids collection (graph :clear-revisions? true, :collections [collection]))))))))))

(deftest read-perms-test
  (testing "make sure read perms show up correctly"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection]
        (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
        (is (= {:revision 0
                :groups {(u/the-id (perms-group/all-users)) {:COLLECTION :read}
                         (u/the-id (perms-group/admin)) {:root :write, :COLLECTION :write}}}
               (replace-collection-ids collection (graph :clear-revisions? true, :collections [collection]))))))))

(deftest grant-write-perms-for-new-collections-test
  (testing "make sure we can grant write perms for new collections (!)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
        (is (= {:revision 0
                :groups {(u/the-id (perms-group/all-users)) {:COLLECTION :write}
                         (u/the-id (perms-group/admin)) {:root :write, :COLLECTION :write}}}
               (replace-collection-ids collection (graph :clear-revisions? true, :collections [collection]))))))))

(deftest non-magical-groups-test
  (testing "sparse graph - groups without permissions don't appear"
    (mt/with-temp [:model/PermissionsGroup new-group]
      (mt/with-non-admin-groups-no-root-collection-perms
        (is (= {:revision 0
                :groups {(u/the-id (perms-group/admin)) {:root :write}}}
               (graph :clear-revisions? true, :groups [new-group])))))))

(deftest root-collection-read-perms-test
  (testing "How about *read* permissions for the Root Collection?"
    (mt/with-temp [:model/PermissionsGroup new-group]
      (mt/with-non-admin-groups-no-root-collection-perms
        (perms/grant-collection-read-permissions! new-group collection/root-collection)
        (is (= {:revision 0
                :groups {(u/the-id (perms-group/admin)) {:root :write}
                         (u/the-id new-group) {:root :read}}}
               (graph :clear-revisions? true, :groups [new-group])))))))

(deftest root-collection-write-perms-test
  (testing "How about granting *write* permissions for the Root Collection?"
    (mt/with-temp [:model/PermissionsGroup new-group]
      (mt/with-non-admin-groups-no-root-collection-perms
        (perms/grant-collection-readwrite-permissions! new-group collection/root-collection)
        (is (= {:revision 0
                :groups {(u/the-id (perms-group/admin)) {:root :write}
                         (u/the-id new-group) {:root :write}}}
               (graph :clear-revisions? true, :groups [new-group])))))))

(deftest no-op-test
  (testing "Can we do a no-op update?"
    ;; need to bind *current-user-id* or the Revision won't get updated
    (clear-graph-revisions!)
    (mt/with-non-admin-groups-no-root-collection-perms
      (binding [*current-user-id* (mt/user->id :crowberto)]
        (graph/update-graph! (graph :clear-revisions? true))
        (is (= {:revision 0
                :groups {(u/the-id (perms-group/admin)) {:root :write}}}
               (graph))
            "revision should not have changed, because there was nothing to do...")))))

(deftest grant-perms-test
  (testing "Can we give someone read perms via the graph?"
    (clear-graph-revisions!)
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection]
        (binding [*current-user-id* (mt/user->id :crowberto)]
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/the-id (perms-group/all-users)) (u/the-id collection)]
                                         :read))
          (is (= {:revision 1
                  :groups {(u/the-id (perms-group/all-users)) {:COLLECTION :read}
                           (u/the-id (perms-group/admin)) {:root :write, :COLLECTION :write}}}
                 (replace-collection-ids collection (graph :collections [collection]))))
          (is (= 1 (c-perm-revision/latest-id)))))))

  (testing "can we give them *write* perms?"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection]
        (binding [*current-user-id* (mt/user->id :crowberto)]
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/the-id (perms-group/all-users)) (u/the-id collection)]
                                         :write))
          (is (= {:revision 1
                  :groups {(u/the-id (perms-group/all-users)) {:COLLECTION :write}
                           (u/the-id (perms-group/admin)) {:root :write, :COLLECTION :write}}}
                 (replace-collection-ids collection (graph :collections [collection])))))))))

(deftest revoke-perms-test
  (testing "can we *revoke* perms? (sparse - revoked perms don't appear)"
    (clear-graph-revisions!)
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection]
        (binding [*current-user-id* (mt/user->id :crowberto)]
          (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/the-id (perms-group/all-users)) (u/the-id collection)]
                                         :none))
          (is (= {:revision 1
                  :groups {(u/the-id (perms-group/admin)) {:root :write, :COLLECTION :write}}}
                 (replace-collection-ids collection (graph :collections [collection])))))))))

(deftest grant-root-permissions-test
  (testing "Can we grant *read* permissions for the Root Collection?"
    (mt/with-temp [:model/PermissionsGroup new-group]
      (clear-graph-revisions!)
      (mt/with-non-admin-groups-no-root-collection-perms
        (binding [*current-user-id* (mt/user->id :crowberto)]
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/the-id new-group) :root]
                                         :read))
          (is (= {:revision 1
                  :groups {(u/the-id (perms-group/admin)) {:root :write}
                           (u/the-id new-group) {:root :read}}}
                 (graph :groups [new-group])))))))

  (testing "How about granting *write* permissions for the Root Collection?"
    (mt/with-temp [:model/PermissionsGroup new-group]
      (clear-graph-revisions!)
      (mt/with-non-admin-groups-no-root-collection-perms
        (binding [*current-user-id* (mt/user->id :crowberto)]
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/the-id new-group) :root]
                                         :write))
          (is (= {:revision 1
                  :groups {(u/the-id (perms-group/admin)) {:root :write}
                           (u/the-id new-group) {:root :write}}}
                 (graph :groups [new-group]))))))))

(deftest revoke-root-permissions-test
  (testing "can we *revoke* RootCollection perms? (sparse - revoked perms don't appear)"
    (mt/with-temp [:model/PermissionsGroup new-group]
      (clear-graph-revisions!)
      (mt/with-non-admin-groups-no-root-collection-perms
        (binding [*current-user-id* (mt/user->id :crowberto)]
          (perms/grant-collection-readwrite-permissions! new-group collection/root-collection)
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/the-id new-group) :root]
                                         :none))
          (is (= {:revision 1
                  :groups {(u/the-id (perms-group/admin)) {:root :write}}}
                 (graph :groups [new-group]))))))))

(deftest personal-collections-should-not-appear-test
  (testing "Make sure that personal Collections *do not* appear in the Collections graph"
    (mt/with-non-admin-groups-no-root-collection-perms
      (is (= {:revision 0
              :groups {(u/the-id (perms-group/admin)) {:root :write}}}
             (graph :clear-revisions? true)))))

  (testing "Make sure descendants of Personal Collections do not come back as part of the graph either..."
    (clear-graph-revisions!)
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection _ {:location (lucky-collection-children-location)}]
        (is (= {:revision 0
                :groups {(u/the-id (perms-group/admin)) {:root :write}}}
               (graph)))))))

(deftest disallow-editing-personal-collections-test
  (testing "Make sure that if we try to be sneaky and edit a Personal Collection via the graph, changes are ignored"
    (mt/with-non-admin-groups-no-root-collection-perms
      (let [lucky-personal-collection-id (u/the-id (collection/user->personal-collection (mt/user->id :lucky)))
            path [:groups (u/the-id (perms-group/all-users)) lucky-personal-collection-id]]
        (mt/throw-if-called! graph/update-group-permissions!
          (graph/update-graph! (assoc-in (graph :clear-revisions? true) path :read)))

        (testing "double-check that the graph is unchanged"
          (is (= {:revision 0
                  :groups {(u/the-id (perms-group/admin)) {:root :write}}}
                 (graph))))

        (testing "No revision should have been saved"
          (is (= 0
                 (c-perm-revision/latest-id)))))))

  (testing "Make sure you can't be sneaky and edit descendants of Personal Collections either."
    (mt/with-temp [:model/Collection collection {:location (lucky-collection-children-location)}]
      (let [lucky-personal-collection-id (u/the-id (collection/user->personal-collection (mt/user->id :lucky)))]
        (is (thrown?
             Exception
             (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                            [:groups
                                             (u/the-id (perms-group/all-users))
                                             lucky-personal-collection-id
                                             (u/the-id collection)]
                                            :read))))))))

(set! *warn-on-reflection* true)

(defn- update-graph-and-wait!
  "`graph/update-graph!` updates the before and after values in the graph asyncronously, so we need to wait for them to be written"
  ([new-graph] (update-graph-and-wait! nil new-graph))
  ([namespaze new-graph]
   (when-let [future (graph/update-graph! namespaze new-graph false)]
     ;; Block until the entire graph has been `filled-in!`
     @future)))

(deftest collection-namespace-fetch-default-test
  (testing "Fetching graph with no args should only show Collections in the default namespace (sparse - no :none entries)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {default-a :id} {:location "/"}
                     :model/Collection {default-ab :id} {:location (format "/%d/" default-a)}
                     :model/Collection {currency-a :id} {:namespace "currency" :location "/"}
                     :model/Collection {currency-ab :id} {:namespace "currency" :location (format "/%d/" currency-a)}
                     :model/PermissionsGroup {group-id :id} {}]
        (letfn [(nice-graph [graph]
                  (let [id->alias {default-a "Default A"
                                   default-ab "Default A -> B"
                                   currency-a "Currency A"
                                   currency-ab "Currency A -> B"}]
                    (transduce
                     identity
                     (fn
                       ([graph]
                        (-> (get-in graph [:groups group-id])
                            (select-keys (cons :root (vals id->alias)))))
                       ([graph [collection-id k]]
                        (replace-collection-ids collection-id graph k)))
                     graph
                     id->alias)))]
          (doseq [collection [default-a default-ab currency-a currency-ab]]
            (perms/grant-collection-read-permissions! group-id collection))
          (is (= {"Default A" :read, "Default A -> B" :read}
                 (nice-graph (graph/graph))
                 (nice-graph (graph/graph nil)))))))))

(deftest collection-namespace-fetch-non-default-test
  (testing "Fetching graph for a specific namespace should only show Collections in that namespace (sparse - no :none)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {default-a :id} {:location "/"}
                     :model/Collection {default-ab :id} {:location (format "/%d/" default-a)}
                     :model/Collection {currency-a :id} {:namespace "currency" :location "/"}
                     :model/Collection {currency-ab :id} {:namespace "currency" :location (format "/%d/" currency-a)}
                     :model/PermissionsGroup {group-id :id} {}]
        (letfn [(nice-graph [graph]
                  (let [id->alias {default-a "Default A"
                                   default-ab "Default A -> B"
                                   currency-a "Currency A"
                                   currency-ab "Currency A -> B"}]
                    (transduce
                     identity
                     (fn
                       ([graph]
                        (-> (get-in graph [:groups group-id])
                            (select-keys (cons :root (vals id->alias)))))
                       ([graph [collection-id k]]
                        (replace-collection-ids collection-id graph k)))
                     graph
                     id->alias)))]
          (doseq [collection [default-a default-ab currency-a currency-ab]]
            (perms/grant-collection-read-permissions! group-id collection))
          (is (= {"Currency A" :read, "Currency A -> B" :read}
                 (nice-graph (graph/graph :currency)))))))))

(deftest collection-namespace-update-default-test
  (testing "Should be able to update the graph for the default namespace"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {default-a :id} {:location "/"}
                     :model/Collection {default-ab :id} {:location (format "/%d/" default-a)}
                     :model/Collection {currency-a :id} {:namespace "currency" :location "/"}
                     :model/Collection {currency-ab :id} {:namespace "currency" :location (format "/%d/" currency-a)}
                     :model/PermissionsGroup {group-id :id} {}]
        (letfn [(nice-graph [graph]
                  (let [id->alias {default-a "Default A"
                                   default-ab "Default A -> B"
                                   currency-a "Currency A"
                                   currency-ab "Currency A -> B"}]
                    (transduce
                     identity
                     (fn
                       ([graph]
                        (-> (get-in graph [:groups group-id])
                            (select-keys (cons :root (vals id->alias)))))
                       ([graph [collection-id k]]
                        (replace-collection-ids collection-id graph k)))
                     graph
                     id->alias)))]
          (doseq [collection [default-a default-ab currency-a currency-ab]]
            (perms/grant-collection-read-permissions! group-id collection))
          (mt/with-test-user :crowberto
            (let [before (graph/graph)]
              (update-graph-and-wait! (assoc before :groups {group-id {default-ab :write, currency-ab :write}}))
              (is (= {"Default A" :read, "Default A -> B" :write}
                     (nice-graph (graph/graph))))

              (testing "Updates to Collections in other namespaces should be ignored"
                (is (= {"Currency A" :read, "Currency A -> B" :read}
                       (nice-graph (graph/graph :currency)))))

              (testing "A CollectionPermissionGraphRevision recording the *changes* should be saved (sparse before/after)"
                (is (malli= [:map
                             [:id ms/PositiveInt]
                             [:before [:map]]
                             [:after [:fn #(= % {(keyword (str group-id)) {(keyword (str default-ab)) "write"}})]]
                             [:user_id [:= (mt/user->id :crowberto)]]
                             [:created_at (ms/InstanceOfClass java.time.temporal.Temporal)]]
                            (t2/select-one :model/CollectionPermissionGraphRevision {:order-by [[:id :desc]]})))))))))))

(deftest collection-namespace-update-non-default-test
  (testing "Should be able to update the graph for a non-default namespace"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {default-a :id} {:location "/"}
                     :model/Collection {default-ab :id} {:location (format "/%d/" default-a)}
                     :model/Collection {currency-a :id} {:namespace "currency" :location "/"}
                     :model/Collection {currency-ab :id} {:namespace "currency" :location (format "/%d/" currency-a)}
                     :model/PermissionsGroup {group-id :id} {}]
        (letfn [(nice-graph [graph]
                  (let [id->alias {default-a "Default A"
                                   default-ab "Default A -> B"
                                   currency-a "Currency A"
                                   currency-ab "Currency A -> B"}]
                    (transduce
                     identity
                     (fn
                       ([graph]
                        (-> (get-in graph [:groups group-id])
                            (select-keys (cons :root (vals id->alias)))))
                       ([graph [collection-id k]]
                        (replace-collection-ids collection-id graph k)))
                     graph
                     id->alias)))]
          (doseq [collection [default-a default-ab currency-a currency-ab]]
            (perms/grant-collection-read-permissions! group-id collection))
          ;; First update default namespace to set up state
          (mt/with-test-user :crowberto
            (let [before-default (graph/graph)]
              (update-graph-and-wait! (assoc before-default :groups {group-id {default-ab :write, currency-ab :write}})))
            ;; Now update currency namespace
            @(graph/update-graph! :currency (assoc (graph/graph) :groups {group-id {default-a :write, currency-a :write}}) false)
            (is (= {"Currency A" :write, "Currency A -> B" :read}
                   (nice-graph (graph/graph :currency))))

            (testing "Updates to Collections in other namespaces should be ignored"
              (is (= {"Default A" :read, "Default A -> B" :write}
                     (nice-graph (graph/graph)))))

            (testing "A CollectionPermissionGraphRevision recording the *changes* should be saved (sparse before/after)"
              (is (malli= [:map
                           [:id ms/PositiveInt]
                           [:before [:map]]
                           [:after [:fn #(= % {(keyword (str group-id)) {(keyword (str currency-a)) "write"}})]]
                           [:user_id [:= (mt/user->id :crowberto)]]
                           [:created_at (ms/InstanceOfClass java.time.temporal.Temporal)]]
                          (t2/select-one :model/CollectionPermissionGraphRevision {:order-by [[:id :desc]]}))))))))))

(deftest collection-namespace-update-root-default-test
  (testing "Should be able to update permissions for the Root Collection in the default namespace"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {default-a :id} {:location "/"}
                     :model/Collection {default-ab :id} {:location (format "/%d/" default-a)}
                     :model/Collection {currency-a :id} {:namespace "currency" :location "/"}
                     :model/Collection {currency-ab :id} {:namespace "currency" :location (format "/%d/" currency-a)}
                     :model/PermissionsGroup {group-id :id} {}]
        (letfn [(nice-graph [graph]
                  (let [id->alias {default-a "Default A"
                                   default-ab "Default A -> B"
                                   currency-a "Currency A"
                                   currency-ab "Currency A -> B"}]
                    (transduce
                     identity
                     (fn
                       ([graph]
                        (-> (get-in graph [:groups group-id])
                            (select-keys (cons :root (vals id->alias)))))
                       ([graph [collection-id k]]
                        (replace-collection-ids collection-id graph k)))
                     graph
                     id->alias)))]
          (doseq [collection [default-a default-ab currency-a currency-ab]]
            (perms/grant-collection-read-permissions! group-id collection))
          ;; Set up state with default namespace update
          (mt/with-test-user :crowberto
            (let [before-default (graph/graph)]
              (update-graph-and-wait! (assoc before-default :groups {group-id {default-ab :write, currency-ab :write}})))
            ;; Update currency namespace
            @(graph/update-graph! :currency (assoc (graph/graph) :groups {group-id {default-a :write, currency-a :write}}) false)
            ;; Now update root collection
            (update-graph-and-wait! (assoc (graph/graph) :groups {group-id {:root :read}}))
            (is (= {:root :read, "Default A" :read, "Default A -> B" :write}
                   (nice-graph (graph/graph))))

            (testing "Shouldn't affect Root Collection perms for non-default namespaces (sparse - no :root entry)"
              (is (= {"Currency A" :write, "Currency A -> B" :read}
                     (nice-graph (graph/graph :currency)))))

            (testing "A CollectionPermissionGraphRevision recording the *changes* should be saved (sparse - no :root in before)"
              (is (=? {:before {:namespace nil
                                :groups {}}
                       :after {(keyword (str group-id)) {:root "read"}}}
                      (t2/select-one :model/CollectionPermissionGraphRevision {:order-by [[:id :desc]]}))))))))))

(deftest collection-namespace-update-root-non-default-test
  (testing "Should be able to update permissions for Root Collection in non-default namespace"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {default-a :id} {:location "/"}
                     :model/Collection {default-ab :id} {:location (format "/%d/" default-a)}
                     :model/Collection {currency-a :id} {:namespace "currency" :location "/"}
                     :model/Collection {currency-ab :id} {:namespace "currency" :location (format "/%d/" currency-a)}
                     :model/PermissionsGroup {group-id :id} {}]
        (letfn [(nice-graph [graph]
                  (let [id->alias {default-a "Default A"
                                   default-ab "Default A -> B"
                                   currency-a "Currency A"
                                   currency-ab "Currency A -> B"}]
                    (transduce
                     identity
                     (fn
                       ([graph]
                        (-> (get-in graph [:groups group-id])
                            (select-keys (cons :root (vals id->alias)))))
                       ([graph [collection-id k]]
                        (replace-collection-ids collection-id graph k)))
                     graph
                     id->alias)))]
          (doseq [collection [default-a default-ab currency-a currency-ab]]
            (perms/grant-collection-read-permissions! group-id collection))
          ;; Set up all previous state
          (mt/with-test-user :crowberto
            (let [before-default (graph/graph)]
              (update-graph-and-wait! (assoc before-default :groups {group-id {default-ab :write, currency-ab :write}})))
            (let [before-currency (graph/graph :currency)]
              @(graph/update-graph! :currency (assoc before-currency :groups {group-id {default-a :write, currency-a :write}}) false))
            (update-graph-and-wait! (assoc (graph/graph) :groups {group-id {:root :read}}))
            ;; Now update root for currency namespace
            (update-graph-and-wait! :currency (assoc (graph/graph :currency) :groups {group-id {:root :write}}))
            (is (= {:root :write, "Currency A" :write, "Currency A -> B" :read}
                   (nice-graph (graph/graph :currency))))

            (testing "Shouldn't affect Root Collection perms for default namespace"
              (is (= {:root :read, "Default A" :read, "Default A -> B" :write}
                     (nice-graph (graph/graph)))))

            (testing "A CollectionPermissionGraphRevision recording the *changes* should be saved (sparse - no :root in before)"
              (is (=? {:before {:namespace "currency"
                                :groups {}}
                       :after {(keyword (str group-id)) {:root "write"}}}
                      (t2/select-one :model/CollectionPermissionGraphRevision {:order-by [[:id :desc]]}))))))))))

(defn- do-with-n-temp-users-with-personal-collections! [num-users thunk]
  (mt/with-model-cleanup [:model/User :model/Collection]
    ;; insert all the users
    (let [max-id (:max-id (t2/select-one [:model/User [:%max.id :max-id]]))
          user-ids (range (inc max-id) (inc (+ num-users max-id)))
          values (map #(assoc (mt/with-temp-defaults :model/User)
                              :date_joined :%now
                              :id %)
                      user-ids)]
      (t2/query {:insert-into (t2/table-name :model/User)
                 :values values})
      (assert (= (count user-ids) num-users))
      ;; insert the Collections
      (t2/query {:insert-into (t2/table-name :model/Collection)
                 :values (for [user-id user-ids
                               :let [collection (mt/with-temp-defaults :model/Collection)]]
                           (assoc collection
                                  :personal_owner_id user-id
                                  :slug "my_collection"))}))
    ;; now run the thunk
    (thunk)))

(defmacro ^:private with-n-temp-users-with-personal-collections [num-users & body]
  `(do-with-n-temp-users-with-personal-collections! ~num-users (fn [] ~@body)))

(deftest mega-graph-test
  (testing "A truly insane amount of Personal Collections shouldn't cause a Stack Overflow (#13211)"
    (with-n-temp-users-with-personal-collections 2000
      (is (>= (t2/count :model/Collection :personal_owner_id [:not= nil]) 2000))
      (is (map? (graph/graph))))))

(deftest async-perm-graph-revisions
  (testing "A CollectionPermissionGraphRevision should be saved when the graph is updated, even if it takes a while."
    (clear-graph-revisions!)
    (binding [*current-user-id* (mt/user->id :crowberto)]
      (mt/with-temp [:model/Collection {collection-id :id} {:location "/"}]
        (let [all-users-group-id (u/the-id (perms-group/all-users))
              ;; Remove the group's permissions for the `:root` collection:
              _ (perms/revoke-collection-permissions! all-users-group-id collection-id)
              before (graph/graph)
              new-graph (assoc before :groups {(u/the-id (perms-group/all-users)) {collection-id :read}})]
          @(graph/update-graph! new-graph)
          (is (malli= [:map [:id :int] [:user_id :int] [:before :some] [:after :some]]
                      (t2/select-one :model/CollectionPermissionGraphRevision (inc (:revision before))))
              "Values for before and after should be present in the revision."))))))

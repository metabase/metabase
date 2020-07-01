(ns metabase.models.collection.graph-test
  (:require [clojure.test :refer :all]
            [medley.core :as m]
            [metabase
             [test :as mt]
             [util :as u]]
            [metabase.api.common :refer [*current-user-id*]]
            [metabase.models
             [collection :as collection :refer [Collection]]
             [collection-revision :as collection-revision :refer [CollectionRevision]]
             [permissions :as perms]
             [permissions-group :as group :refer [PermissionsGroup]]]
            [metabase.models.collection.graph :as graph]
            [metabase.test.fixtures :as fixtures]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :db :test-users :test-users-personal-collections))

(defn- lucky-collection-children-location []
  (collection/children-location (collection/user->personal-collection (mt/user->id :lucky))))

(defn replace-collection-ids
  "In Collection perms `graph`, replace instances of the ID of `collection-or-id` with `:COLLECTION`, making it possible
  to write tests that don't need to know its actual numeric ID."
  ([collection-or-id graph]
   (replace-collection-ids collection-or-id graph :COLLECTION))

  ([collection-or-id graph replacement-key]
   (let [id      (u/get-id collection-or-id)
         ;; match variations that pop up depending on whether the map was serialized to JSON. 100, :100, or "100"
         id-keys #{id (str id) (keyword (str id))}]
     (update graph :groups (partial m/map-vals (partial m/map-keys (fn [collection-id]
                                                                     (if (id-keys collection-id)
                                                                       replacement-key
                                                                       collection-id))))))))

(defn- clear-graph-revisions! []
  (db/delete! CollectionRevision))

(defn- only-groups
  "Remove entries for non-'magic' groups from a fetched perms `graph`."
  [graph groups-or-ids]
  (update graph :groups select-keys (map u/get-id groups-or-ids)))

(defn- only-collections
  "Remove entries for Collections whose ID is not in `collection-ids` from a fetched perms `graph`."
  [graph collections-or-ids]
  (let [ids (for [collection-or-id collections-or-ids]
              (if (= :root collection-or-id)
                collection-or-id
                (u/get-id collection-or-id)))]
    (update graph :groups (fn [groups]
                            (m/map-vals #(select-keys % ids) groups)))))

(defn- graph
  "Fetch collection graph.

  * `:clear-revisions?` = delete any previously existing collection revision entries so we get revision = 0
  * `:collections`      = IDs of Collections to keep. `:root` is always kept.
  * `:groups`           = IDs of Groups to keep. 'Magic' groups are always kept."
  [& {:keys [clear-revisions? collections groups]}]
  (when clear-revisions?
    (clear-graph-revisions!))
  ;; force lazy creation of the three magic groups as needed
  (group/all-users)
  (group/admin)
  (group/metabot)
  ;; now fetch the graph
  (cond-> (-> (graph/graph)
              (only-groups (concat [(group/all-users) (group/metabot) (group/admin)] groups))
              (only-collections (cons :root collections)))))

(deftest basic-test
  (testing "Check that the basic graph works"
    (mt/with-non-admin-groups-no-root-collection-perms
      (is (= {:revision 0
              :groups   {(u/get-id (group/all-users)) {:root :none}
                         (u/get-id (group/metabot))   {:root :none}
                         (u/get-id (group/admin))     {:root :write}}}
             (graph :clear-revisions? true))))))

(deftest new-collection-perms-test
  (testing "Creating a new Collection shouldn't give perms to anyone but admins"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp Collection [collection]
        (is (= {:revision 0
                :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :none}
                           (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
                           (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
               (replace-collection-ids collection (graph :clear-revisions? true, :collections [collection]))))))))

(deftest read-perms-test
  (testing "make sure read perms show up correctly"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp Collection [collection]
        (perms/grant-collection-read-permissions! (group/all-users) collection)
        (is (= {:revision 0
                :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :read}
                           (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
                           (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
               (replace-collection-ids collection (graph :clear-revisions? true, :collections [collection]))))))))

(deftest grant-write-perms-for-new-collections-test
  (testing "make sure we can grant write perms for new collections (!)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp Collection [collection]
        (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
        (is (=  {:revision 0
                 :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :write}
                            (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
                            (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
                (replace-collection-ids collection (graph :clear-revisions? true, :collections [collection]))))))))

(deftest non-magical-groups-test
  (testing "make sure a non-magical group will show up"
    (mt/with-temp PermissionsGroup [new-group]
      (mt/with-non-admin-groups-no-root-collection-perms
        (is (=   {:revision 0
                  :groups   {(u/get-id (group/all-users)) {:root :none}
                             (u/get-id (group/metabot))   {:root :none}
                             (u/get-id (group/admin))     {:root :write}
                             (u/get-id new-group)         {:root :none}}}
                 (graph :clear-revisions? true, :groups [new-group])))))))

(deftest root-collection-read-perms-test
  (testing "How abut *read* permissions for the Root Collection?"
    (mt/with-temp PermissionsGroup [new-group]
      (mt/with-non-admin-groups-no-root-collection-perms
        (perms/grant-collection-read-permissions! new-group collection/root-collection)
        (is (= {:revision 0
                :groups   {(u/get-id (group/all-users)) {:root :none}
                           (u/get-id (group/metabot))   {:root :none}
                           (u/get-id (group/admin))     {:root :write}
                           (u/get-id new-group)         {:root :read}}}
               (graph :clear-revisions? true, :groups [new-group])))))))

(deftest root-collection-write-perms-test
  (testing "How about granting *write* permissions for the Root Collection?"
    (mt/with-temp PermissionsGroup [new-group]
      (mt/with-non-admin-groups-no-root-collection-perms
        (perms/grant-collection-readwrite-permissions! new-group collection/root-collection)
        (is (= {:revision 0
                :groups   {(u/get-id (group/all-users)) {:root :none}
                           (u/get-id (group/metabot))   {:root :none}
                           (u/get-id (group/admin))     {:root :write}
                           (u/get-id new-group)         {:root :write}}}
               (graph :clear-revisions? true, :groups [new-group])))))))

(deftest no-op-test
  (testing "Can we do a no-op update?"
    ;; need to bind *current-user-id* or the Revision won't get updated
    (clear-graph-revisions!)
    (mt/with-non-admin-groups-no-root-collection-perms
      (binding [*current-user-id* (mt/user->id :crowberto)]
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
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp Collection [collection]
        (binding [*current-user-id* (mt/user->id :crowberto)]
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/get-id (group/all-users)) (u/get-id collection)]
                                         :read))
          (is (= {:revision 1
                  :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :read}
                             (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
                             (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
                 (replace-collection-ids collection (graph :collections [collection]))))))))

  (testing "can we give them *write* perms?"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp Collection [collection]
        (binding [*current-user-id* (mt/user->id :crowberto)]
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/get-id (group/all-users)) (u/get-id collection)]
                                         :write))
          (is (= {:revision 1
                  :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :write}
                             (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
                             (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
                 (replace-collection-ids collection (graph :collections [collection])))))))))

(deftest revoke-perms-test
  (testing "can we *revoke* perms?"
    (clear-graph-revisions!)
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp Collection [collection]
        (binding [*current-user-id* (mt/user->id :crowberto)]
          (perms/grant-collection-read-permissions! (group/all-users) collection)
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/get-id (group/all-users)) (u/get-id collection)]
                                         :none))
          (is (= {:revision 1
                  :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :none}
                             (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
                             (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
                 (replace-collection-ids collection (graph :collections [collection])))))))))

(deftest grant-root-permissions-test
  (testing "Can we grant *read* permissions for the Root Collection?"
    (mt/with-temp PermissionsGroup [new-group]
      (clear-graph-revisions!)
      (mt/with-non-admin-groups-no-root-collection-perms
        (binding [*current-user-id* (mt/user->id :crowberto)]
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/get-id new-group) :root]
                                         :read))
          (is (= {:revision 1
                  :groups   {(u/get-id (group/all-users)) {:root :none}
                             (u/get-id (group/metabot))   {:root :none}
                             (u/get-id (group/admin))     {:root :write}
                             (u/get-id new-group)         {:root :read}}}
                 (graph :groups [new-group])))))))

  (testing "How about granting *write* permissions for the Root Collection?"
    (mt/with-temp PermissionsGroup [new-group]
      (clear-graph-revisions!)
      (mt/with-non-admin-groups-no-root-collection-perms
        (binding [*current-user-id* (mt/user->id :crowberto)]
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/get-id new-group) :root]
                                         :write))
          (is (= {:revision 1
                  :groups   {(u/get-id (group/all-users)) {:root :none}
                             (u/get-id (group/metabot))   {:root :none}
                             (u/get-id (group/admin))     {:root :write}
                             (u/get-id new-group)         {:root :write}}}
                 (graph :groups [new-group]))))))))

(deftest revoke-root-permissions-test
  (testing "can we *revoke* RootCollection perms?"
    (mt/with-temp PermissionsGroup [new-group]
      (clear-graph-revisions!)
      (mt/with-non-admin-groups-no-root-collection-perms
        (binding [*current-user-id* (mt/user->id :crowberto)]
          (perms/grant-collection-readwrite-permissions! new-group collection/root-collection)
          (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                         [:groups (u/get-id new-group) :root]
                                         :none))
          (is (= {:revision 1
                  :groups   {(u/get-id (group/all-users)) {:root :none}
                             (u/get-id (group/metabot))   {:root :none}
                             (u/get-id (group/admin))     {:root :write}
                             (u/get-id new-group)         {:root :none}}}
                 (graph :groups [new-group]))))))))

(deftest personal-collections-should-not-appear-test
  (testing "Make sure that personal Collections *do not* appear in the Collections graph"
    (mt/with-non-admin-groups-no-root-collection-perms
      (is (= {:revision 0
              :groups   {(u/get-id (group/all-users)) {:root :none}
                         (u/get-id (group/metabot))   {:root :none}
                         (u/get-id (group/admin))     {:root :write}}}
             (graph :clear-revisions? true)))))

  (testing "Make sure descendants of Personal Collections do not come back as part of the graph either..."
    (clear-graph-revisions!)
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp Collection [_ {:location (lucky-collection-children-location)}]
        (is (= {:revision 0
                :groups   {(u/get-id (group/all-users)) {:root :none}
                           (u/get-id (group/metabot))   {:root :none}
                           (u/get-id (group/admin))     {:root :write}}}
               (graph)))))))

(deftest disallow-editing-personal-collections-test
  (testing "Make sure that if we try to be sneaky and edit a Personal Collection via the graph, changes are ignored"
    (mt/with-non-admin-groups-no-root-collection-perms
      (let [lucky-personal-collection-id (u/get-id (collection/user->personal-collection (mt/user->id :lucky)))
            path                         [:groups (u/get-id (group/all-users)) lucky-personal-collection-id]]
        (mt/throw-if-called graph/update-group-permissions!
          (graph/update-graph! (assoc-in (graph :clear-revisions? true) path :read)))

        (testing "double-check that the graph is unchanged"
          (is (= {:revision 0
                  :groups   {(u/get-id (group/all-users)) {:root :none}
                             (u/get-id (group/metabot))   {:root :none}
                             (u/get-id (group/admin))     {:root :write}}}
                 (graph))))

        (testing "No revision should have been saved"
          (is (= 0
                 (collection-revision/latest-id)))))))

  (testing "Make sure you can't be sneaky and edit descendants of Personal Collections either."
    (mt/with-temp Collection [collection {:location (lucky-collection-children-location)}]
      (let [lucky-personal-collection-id (u/get-id (collection/user->personal-collection (mt/user->id :lucky)))]
        (is (thrown?
             Exception
             (graph/update-graph! (assoc-in (graph :clear-revisions? true)
                                            [:groups
                                             (u/get-id (group/all-users))
                                             lucky-personal-collection-id
                                             (u/get-id collection)]
                                            :read))))))))

(deftest collection-namespace-test
  (testing "The permissions graph should be namespace-aware.\n"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp* [Collection [{default-a :id}   {:location "/"}]
                      Collection [{default-ab :id}  {:location (format "/%d/" default-a)}]
                      Collection [{currency-a :id}  {:namespace "currency", :location "/"}]
                      Collection [{currency-ab :id} {:namespace "currency", :location (format "/%d/" currency-a)}]
                      PermissionsGroup [{group-id :id}]]
        (letfn [(nice-graph [graph]
                  (let [id->alias {default-a   "Default A"
                                   default-ab  "Default A -> B"
                                   currency-a  "Currency A"
                                   currency-ab "Currency A -> B"}]
                    (transduce
                     identity
                     (fn
                       ([graph]
                        (-> (get-in graph [:groups group-id])
                            (select-keys (vals id->alias))))
                       ([graph [collection-id k]]
                        (replace-collection-ids collection-id graph k)))
                     graph
                     id->alias)))]
          (doseq [collection [default-a default-ab currency-a currency-ab]]
            (perms/grant-collection-read-permissions! group-id collection))
          (testing "Calling (graph) with no args should only show Collections in the default namespace"
            (is (= {"Default A" :read, "Default A -> B" :read}
                   (nice-graph (graph/graph))
                   (nice-graph (graph/graph nil)))))

          (testing "You should be able to pass an different namespace to (graph) to see Collections in that namespace"
            (is (= {"Currency A" :read, "Currency A -> B" :read}
                   (nice-graph (graph/graph :currency)))))

          (testing "Should be able to pass `::graph/all` to get a combined graph of all namespaces (used for saving revisions)"
            (is (= {"Default A" :read, "Default A -> B" :read "Currency A" :read, "Currency A -> B" :read}
                   (nice-graph (graph/graph ::graph/all)))))

          ;; bind a current user so CollectionRevisions get saved.
          (mt/with-test-user :crowberto
            (testing "Should be able to update the graph for the default namespace.\n"
              (let [before (graph/graph ::graph/all)]
                (graph/update-graph! (assoc (graph/graph) :groups {group-id {default-ab :write, currency-ab :write}}))
                (is (= {"Default A" :read, "Default A -> B" :write}
                       (nice-graph (graph/graph))))

                (testing "Updates to Collections in other namespaces should be ignored"
                  (is (= {"Currency A" :read, "Currency A -> B" :read}
                         (nice-graph (graph/graph :currency)))))

                (testing "A CollectionRevision recording the *changes* to the perms graph should be saved."
                  (is (schema= {:id         su/IntGreaterThanZero
                                :before     (s/eq (mt/obj->json->obj before))
                                :after      (s/eq {(keyword (str group-id)) {(keyword (str default-ab)) "write"}})
                                :user_id    (s/eq (mt/user->id :crowberto))
                                :created_at java.time.temporal.Temporal
                                s/Keyword   s/Any}
                               (db/select-one CollectionRevision {:order-by [[:id :desc]]}))))))

            (testing "Should be able to update the graph for a non-default namespace.\n"
              (let [before (graph/graph ::graph/all)]
                (graph/update-graph! :currency (assoc (graph/graph) :groups {group-id {default-a :write, currency-a :write}}))
                (is (= {"Currency A" :write, "Currency A -> B" :read}
                       (nice-graph (graph/graph :currency))))

                (testing "Updates to Collections in other namespaces should be ignored"
                  (is (= {"Default A" :read, "Default A -> B" :write}
                         (nice-graph (graph/graph)))))

                (testing "A CollectionRevision recording the *changes* to the perms graph should be saved."
                  (is (schema= {:id         su/IntGreaterThanZero
                                :before     (s/eq (mt/obj->json->obj before))
                                :after      (s/eq {(keyword (str group-id)) {(keyword (str currency-a)) "write"}})
                                :user_id    (s/eq (mt/user->id :crowberto))
                                :created_at java.time.temporal.Temporal
                                s/Keyword   s/Any}
                               (db/select-one CollectionRevision {:order-by [[:id :desc]]}))))))))))))

(ns metabase-enterprise.tenants.models-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase-enterprise.tenants.models :as tenants.model]
   [metabase-enterprise.tenants.schema :as tenants.schema]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]
   [metabase.users.models.user :as user]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Tenant Collection Creation                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest tenant-auto-creates-collection-test
  (testing "Creating a Tenant automatically creates a dedicated collection"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-model-cleanup [:model/Tenant :model/Collection]
          (let [[{tenant-collection-id :tenant_collection_id}] (tenants.model/create-tenants! [{:name "TestyLilTenant" :slug "test"}])]
            (testing "tenant_collection_id is set and references a valid collection"
              (is (some? tenant-collection-id))
              (is (t2/exists? :model/Collection :id tenant-collection-id)))
            (let [coll (t2/select-one :model/Collection :id tenant-collection-id)]
              (testing "collection has correct namespace"
                (is (= :tenant-specific (:namespace coll))))
              (testing "collection has correct type"
                (is (= "tenant-specific-root-collection" (:type coll))))
              (testing "collection has correct name"
                (is (= "Tenant Collection: TestyLilTenant" (:name coll))))
              (testing "collection location is at root"
                (is (= "/" (:location coll)))))))))))

(deftest tenant-collection-name-follows-tenant-name-test
  (testing "Tenant collection name includes the tenant name"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-model-cleanup [:model/Tenant :model/Collection]
          (let [[{tenant-collection-id :tenant_collection_id}] (tenants.model/create-tenants! [{:name "My Company Inc" :slug "mycompany"}])
                coll                                         (t2/select-one :model/Collection :id tenant-collection-id)]
            (is (= "Tenant Collection: My Company Inc" (:name coll)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Collection Namespace Constraints                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest tenant-collection-children-inherit-namespace-test
  (testing "Children of tenant collections must have tenant-specific namespace"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "TestyLilTenant" :slug "test"}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (mt/with-temp [:model/Collection child {:name "Child Collection"
                                                    :namespace :tenant-specific
                                                    :location (collection/children-location tenant-coll)}]
              (testing "child has tenant-specific namespace"
                (is (= :tenant-specific (:namespace child))))
              (testing "child does NOT have tenant-specific-root-collection type"
                (is (not= "tenant-specific-root-collection" (:type child)))))))))))

(deftest tenant-collection-descendants-must-be-tenant-specific-test
  (testing "All descendants in tenant hierarchy must have tenant-specific namespace"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "TestyLilTenant" :slug "test"}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (mt/with-temp [:model/Collection {child-id :id} {:name "Child"
                                                             :namespace :tenant-specific
                                                             :location (collection/children-location tenant-coll)}
                           :model/Collection grandchild     {:name "Grandchild"
                                                             :namespace :tenant-specific
                                                             :location (str "/" tenant-collection-id "/" child-id "/")}]
              (testing "grandchild has tenant-specific namespace"
                (is (= :tenant-specific (:namespace grandchild))))
              (testing "grandchild does NOT have root collection type"
                (is (not= "tenant-specific-root-collection" (:type grandchild)))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Helper Function Tests                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest is-dedicated-tenant-collection-or-descendant-test
  (testing "is-dedicated-tenant-collection-or-descendant? correctly identifies tenant collections"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "TestyLilTenant" :slug "test"}
                       :model/Collection regular-coll {:name "Regular Collection" :location "/"}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (testing "returns true for tenant root collection"
              (is (collection/is-dedicated-tenant-collection-or-descendant? tenant-coll)))
            (testing "returns false for regular collection"
              (is (not (collection/is-dedicated-tenant-collection-or-descendant? regular-coll))))
            (mt/with-temp [:model/Collection child {:name "Child"
                                                    :namespace "tenant-specific"
                                                    :location (collection/children-location tenant-coll)}]
              (testing "returns true for tenant collection descendant"
                (is (collection/is-dedicated-tenant-collection-or-descendant? child))))))))))

(deftest user-tenant-collection-and-descendant-ids-test
  (testing "user->tenant-collection-and-descendant-ids returns correct collection IDs"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id
                                      tenant-collection-id :tenant_collection_id} {:name "TestyLilTenant" :slug "test"}
                       :model/User {tenant-user-id :id} {:tenant_id tenant-id}
                       :model/User {regular-user-id :id} {}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (mt/with-temp [:model/Collection {child-id :id} {:name "Child"
                                                             :namespace "tenant-specific"
                                                             :location (collection/children-location tenant-coll)}
                           :model/Collection {grandchild-id :id} {:name "Grandchild"
                                                                  :namespace "tenant-specific"
                                                                  :location (str "/" tenant-collection-id "/" child-id "/")}]
              (testing "tenant user gets root collection and all descendants"
                (let [ids (set (tenants.model/user->tenant-collection-and-descendant-ids tenant-user-id))]
                  (is (contains? ids tenant-collection-id))
                  (is (contains? ids child-id))
                  (is (contains? ids grandchild-id))
                  (is (= 3 (count ids)))))
              (testing "regular user gets empty vector"
                (is (= [] (tenants.model/user->tenant-collection-and-descendant-ids regular-user-id)))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Tenant Collection Constraints                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest cannot-set-personal-owner-on-tenant-collection-test
  (testing "Tenant collections should not have personal_owner_id set"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "TestyLilTenant" :slug "test"}
                       :model/User {user-id :id} {}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-collection-id)]
            (testing "tenant root collection has no personal_owner_id"
              (is (nil? (:personal_owner_id tenant-coll))))
            (testing "attempting to set personal_owner_id should fail"
              (is (thrown-with-msg?
                   Exception
                   #"You are not allowed to change the owner of a Tenant Collection."
                   (collection/update-collections! [{:id tenant-collection-id :personal_owner_id user-id}] nil))))))))))

(deftest cannot-change-namespace-after-creation-test
  (testing "Cannot change namespace of tenant collection after creation"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "TestyLilTenant" :slug "test"}]
          (testing "attempting to change namespace to nil should fail"
            (is (thrown-with-msg?
                 Exception
                 #"cannot move a Collection to a different namespace"
                 (collection/update-collections! [{:id tenant-collection-id :namespace nil}] nil)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Tenant Collection Name Localization                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest maybe-localize-tenant-collection-names-turns-all-dtcs-into-our-data
  (testing "maybe-localize-tenant-collection-names handles multiple collections efficiently"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant1-coll-id :tenant_collection_id tenant1-id :id} {:name "Tenant One" :slug "tenant1"}
                       :model/Tenant {tenant2-coll-id :tenant_collection_id} {:name "Tenant Two" :slug "tenant2"}
                       :model/Collection regular-coll {:name "Regular Collection" :location "/"}
                       :model/User {tenant-user-id :id} {:tenant_id tenant1-id}]
          (let [colls [(t2/select-one :model/Collection :id tenant1-coll-id)
                       (t2/select-one :model/Collection :id tenant2-coll-id)
                       regular-coll]
                localized-colls (collection/maybe-localize-tenant-collection-names colls)]
            (is (= ["Tenant collection: Tenant One"
                    "Tenant collection: Tenant Two"
                    "Regular Collection"]
                   (map :name localized-colls))))
          (mt/with-current-user tenant-user-id
            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"You don't have permissions to do that"
                                  (collection/maybe-localize-tenant-collection-names
                                   [(t2/select-one :model/Collection :id tenant2-coll-id)])))
            (is (= ["Our data"
                    "Regular Collection"]
                   (map :name (collection/maybe-localize-tenant-collection-names [(t2/select-one :model/Collection :id tenant1-coll-id)
                                                                                  regular-coll]))))))))))

(deftest maybe-localize-tenant-collection-name-single-test
  (testing "maybe-localize-tenant-collection-name works for single collection"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id
                                      tenant-id :id} {:name "My Tenant" :slug "mytenant"}
                       :model/User {tenant-user :id} {:tenant_id tenant-id}]
          (let [coll (t2/select-one :model/Collection :id tenant-collection-id)
                localized-coll (collection/maybe-localize-tenant-collection-name coll)]
            (is (= "Tenant collection: My Tenant" (:name localized-coll))))
          (mt/with-current-user tenant-user
            (let [coll (t2/select-one :model/Collection :id tenant-collection-id)
                  localized-coll (collection/maybe-localize-tenant-collection-name coll)]
              (is (= "Our data" (:name localized-coll))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Tenant Hooks                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest tenant-schema-checks-columns-test
  (testing "slug must be lower-case letters, digits, dashes and underscores"
    (is (not (mr/validate ::tenants.schema/tenant {:id 1 :slug "UPPER"}))))
  (testing "name cannot be blank"
    (is (not (mr/validate ::tenants.schema/tenant {:id 1 :name " "}))))
  (testing "attribute keys cannot start with @"
    (is (not (mr/validate ::tenants.schema/tenant {:id 1 :attributes {"@tenant.slug" "other"}}))))
  (testing "valid columns pass"
    (is (mr/validate ::tenants.schema/tenant {:id 1 :name "Tenant" :slug "tenant-1" :attributes {"env" "prod"}}))))

(deftest create-tenant-checks-name-and-slug-uniqueness-test
  (mt/with-temp [:model/Tenant _ {:name "Unique Tenant" :slug "unique-tenant"}]
    (mt/with-model-cleanup [:model/Tenant]
      (testing "name of existing tenant"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"This tenant name or slug is already taken"
                              (tenants.model/create-tenants! [{:name "Unique Tenant" :slug "other-unique-tenant"}]))))
      (testing "slug of existing tenant"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"This tenant name or slug is already taken"
                              (tenants.model/create-tenants! [{:name "Other Unique Tenant" :slug "unique-tenant"}])))))))

(deftest update-checks-tenant-columns-test
  (mt/with-temp [:model/Tenant {id :id} {:name "Updated Tenant" :slug "updated-tenant" :attributes {"env" "prod"}}
                 :model/Tenant _        {:name "Taken Tenant" :slug "taken-tenant"}]
    (testing "slug cannot change"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You cannot change the slug of a tenant"
                            (t2/update! :model/Tenant :id id {:slug "new-slug"}))))
    (testing "tenant collection cannot change"
      (mt/with-temp [:model/Collection {coll-id :id} {}]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You cannot change the collection of a tenant"
                              (t2/update! :model/Tenant :id id {:tenant_collection_id coll-id})))))
    (testing "name cannot be taken by another tenant"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"This name is already taken"
                            (tenants.model/update-tenants! [{:id id :name "Taken Tenant"}]))))
    (testing "nothing was written"
      (is (=? {:name "Updated Tenant" :slug "updated-tenant" :attributes {"env" "prod"}}
              (t2/select-one :model/Tenant :id id))))))

(deftest deactivating-tenant-deactivates-its-users-test
  (mt/with-temp [:model/Tenant {tenant-id :id}       {}
                 :model/Tenant {other-tenant-id :id} {}
                 :model/User   {user-id :id}         {:tenant_id tenant-id}
                 :model/User   {inactive-id :id}     {:tenant_id tenant-id}
                 :model/User   {other-id :id}        {:tenant_id other-tenant-id}]
    (user/update-users! [{:id inactive-id :is_active false}])
    (let [state (fn [id] (t2/select-one [:model/User :is_active :deactivated_with_tenant] :id id))]
      (tenants.model/update-tenants! [{:id tenant-id :is_active false}])
      (testing "active users of tenant are deactivated with it"
        (is (=? {:is_active false :deactivated_with_tenant true} (state user-id))))
      (testing "users deactivated before tenant are not marked"
        (is (=? {:is_active false :deactivated_with_tenant nil} (state inactive-id))))
      (testing "users of other tenants stay active"
        (is (=? {:is_active true} (state other-id))))
      (tenants.model/update-tenants! [{:id tenant-id :is_active true}])
      (testing "reactivating tenant reactivates only users deactivated with it"
        (is (=? {:is_active true :deactivated_with_tenant nil} (state user-id)))
        (is (=? {:is_active false} (state inactive-id)))))))

(deftest deactivating-tenant-deletes-subscriptions-of-its-users-test
  (mt/with-temp [:model/Tenant                {tenant-id :id}        {}
                 :model/User                  {user-id :id}          {:tenant_id tenant-id}
                 :model/User                  {other-id :id}         {}
                 :model/Pulse                 {pulse-id :id}         {}
                 :model/PulseChannel          {pulse-channel-id :id} {:pulse_id pulse-id}
                 :model/PulseChannelRecipient _                      {:pulse_channel_id pulse-channel-id :user_id user-id}
                 :model/PulseChannelRecipient _                      {:pulse_channel_id pulse-channel-id :user_id other-id}]
    (tenants.model/update-tenants! [{:id tenant-id :is_active false}])
    (is (not (t2/exists? :model/PulseChannelRecipient :user_id user-id)))
    (is (t2/exists? :model/PulseChannelRecipient :user_id other-id))))

(deftest deactivating-all-tenants-deactivates-their-users-test
  (mt/with-temp [:model/Tenant {tenant-id :id} {}
                 :model/User   {user-id :id}   {:tenant_id tenant-id}]
    (let [active-ids (t2/select-pks-set :model/Tenant :is_active true)]
      (try
        (tenants.model/deactivate-tenants!)
        (is (false? (t2/select-one-fn :is_active :model/Tenant :id tenant-id)))
        (is (=? {:is_active false :deactivated_with_tenant true}
                (t2/select-one [:model/User :is_active :deactivated_with_tenant] :id user-id)))
        (finally
          (tenants.model/update-tenants! (mapv #(hash-map :id % :is_active true) active-ids)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Tenant Permissions                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest tenant-permission-checks-test
  (mt/with-temp [:model/Tenant tenant           {}
                 :model/User   {tenant-user :id} {:tenant_id (:id tenant)}]
    (testing "superusers create, read and write tenants"
      (mt/with-current-user (mt/user->id :crowberto)
        (is (true? (api/create-check :model/Tenant {:name "New Tenant" :slug "new-tenant"})))
        (is (some? (api/read-check tenant)))
        (is (some? (api/write-check tenant)))))
    (testing "internal users read tenants but neither create nor write them"
      (mt/with-current-user (mt/user->id :rasta)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that"
                              (api/create-check :model/Tenant {:name "New Tenant" :slug "new-tenant"})))
        (is (some? (api/read-check tenant)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that"
                              (api/write-check tenant)))))
    (testing "tenant users do not read tenants"
      (mt/with-current-user tenant-user
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that"
                              (api/read-check tenant)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Tenant rules on Users                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest superuser-cannot-be-tenant-user-test
  (mt/with-temp [:model/Tenant {tenant-id :id} {}
                 :model/User   {user-id :id}   {:tenant_id tenant-id}]
    (testing "insert of superuser with tenant"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Superusers cannot be tenant users"
                            (t2/insert! :model/User {:first_name   "Test"
                                                     :last_name    "User"
                                                     :email        "superuser-tenant-user@example.com"
                                                     :is_superuser true
                                                     :tenant_id    tenant-id})))
      (is (not (t2/exists? :model/User :email "superuser-tenant-user@example.com"))))
    (testing "tenant user made superuser"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Superusers cannot be tenant users"
                            (t2/update! :model/User :id user-id {:is_superuser true})))
      (is (false? (t2/select-one-fn :is_superuser :model/User :id user-id))))))

(deftest create-tenants-statement-count-does-not-grow-with-rows-test
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-model-cleanup [:model/Tenant :model/Collection]
        (let [counted (fn [n]
                        (events.tu/statement-count!
                         #(tenants.model/create-tenants!
                           (vec (repeatedly n (fn [] (let [tenant-name (mt/random-name)]
                                                       {:name tenant-name :slug (u/lower-case-en tenant-name)})))))))]
          (counted 1)
          (is (= (counted 2) (counted 6))))))))

(deftest update-tenants-statement-count-grows-by-row-statements-only-test
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-model-cleanup [:model/User :model/Tenant :model/Collection]
        (let [create! (fn [n]
                        (mapv :id (tenants.model/create-tenants!
                                   (vec (repeatedly n (fn [] (let [tenant-name (mt/random-name)]
                                                               {:name tenant-name :slug (u/lower-case-en tenant-name)})))))))
              counted (fn [n]
                        (let [ids (create! n)]
                          (user/create-users! (mapv #(hash-map :email (str (mt/random-name) "@example.com") :tenant_id %) ids))
                          (tenants.model/update-tenants! (mapv #(hash-map :id % :attributes {"env" "prod"}) (take-nth 2 ids)))
                          (events.tu/statement-count!
                           #(tenants.model/update-tenants! (mapv (fn [id] {:id id :attributes {"env" "prod"} :is_active false}) ids)))))]
          (counted 1)
          (testing "half the rows hold the attributes already, so Toucan writes the rows in mixed state apart: at most 2
                    statements per row"
            (is (<= (- (counted 6) (counted 2)) (* 2 (- 6 2))))))))))

(deftest update-tenants-refuses-two-renames-to-one-name-test
  (mt/with-temp [:model/Tenant {first-id :id}  {:name "First Tenant" :slug "first-tenant"}
                 :model/Tenant {second-id :id} {:name "Second Tenant" :slug "second-tenant"}]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"This name is already taken"
                          (tenants.model/update-tenants! [{:id first-id :name "Shared Tenant"} {:id second-id :name "Shared Tenant"}])))
    (is (= ["First Tenant" "Second Tenant"]
           (mapv #(t2/select-one-fn :name :model/Tenant :id %) [first-id second-id])))))

(deftest update-tenants-deactivates-users-of-every-flipped-tenant-test
  (mt/with-temp [:model/Tenant {active-id :id}   {:name "Active Tenant" :slug "active-tenant"}
                 :model/Tenant {inactive-id :id} {:name "Inactive Tenant" :slug "inactive-tenant" :is_active false}
                 :model/User   {user-1 :id}      {:tenant_id active-id}
                 :model/User   {user-2 :id}      {:tenant_id inactive-id :is_active true}]
    (tenants.model/update-tenants! [{:id active-id :is_active false} {:id inactive-id :is_active false}])
    (is (=? {:is_active false :deactivated_with_tenant true}
            (t2/select-one [:model/User :is_active :deactivated_with_tenant] :id user-1)))
    (testing "a Tenant that was inactive already does not cascade"
      (is (true? (t2/select-one-fn :is_active :model/User :id user-2))))))

(deftest update-tenants-publishes-one-event-test
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-model-cleanup [:model/Tenant :model/Collection]
        (doseq [n [2 6]]
          (let [ids (mapv :id (tenants.model/create-tenants!
                               (vec (repeatedly n (fn [] (let [tenant-name (mt/random-name)]
                                                           {:name tenant-name :slug (u/lower-case-en tenant-name)}))))))]
            (testing (str "update of " n " tenants with distinct names publishes one update event")
              (is (= [:event/tenant-update]
                     (events.tu/published-topics!
                      #(tenants.model/update-tenants! (mapv (fn [id] {:id id :name (mt/random-name)}) ids))))))))))))

(deftest update-tenants-frees-name-renamed-away-in-same-call-test
  (mt/with-temp [:model/Tenant {first-id :id}  {:name "Chain First" :slug "chain-first"}
                 :model/Tenant {second-id :id} {:name "Chain Second" :slug "chain-second"}]
    (tenants.model/update-tenants! [{:id first-id :name "Chain Second"} {:id second-id :name "Chain Third"}])
    (is (= ["Chain Second" "Chain Third"]
           (mapv #(t2/select-one-fn :name :model/Tenant :id %) [first-id second-id])))))

(deftest tenants-are-not-created-in-worktree-test
  (mt/with-premium-features #{:tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/RemoteSyncWorktree {worktree-id :id} {:branch "test-branch"}]
        (mdb/with-worktree-scope {:type :worktree :worktree-id worktree-id}
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tenants can only be created in the default worktree"
                                (tenants.model/create-tenants! [{:name "Test Tenant" :slug "test-tenant"}]))))))))

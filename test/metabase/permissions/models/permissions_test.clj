(ns metabase.permissions.models.permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase.audit-app.impl :as audit.impl]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.util :as perms.u]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users-personal-collections))

;;; This originally lived in [[metabase.permissions.models.permissions]] but it is only used in tests these days so I moved it here.
(defn is-permissions-set?
  "Is `permissions-set` a valid set of permissions object paths?"
  ^Boolean [permissions-set]
  (and (set? permissions-set)
       (every? (fn [path]
                 (or (= path "/")
                     (perms.u/valid-path? path)))
               permissions-set)))

(deftest ^:parallel is-permissions-set?-test
  (testing "valid permissions sets"
    (are [perms-set] (is-permissions-set? perms-set)
      #{}
      #{"/"}))
  (testing "invalid permissions sets"
    (testing "things that aren't sets"
      (are [perms-set] (not (is-permissions-set? perms-set))
        nil {} [] true false "" 1234 :wow))
    (testing "things that contain invalid paths"
      (are [perms-set] (not (is-permissions-set? perms-set))
        #{"/" "/toucans/"}
        #{"/db/1/" "/"}
        #{"/db/1/native/schema/"}
        #{"/db/1/schema/public/" "/parroty/"}
        #{"/db/1/schema/public/table/1/" "/ocean/"}))))

(deftest ^:parallel set-has-full-permissions?-test
  (are [perms path] (perms/set-has-full-permissions? perms path)
    #{"/"}                                                     "/db/1/schema/public/table/2/"
    #{"/db/3/" "/db/1/"}                                       "/db/1/schema/public/table/2/"
    #{"/db/3/" "/db/1/"}                                       "/db/1/schema/public/table/2/"
    #{"/db/1/schema/public/" "/db/3/schema//"}                 "/db/1/schema/public/table/2/"
    #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"} "/db/1/schema/public/table/2/"
    #{"/db/1/native/"}                                         "/db/1/native/")
  (are [perms path] (not (perms/set-has-full-permissions? perms path))
    #{}                                              "/db/1/schema/public/table/2/"
    #{"/db/1/native/"}                               "/db/1/"
    #{"/db/1/schema/public/"}                        "/db/1/schema/"
    #{"/db/1/schema/public/table/1/"}                "/db/1/schema/public/"
    #{"/db/2/"}                                      "/db/1/schema/public/table/2/"
    #{"/db/3/" "/db/2/"}                             "/db/1/schema/public/table/2/"
    #{"/db/3/schema/public/" "/db/2/schema/public/"} "/db/1/schema/public/table/2/"))

(deftest ^:parallel set-has-application-permission-of-type?-test
  (are [perms perms-type] (perms/set-has-application-permission-of-type? perms perms-type)
    #{"/"}                          :subscription
    #{"/"}                          :monitoring
    #{"/"}                          :setting
    #{"/application/subscription/"} :subscription
    #{"/application/monitoring/"}   :monitoring
    #{"/application/setting/"}      :setting)
  (are [perms perms-type] (not (perms/set-has-application-permission-of-type? perms perms-type))
    #{"/application/subscription/"} :monitoring
    #{"/application/subscription/"} :setting
    #{"/application/monitoring/"}   :subscription))

(deftest ^:parallel set-has-full-permissions-for-set?-test
  (are [perms paths] (perms/set-has-full-permissions-for-set? perms paths)
    #{"/"}                                                     #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}
    #{"/db/3/" "/db/1/"}                                       #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}
    #{"/db/3/" "/db/1/"}                                       #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}
    #{"/db/1/schema/public/" "/db/3/schema//"}                 #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}
    #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"} #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"})
  (are [perms paths] (not (perms/set-has-full-permissions-for-set? perms paths))
    #{}                                                        #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}
    #{"/db/2/"}                                                #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}
    #{"/db/2/" "/db/1/"}                                       #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}
    #{"/db/3/schema/public/" "/db/1/schema/public/"}           #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}
    #{"/db/3/schema//table/5/" "/db/1/schema/public/table/2/"} #{"/db/3/schema//table/4/" "/db/1/schema/public/table/2/"}))

(deftest ^:parallel perms-objects-set-for-parent-collection-test
  (are [input expected] (= expected
                           (apply perms/perms-objects-set-for-parent-collection input))
    [{:collection_id 1337} :read]  #{"/collection/1337/read/"}
    [{:collection_id 1337} :write] #{"/collection/1337/"}
    [{:collection_id nil} :read]   #{"/collection/root/read/"}
    [{:collection_id nil} :write]  #{"/collection/root/"})

  (testing "invalid input"
    (doseq [[reason inputs] {"map must have `:collection_id` key"
                             [[{} :read]]

                             "must be a map"
                             [[100 :read]
                              [nil :read]]

                             "read-or-write must be `:read` or `:write`"
                             [[{:collection_id nil} :readwrite]]}
            input inputs]
      (testing reason
        (testing (pr-str (cons 'perms-objects-set-for-parent-collection input))
          (is (thrown?
               Exception
               (apply perms/perms-objects-set-for-parent-collection input))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                 Granting/Revoking Permissions Helper Functions                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest revoke-permissions-helper-function-test
  (testing "Make sure if you try to use the helper function to *revoke* perms for a Personal Collection, you get an Exception"
    (is (thrown-with-msg?
         Exception
         #"You cannot edit permissions for a Personal Collection or its descendants."
         (perms/revoke-collection-permissions!
          (perms-group/all-users)
          (u/the-id (t2/select-one :model/Collection :personal_owner_id (mt/user->id :lucky))))))

    (testing "(should apply to descendants as well)"
      (mt/with-temp [:model/Collection collection {:location (collection/children-location
                                                              (collection/user->personal-collection
                                                               (mt/user->id :lucky)))}]
        (is (thrown-with-msg?
             Exception
             #"You cannot edit permissions for a Personal Collection or its descendants."
             (perms/revoke-collection-permissions! (perms-group/all-users) collection)))))))

(deftest revoke-collection-permissions-test
  (testing "Should be able to revoke permissions for non-personal Collections"
    (mt/with-temp [:model/Collection {collection-id :id}]
      (perms/revoke-collection-permissions! (perms-group/all-users) collection-id)
      (testing "Collection should still exist"
        (is (some? (t2/select-one :model/Collection :id collection-id)))))))

(deftest disallow-granting-personal-collection-perms-test
  (mt/with-temp [:model/Collection collection {:location (collection/children-location
                                                          (collection/user->personal-collection
                                                           (mt/user->id :lucky)))}]
    (doseq [[perms-type f] {"read"  perms/grant-collection-read-permissions!
                            "write" perms/grant-collection-readwrite-permissions!}]
      (testing (format "Should throw Exception if you use the helper function to grant %s perms for a Personal Collection"
                       perms-type)
        (is (thrown?
             Exception
             (f (perms-group/all-users)
                (u/the-id (t2/select-one :model/Collection :personal_owner_id (mt/user->id :lucky))))))

        (testing "(should apply to descendants as well)"
          (is (thrown?
               Exception
               (f (perms-group/all-users) collection))))))))

(deftest grant-revoke-root-collection-permissions-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id}]
    (letfn [(perms []
              (t2/select-fn-set :object :model/Permissions {:where [:and
                                                                    [:like :object "/collection/%"]
                                                                    [:= :group_id group-id]]}))]
      (is (= nil
             (perms)))
      (testing "Should be able to grant Root Collection perms"
        (perms/grant-collection-read-permissions! group-id collection/root-collection)
        (is (= #{"/collection/root/read/"}
               (perms))))
      (testing "Should be able to grant non-default namespace Root Collection read perms"
        (perms/grant-collection-read-permissions! group-id (assoc collection/root-collection :namespace "currency"))
        (is (= #{"/collection/root/read/" "/collection/namespace/currency/root/read/"}
               (perms))))
      (testing "Should be able to revoke Root Collection perms (shouldn't affect other namespaces)"
        (perms/revoke-collection-permissions! group-id collection/root-collection)
        (is (= #{"/collection/namespace/currency/root/read/"}
               (perms))))
      (testing "Should be able to grant Root Collection readwrite perms"
        (perms/grant-collection-readwrite-permissions! group-id collection/root-collection)
        (is (= #{"/collection/root/" "/collection/namespace/currency/root/read/"}
               (perms))))
      (testing "Should be able to grant non-default namespace Root Collection readwrite perms"
        (perms/grant-collection-readwrite-permissions! group-id (assoc collection/root-collection :namespace "currency"))
        (is (= #{"/collection/root/" "/collection/namespace/currency/root/read/" "/collection/namespace/currency/root/"}
               (perms))))
      (testing "Should be able to revoke non-default namespace Root Collection perms (shouldn't affect default namespace)"
        (perms/revoke-collection-permissions! group-id (assoc collection/root-collection :namespace "currency"))
        (is (= #{"/collection/root/"}
               (perms)))))))

(deftest grant-revoke-application-permissions-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id}]
    (letfn [(perms []
              (t2/select-fn-set :object :model/Permissions
                                {:where [:and [:= :group_id group-id]
                                         [:like :object "/application/%"]]}))]
      (is (= nil (perms)))
      (doseq [[perm-type perm-path] [[:subscription "/application/subscription/"]
                                     [:monitoring "/application/monitoring/"]
                                     [:setting "/application/setting/"]]]
        (testing (format "Able to grant `%s` permission" (name perm-type))
          (perms/grant-application-permissions! group-id perm-type)
          (is (= (perms)  #{perm-path})))
        (testing (format "Able to revoke `%s` permission" (name perm-type))
          (perms/revoke-application-permissions! group-id perm-type)
          (is (not (= (perms) #{perm-path}))))))))

(deftest maybe-break-out-permission-data-test
  (testing "We can break out a collection permission"
    (are [object m] (= m (select-keys (#'perms/maybe-break-out-permission-data {:object object})
                                      [:collection_id :perm_type :perm_value]))
      "/collection/123/" {:collection_id 123
                          :perm_type :perms/collection-access
                          :perm_value :read-and-write}
      "/collection/123/read/" {:collection_id 123
                               :perm_type :perms/collection-access
                               :perm_value :read}

      ;; We only do this for collection permissions right now.
      "/foo/1234/" {}

      ;; Note that WE DON'T break out the root collection bits at this point. Maybe we will down the road, but we need
      ;; to think about how this works since the collection ID will be `NULL`.
      "/collection/root/" {})))

(deftest cannot-grant-non-subscription-application-permissions-to-tenant-groups
  (mt/with-temp [:model/PermissionsGroup {tenant-group-id :id} {:is_tenant_group true}]
    (testing "Setting and monitoring permissions should still be blocked"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot grant application permission to a tenant group\."
                            (perms/grant-application-permissions! tenant-group-id :setting)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot grant application permission to a tenant group\."
                            (perms/grant-application-permissions! tenant-group-id :monitoring))))
    (testing "Subscription permissions should be allowed"
      (is (nil? (perms/grant-application-permissions! tenant-group-id :subscription))))))

(deftest cannot-grant-collection-permissions-to-tenant-group
  ;; right now, with no tenant collections, you can't grant any permissions on any collection to a tenant group
  (mt/with-temp [:model/PermissionsGroup {tenant-group-id :id} {:is_tenant_group true}
                 :model/Collection {coll-id :id} {:location "/" :type "tenant-collection"}]
    (perms/revoke-collection-permissions! tenant-group-id coll-id)
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tenant groups cannot receive access to non-tenant collections\."
                          (perms/grant-collection-read-permissions! tenant-group-id coll-id)))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tenant groups cannot have write access to any collections\."
                          (perms/grant-collection-readwrite-permissions! tenant-group-id coll-id)))))

(deftest cannot-grant-read-or-write-permissions-on-analytics-to-tenant-group
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/PermissionsGroup {tenant-group-id :id} {:is_tenant_group true}
                 :model/PermissionsGroup {normal-group-id :id} {:is_tenant_group false}]
    (with-redefs [audit.impl/is-collection-id-audit? (constantly true)]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tenant groups cannot receive access to non-tenant collections\."
                            (perms/grant-collection-read-permissions! tenant-group-id coll-id)))
      ;; does not throw - it's not a tenant group
      (perms/grant-collection-read-permissions! normal-group-id coll-id))))

(deftest can-create-use-parent-collection-perms-test
  (testing "can-create? for models using :perms/use-parent-collection-perms checks parent collection write permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection coll {:name "Test Collection"}]
        (testing "can create in collection when user has write permissions"
          (mt/with-temp [:model/PermissionsGroup group {}
                         :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta)
                                                              :group_id (:id group)}]
            (perms/grant-collection-readwrite-permissions! group coll)
            (mt/with-current-user (mt/user->id :rasta)
              (is (true? (mi/can-create? :model/Card {:collection_id (:id coll)}))))))
        (testing "cannot create in collection when user lacks write permissions"
          (mt/with-current-user (mt/user->id :rasta)
            (is (false? (mi/can-create? :model/Card {:collection_id (:id coll)})))))
        (testing "cannot create without collection_id (root collection)"
          (mt/with-current-user (mt/user->id :rasta)
            (is (false? (mi/can-create? :model/Card {})))
            (is (false? (mi/can-create? :model/Card {:collection_id nil})))))))
    (testing "with root collection perms"
      (testing "can create without collection_id (root collection)"
        (mt/with-current-user (mt/user->id :rasta)
          (is (true? (mi/can-create? :model/Card {})))
          (is (true? (mi/can-create? :model/Card {:collection_id nil}))))))))

(deftest ^:parallel can-create-use-parent-collection-perms-dashboard-test
  (testing "can-create? works for dashboards using parent collection permissions"
    (mt/with-temp [:model/Collection coll {:name "Dashboard Collection"}]
      (mt/with-current-user (mt/user->id :crowberto)
        (testing "admin can create dashboard in any collection"
          (is (true? (mi/can-create? :model/Dashboard {:collection_id (:id coll)}))))

        (testing "admin can create dashboard in root collection"
          (is (true? (mi/can-create? :model/Dashboard {}))))))))

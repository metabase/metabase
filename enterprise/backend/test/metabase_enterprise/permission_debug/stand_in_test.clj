(ns metabase-enterprise.permission-debug.stand-in-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group-membership :as perms-group-membership]
   [metabase.request.core :as request]
   [metabase.session.core :as session]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fn [thunk]
                      (mt/with-premium-features #{:advanced-permissions :sandboxes :tenants :audit-app}
                        (thunk))))

(defn- admin-session-key
  "Insert a login session of the admin and return its key."
  []
  (let [session-key (session/generate-session-key)]
    (t2/insert! :model/Session {:id         (session/generate-session-id)
                                :key_hashed (session/hash-session-key session-key)
                                :user_id    (mt/user->id :crowberto)})
    session-key))

(defn- start-group-preview!
  "Start a preview of the group `group-id` with `attributes` from the admin session `session-key`, expecting `status`,
  and return the response."
  ([session-key group-id attributes]
   (start-group-preview! session-key group-id attributes 200))
  ([session-key group-id attributes status]
   (client/client session-key :post status "ee/permission_debug/preview/session"
                  (cond-> {:group_id group-id}
                    attributes (assoc :attributes attributes)))))

(defn- as-preview
  "Call `endpoint` with the preview `token` and no other credential, expecting `status`."
  [token method status endpoint & args]
  (apply client/client method status endpoint {:request-options {:headers {"x-metabase-preview-token" token}}} args))

(defn- stand-in-of
  "The stand-in user of the preview `id`, as `{:id :type :is_active :tenant_id :login_attributes}`."
  [preview-id]
  (t2/select-one [:model/User :id :type :is_active :tenant_id :login_attributes :email]
                 :id (t2/select-one-fn :user_id :model/PermissionPreviewSession :id preview-id)))

(defn- venue-count
  "The number of venues the preview `token` sees."
  [token & filters]
  (ffirst (mt/rows (as-preview token :post 202 "dataset"
                               {:database (mt/id)
                                :type     :query
                                :query    (cond-> {:source-table (mt/id :venues)
                                                   :aggregation  [[:count]]}
                                            (seq filters) (assoc :filter (into [:and] filters)))}))))

(defn- grant-venues! [group]
  (data-perms/set-database-permission! group (mt/id) :perms/view-data :unrestricted)
  (data-perms/set-table-permission! group (mt/id :venues) :perms/create-queries :query-builder))

(deftest group-preview-sees-what-the-group-grants-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/PermissionsGroup {granted-id :id :as granted} {}
                     :model/PermissionsGroup {other-id :id} {}
                     :model/Collection {readable-id :id :as readable} {}
                     :model/Collection {hidden-id :id} {}]
        (grant-venues! granted)
        (perms/grant-collection-read-permissions! granted readable)
        (let [session-key (admin-session-key)
              {:keys [token]} (start-group-preview! session-key granted-id nil)
              other-token     (:token (start-group-preview! session-key other-id nil))]
          (testing "the group's data permission lets the preview run the query"
            (is (= 100 (venue-count token))))
          (testing "the group's collection permission lets the preview read the collection, and no other"
            (is (= readable-id (:id (as-preview token :get 200 (str "collection/" readable-id)))))
            (as-preview token :get 403 (str "collection/" hidden-id)))
          (testing "a group that grants nothing sees nothing the first group grants"
            (as-preview other-token :post 403 "dataset"
                        {:database (mt/id)
                         :type     :query
                         :query    {:source-table (mt/id :venues) :aggregation [[:count]]}})
            (as-preview other-token :get 403 (str "collection/" readable-id))))))))

(deftest picked-value-filters-rows-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-temp [:model/PermissionsGroup {group-id :id :as group} {}
                   :model/Sandbox _ {:group_id             group-id
                                     :table_id             (mt/id :venues)
                                     :card_id              nil
                                     :attribute_remappings {"category" [:dimension [:field (mt/id :venues :category_id) nil]]}}]
      (grant-venues! group)
      (let [session-key (admin-session-key)
            expected    #(ffirst (mt/rows (mt/user-http-request :crowberto :post 202 "dataset"
                                                                {:database (mt/id)
                                                                 :type     :query
                                                                 :query    {:source-table (mt/id :venues)
                                                                            :aggregation  [[:count]]
                                                                            :filter       [:= [:field (mt/id :venues :category_id) nil] %]}})))
            {:keys [token]} (start-group-preview! session-key group-id {"category" "2"})]
        (testing "the picked value reaches the row and column security of the group"
          (is (= (expected 2) (venue-count token)))
          (is (< (expected 2) 100)))))))

(deftest second-start-changes-what-the-first-preview-sees-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-temp [:model/PermissionsGroup {group-id :id :as group} {}
                   :model/Sandbox _ {:group_id             group-id
                                     :table_id             (mt/id :venues)
                                     :card_id              nil
                                     :attribute_remappings {"category" [:dimension [:field (mt/id :venues :category_id) nil]]}}]
      (grant-venues! group)
      (let [session-key   (admin-session-key)
            category-rows #(ffirst (mt/rows (mt/user-http-request :crowberto :post 202 "dataset"
                                                                  {:database (mt/id)
                                                                   :type     :query
                                                                   :query    {:source-table (mt/id :venues)
                                                                              :aggregation  [[:count]]
                                                                              :filter       [:= [:field (mt/id :venues :category_id) nil] %]}})))
            first-preview (start-group-preview! session-key group-id {"category" "2"})]
        (is (= (category-rows 2) (venue-count (:token first-preview))))
        (testing "a second start of the group with another value changes what the first preview sees (last wins)"
          (let [second-preview (start-group-preview! session-key group-id {"category" "3"})]
            (is (not= (category-rows 2) (category-rows 3)))
            (is (= (category-rows 3) (venue-count (:token first-preview))))
            (is (= (category-rows 3) (venue-count (:token second-preview))))))))))

(deftest one-stand-in-per-group-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                 :model/PermissionsGroup {other-group-id :id} {}]
    (let [session-key (admin-session-key)
          first-start (start-group-preview! session-key group-id nil)
          second-start (start-group-preview! session-key group-id nil)
          other-start  (start-group-preview! session-key other-group-id nil)
          stand-in     (stand-in-of (:id first-start))]
      (testing "a group's first preview creates its stand-in, an inactive user of its own type"
        (is (= {:type :permission-preview :is_active false :tenant_id nil}
               (select-keys stand-in [:type :is_active :tenant_id]))))
      (testing "the response names the stand-in as the user the preview runs as"
        (is (= (:id stand-in) (:user_id first-start))))
      (testing "a later preview of the group reuses the stand-in"
        (is (= (:id stand-in) (:id (stand-in-of (:id second-start)))))
        (is (= 1 (t2/count :model/User :email (:email stand-in)))))
      (testing "another group has a stand-in of its own"
        (is (not= (:id stand-in) (:id (stand-in-of (:id other-start))))))
      (testing "the stand-in is in the group and All Users only"
        (is (= #{group-id (:id (perms/all-users-group))}
               (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id (:id stand-in)))))
      (testing "the preview runs as the stand-in, which is no admin"
        (let [current (as-preview (:token first-start) :get 200 "user/current")]
          (is (= (:id stand-in) (:id current)))
          (is (false? (:is_superuser current))))))))

(deftest stand-in-stays-out-of-lists-and-counts-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
    (let [session-key (admin-session-key)
          stand-in-id (:id (stand-in-of (:id (start-group-preview! session-key group-id nil))))]
      (testing "user lists don't show it, even for deactivated users"
        (is (not (contains? (set (map :id (:data (mt/user-http-request :crowberto :get 200 "user" :status "all"))))
                            stand-in-id))))
      (testing "the group's member count doesn't count it"
        (is (= 0 (->> (mt/user-http-request :crowberto :get 200 "permissions/group")
                      (some #(when (= group-id (:id %)) %))
                      :member_count))))
      (testing "billing counts only active personal users"
        (is (not (contains? (set (t2/select-pks-set :model/User :type :personal :is_active true)) stand-in-id)))))))

(deftest stand-in-has-no-personal-collection-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
    (let [session-key (admin-session-key)
          {:keys [id token]} (start-group-preview! session-key group-id nil)
          stand-in-id (:id (stand-in-of id))]
      (testing "creating it makes no personal collection"
        (is (not (t2/exists? :model/Collection :personal_owner_id stand-in-id))))
      (testing "a request as the stand-in, which checks its collection permissions, makes none either"
        (as-preview token :get 200 "collection/root/items")
        (is (nil? (collection/user->personal-collection stand-in-id)))
        (is (not (t2/exists? :model/Collection :personal_owner_id stand-in-id)))))))

(defn- audit-rows-but-starts
  "The number of Activity log rows, not counting the one that each preview's start records."
  []
  (t2/count :model/AuditLog {:where [:not= :topic "permission-preview-start"]}))

(deftest stand-in-writes-no-activity-log-rows-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
    (let [session-key  (admin-session-key)
          rows-before  (audit-rows-but-starts)
          first-start  (start-group-preview! session-key group-id {"category" "2"})
          stand-in-id  (:id (stand-in-of (:id first-start)))]
      (testing "creating it, adding it to the group and writing its attributes record nothing"
        (is (= rows-before (audit-rows-but-starts))))
      (testing "a later start, which writes its attributes again, records nothing either"
        (start-group-preview! session-key group-id {"category" "3"})
        (is (= rows-before (audit-rows-but-starts))))
      (testing "guard: the same memberships of an ordinary user by an admin are recorded"
        (mt/with-temp [:model/User {user-id :id} {}]
          (mt/with-current-user (mt/user->id :crowberto)
            (perms-group-membership/add-users-to-groups! [{:user user-id :group group-id}]))
          (is (< rows-before (audit-rows-but-starts)))
          (is (not= stand-in-id user-id)))))))

(deftest start-writes-the-picked-values-to-the-stand-in-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
    (let [session-key (admin-session-key)
          {:keys [id]} (start-group-preview! session-key group-id {"category" "2" "region" "north"})]
      (testing "the stand-in's login attributes are the picked values"
        (is (= {"category" "2" "region" "north"} (:login_attributes (stand-in-of id)))))
      (testing "they are the attributes the stand-in runs with, merged as for any user"
        (is (= {"category" "2" "region" "north"}
               (request/with-current-user (:id (stand-in-of id))
                 (api/current-user-attributes)))))
      (testing "the next start replaces them, with none when none are picked"
        (start-group-preview! session-key group-id nil)
        (is (= {} (:login_attributes (stand-in-of id))))))))

(deftest tenant-group-stand-in-test
  (mt/with-temporary-setting-values [use-tenants true]
    (mt/with-temp [:model/Tenant {big-tenant-id :id} {:name "Big tenant" :slug "big-tenant"}
                   :model/Tenant {small-tenant-id :id} {:name "Small tenant" :slug "small-tenant"}
                   :model/PermissionsGroup {group-id :id} {:is_tenant_group true}
                   :model/User {first-member :id} {:tenant_id big-tenant-id}
                   :model/User {second-member :id} {:tenant_id big-tenant-id}
                   :model/User {third-member :id} {:tenant_id small-tenant-id}]
      (let [session-key (admin-session-key)]
        (try
          (testing "a tenant group with no member has no tenant to preview in"
            (mt/with-temp [:model/PermissionsGroup {empty-group-id :id} {:is_tenant_group true}]
              (is (= "preview-target-tenant-group-empty"
                     (:error-code (start-group-preview! session-key empty-group-id nil 400))))))
          (perms-group-membership/add-users-to-groups! [{:user first-member :group group-id}])
          (perms-group-membership/add-users-to-groups! [{:user second-member :group group-id}])
          (perms-group-membership/add-users-to-groups! [{:user third-member :group group-id}])
          (let [{:keys [id]} (start-group-preview! session-key group-id nil)
                stand-in     (stand-in-of id)]
            (testing "the stand-in joins its members' most common tenant"
              (is (= big-tenant-id (:tenant_id stand-in))))
            (testing "and is in the group and All tenant users only"
              (is (= #{group-id (:id (perms/all-external-users-group))}
                     (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id (:id stand-in)))))
            (testing "when the members change, the reused stand-in follows the most common tenant"
              (perms-group-membership/remove-users-from-groups! [first-member] [group-id])
              (perms-group-membership/remove-users-from-groups! [second-member] [group-id])
              (let [{second-id :id} (start-group-preview! session-key group-id nil)]
                (is (= (:id stand-in) (:id (stand-in-of second-id))))
                (is (= small-tenant-id (:tenant_id (stand-in-of second-id)))))))
          ;; a tenant can't be deleted while its stand-in belongs to it, which the temp tenants do first
          (finally
            (t2/delete! :model/User :type :permission-preview)))))))

(deftest group-preview-refusals-test
  (let [session-key (admin-session-key)
        error-code  (fn [body status]
                      (:error-code (client/client session-key :post status "ee/permission_debug/preview/session" body)))]
    (testing "the Administrators group is refused: its stand-in would become an admin"
      (is (= "preview-target-admin"
             (error-code {:group_id (:id (perms/admin-group))} 400)))
      (is (not (t2/exists? :model/User :type :permission-preview :is_superuser true))))
    (testing "All tenant users is refused: a tenant is previewed through its users"
      (is (= "preview-target-all-tenant-users"
             (error-code {:group_id (:id (perms/all-external-users-group))} 400))))
    (testing "a tenant group is refused while tenants are off"
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {:is_tenant_group true}]
        (is (= "preview-target-tenant-unavailable" (error-code {:group_id group-id} 400)))))
    (testing "a group that doesn't exist is a 404"
      (error-code {:group_id Integer/MAX_VALUE} 404))
    (testing "a body needs exactly one target"
      (is (= "preview-target-invalid" (error-code {} 400)))
      (is (= "preview-target-invalid" (error-code {:group_id 1 :user_id 1} 400))))
    (testing "attribute values go with a group only"
      (is (= "preview-attributes-need-group"
             (error-code {:user_id (mt/user->id :rasta) :attributes {"a" "b"}} 400))))
    (testing "attribute keys of a tenant (starting with @) can't be picked"
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
        (error-code {:group_id group-id :attributes {"@tenant.slug" "x"}} 400)))
    (testing "a stand-in can't be previewed as a user, so no one can preview it without picking values"
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
        (let [stand-in-id (:id (stand-in-of (:id (start-group-preview! session-key group-id nil))))]
          (is (= "preview-target-not-a-person" (error-code {:user_id stand-in-id} 400))))))
    (testing "a non-admin can't start a group preview"
      (mt/user-http-request :rasta :post 403 "ee/permission_debug/preview/session"
                            {:group_id (:id (perms/all-users-group))}))))

(deftest stand-in-expires-with-its-preview-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
    (let [session-key (admin-session-key)
          {:keys [id token]} (start-group-preview! session-key group-id nil)]
      (testing "ending the preview refuses its token, and keeps the stand-in for the group's next preview"
        (client/client session-key :delete 204 (str "ee/permission_debug/preview/session/" id))
        (as-preview token :get 401 "user/current")
        (is (pos-int? (:id (stand-in-of (:id (start-group-preview! session-key group-id nil))))))))))

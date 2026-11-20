(ns metabase-enterprise.permission-debug.preview-test
  "The whole-app preview: `X-Metabase-Preview-As` on a superuser's browser session rebinds the request, read-only."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.permission-debug.preview-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.permission-debug.preview :as preview]
   [metabase-enterprise.test :as met]
   [metabase.api-keys.core :as api-key]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.secret :as u.secret]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- browser-session
  "Request options for `username`'s browser session (the `metabase.SESSION` cookie), previewing `preview-as-user-id`."
  [username preview-as-user-id]
  {:request-options {:cookies {"metabase.SESSION" {:value (test.users/username->token username)}}
                     :headers {"x-metabase-preview-as" (str preview-as-user-id)}}})

(defn- current-user-id
  [client-options]
  (:id (mt/client :get 200 "user/current" client-options)))

(deftest preview-binds-the-whole-request-test
  (mt/with-premium-features #{:advanced-permissions}
    (testing "an admin's browser session previewing a user is bound to that user"
      (is (= (mt/user->id :rasta)
             (current-user-id (browser-session :crowberto (mt/user->id :rasta))))))
    (testing "the same session without the header is the admin"
      (is (= (mt/user->id :crowberto)
             (current-user-id {:request-options {:cookies {"metabase.SESSION" {:value (test.users/username->token :crowberto)}}}}))))))

(deftest preview-sandboxed-user-gets-filtered-rows-test
  (testing "a saved question run in preview, through the streaming endpoint, applies the previewed user's sandbox"
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat ["variable" [:field (mt/id :venues :category_id) nil]]}}}
                      :attributes {"cat" 50}}
      (mt/with-additional-premium-features #{:advanced-permissions :audit-app}
        (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
          (let [query-url (format "card/%d/query" (:id card))]
            (testing "the admin's own run isn't sandboxed"
              (is (= [[100]]
                     (mt/rows (mt/user-http-request :crowberto :post 202 query-url)))))
            (testing "the admin previewing the sandboxed user gets that user's rows"
              (is (= [[10]]
                     (mt/rows (mt/client :post 202 query-url (browser-session :crowberto (mt/user->id :rasta)))))))
            (testing "the query run is in the audit log, with the admin as the actor and the previewed user as the target"
              (is (= {:topic    :permissions-preview
                      :user_id  (mt/user->id :crowberto)
                      :model    "User"
                      :model_id (mt/user->id :rasta)
                      :details  {:action "query"
                                 :uri    (str "/api/" query-url)}}
                     (mt/latest-audit-log-entry :permissions-preview))))))))))

(deftest attribute-use-names-its-table-test
  (testing "a sandbox's use of an attribute names the table it filters, for the chip's \"Used by row and column security on Venues\""
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat ["variable" [:field (mt/id :venues :category_id) nil]]}}}
                      :attributes {"cat" 50}}
      (mt/with-additional-premium-features #{:advanced-permissions}
        (is (=? [{:attribute "cat"
                  :uses      [{:kind "sandbox" :label "Venues" :table_id (mt/id :venues)}]}]
                (mt/user-http-request :crowberto :get 200 "ee/permission_debug/preview/attributes"
                                      :user_id (mt/user->id :rasta))))))))

(deftest preview-refuses-writes-test
  (mt/with-premium-features #{:advanced-permissions}
    (mt/with-temp [:model/Card card {:name "Before"}]
      (testing "an update in preview is refused before it reaches the endpoint"
        (is (= {:message    "You're previewing another user, so changes aren't allowed."
                :error_code "permission-preview-read-only"}
               (mt/client :put 403 (format "card/%d" (:id card)) (browser-session :crowberto (mt/user->id :rasta))
                          {:name "After"})))
        (is (= "Before" (t2/select-one-fn :name :model/Card :id (:id card)))))
      (testing "a POST that isn't on the read-only list is refused"
        (is (= {:message    "You're previewing another user, so changes aren't allowed."
                :error_code "permission-preview-read-only"}
               (mt/client :post 403 "collection" (browser-session :crowberto (mt/user->id :rasta))
                          {:name "Made in preview"})))
        (is (not (t2/exists? :model/Collection :name "Made in preview"))))
      (testing "a DELETE (logging out) is refused"
        (mt/client :delete 403 "session" (browser-session :crowberto (mt/user->id :rasta)))))))

(deftest preview-fails-closed-test
  (mt/with-premium-features #{:advanced-permissions}
    (testing "previewing an admin is refused, rather than silently running as the admin"
      (is (= {:message "This user can't be previewed: only active users who aren't admins can."}
             (mt/client :get 403 "user/current" (browser-session :crowberto (mt/user->id :crowberto))))))
    (testing "previewing an inactive user is refused"
      (mt/with-temp [:model/User {inactive-id :id} {:is_active false}]
        (mt/client :get 403 "user/current" (browser-session :crowberto inactive-id))))
    (testing "a header that isn't a user id is refused"
      (mt/client :get 403 "user/current" (browser-session :crowberto "rasta")))))

(deftest preview-header-ignored-for-other-credentials-test
  (mt/with-premium-features #{:advanced-permissions}
    (testing "a non-admin's preview header is ignored: the request runs as the non-admin"
      (is (= (mt/user->id :rasta)
             (current-user-id (browser-session :rasta (mt/user->id :lucky))))))
    (testing "an admin's header session (as the SDK sends it) ignores the preview header"
      (is (= (mt/user->id :crowberto)
             (current-user-id {:request-options {:headers {"x-metabase-session"   (test.users/username->token :crowberto)
                                                           "x-metabase-preview-as" (str (mt/user->id :rasta))}}}))))
    (testing "an admin API key ignores the preview header"
      (mt/with-temp [:model/ApiKey _ {:name                  "A superuser API Key"
                                      :user_id               (mt/user->id :crowberto)
                                      :creator_id            (mt/user->id :crowberto)
                                      :updated_by_id         (mt/user->id :crowberto)
                                      ::api-key/unhashed-key (u.secret/secret "mb_previewtest")}]
        (is (= (mt/user->id :crowberto)
               (current-user-id {:request-options {:headers {"x-api-key"             "mb_previewtest"
                                                             "x-metabase-preview-as" (str (mt/user->id :rasta))}}}))))))
  (testing "without the advanced permissions feature the header is ignored"
    (mt/with-premium-features #{}
      (is (= (mt/user->id :crowberto)
             (current-user-id (browser-session :crowberto (mt/user->id :rasta))))))))

(deftest start-preview-test
  (mt/with-premium-features #{:advanced-permissions :audit-app}
    (testing "a user principal is that user, and the start is audited under the admin"
      (let [{:keys [preview_id] :as started} (mt/user-http-request :crowberto :post 200 "ee/permission_debug/preview/start"
                                                                   {:principal_type "user" :principal_id (mt/user->id :rasta)})]
        (is (= {:user_id        (mt/user->id :rasta)
                :user_name      "Rasta Toucan"
                :principal_name "Rasta Toucan"
                :attributes     {}
                :preview_id     preview_id}
               started))
        (is (string? preview_id))
        (is (= {:topic    :permissions-preview
                :user_id  (mt/user->id :crowberto)
                :model    "User"
                :model_id (mt/user->id :rasta)
                :details  {:action         "start"
                           :principal-type "user"
                           :principal-id   (mt/user->id :rasta)
                           :preview-id     preview_id
                           :attributes     {}}}
               (mt/latest-audit-log-entry :permissions-preview)))))
    (testing "a group previews as its hidden preview user, created once, in that group and All Users only"
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Preview group"}
                     :model/PermissionsGroupMembership _ {:group_id group-id :user_id (mt/user->id :lucky)}]
        (try
          (let [start   #(mt/user-http-request :crowberto :post 200 "ee/permission_debug/preview/start"
                                               {:principal_type "group" :principal_id group-id})
                user-id (:user_id (start))]
            (is (not= (mt/user->id :lucky) user-id))
            (is (= user-id (:user_id (start))))
            (is (=? {:type :permission-preview :is_active false}
                    (t2/select-one [:model/User :type :is_active] :id user-id)))
            (is (= #{(:id (perms/all-users-group)) group-id}
                   (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id)))
            (testing "and the request binds to it"
              (is (= user-id (current-user-id (browser-session :crowberto user-id))))))
          (finally
            (t2/delete! :model/User :type "permission-preview")))))
    (testing "a group's attribute values default to the most common member value, and can be picked"
      (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat ["variable" [:field (mt/id :venues :category_id) nil]]}}}
                        :attributes {"cat" "50"}}
        (try
          (let [group-id (t2/select-one-fn :group_id :model/Sandbox :table_id (mt/id :venues))
                start    #(mt/user-http-request :crowberto :post 200 "ee/permission_debug/preview/start"
                                                (merge {:principal_type "group" :principal_id group-id} %))]
            (is (=? [{:attribute     "cat"
                      :member_values [{:value "50" :count 1}]
                      :default       "50"}]
                    (mt/user-http-request :crowberto :get 200 "ee/permission_debug/preview/attributes"
                                          :group-id group-id)))
            (is (= {:cat "50"} (:attributes (start {}))))
            (is (= {:cat "7"} (:attributes (start {:attributes {"cat" "7"}}))))
            (is (= {} (:attributes (start {:attributes {"cat" ""}})))))
          (finally
            (t2/delete! :model/User :type "permission-preview")))))
    (testing "a tenant user's picked values replace theirs in this admin's preview only"
      (mt/with-additional-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true]
          (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Picked tenant" :slug "picked" :attributes {"cat" "1"}}
                         :model/User {user-id :id} {:tenant_id tenant-id}]
            (let [started (mt/user-http-request :crowberto :post 200 "ee/permission_debug/preview/start"
                                                {:principal_type "user"
                                                 :principal_id   user-id
                                                 :attributes     {"cat" "7"}})]
              (is (= user-id (:user_id started)))
              (is (= {:cat "7"} (:attributes started)))
              (is (= {"cat" "7"} (preview/attribute-overrides-of (mt/user->id :crowberto) user-id (:preview_id started))))
              (is (nil? (preview/attribute-overrides-of (mt/user->id :rasta) user-id (:preview_id started))))
              (is (= {"cat" "1"} (t2/select-one-fn :attributes :model/Tenant :id tenant-id))))))))
    (testing "a tenant can't be previewed as a principal, and no stand-in user is made for one"
      (mt/with-additional-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true]
          (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Refused tenant" :slug "refused"}]
            (is (some? (mt/user-http-request :crowberto :post 400 "ee/permission_debug/preview/start"
                                             {:principal_type "tenant" :principal_id tenant-id})))
            (is (not (t2/exists? :model/User :type "permission-preview")))))))
    (testing "a tenant group's stand-in belongs to its members' most common tenant"
      (mt/with-additional-premium-features #{:tenants}
        (mt/with-temporary-setting-values [use-tenants true]
          (mt/with-temp [:model/Tenant {common-tenant-id :id} {:name "Common tenant" :slug "common"}
                         :model/Tenant {other-tenant-id :id} {:name "Other tenant" :slug "other"}
                         :model/PermissionsGroup {group-id :id} {:name "Tenant preview group" :is_tenant_group true}
                         :model/User {first-member-id :id} {:tenant_id common-tenant-id}
                         :model/User {second-member-id :id} {:tenant_id common-tenant-id}
                         :model/User {third-member-id :id} {:tenant_id other-tenant-id}]
            (doseq [member-id [first-member-id second-member-id third-member-id]]
              (perms/add-user-to-group! member-id group-id))
            (try
              (let [{:keys [user_id]} (mt/user-http-request :crowberto :post 200 "ee/permission_debug/preview/start"
                                                            {:principal_type "group" :principal_id group-id})]
                (is (= common-tenant-id (t2/select-one-fn :tenant_id :model/User :id user_id))))
              (finally
                (t2/delete! :model/User :type "permission-preview")))))))
    (testing "an admin can't be previewed"
      (mt/user-http-request :crowberto :post 400 "ee/permission_debug/preview/start"
                            {:principal_type "user" :principal_id (mt/user->id :crowberto)}))
    (testing "a non-admin can't start a preview"
      (mt/user-http-request :rasta :post 403 "ee/permission_debug/preview/start"
                            {:principal_type "user" :principal_id (mt/user->id :lucky)}))))

(deftest unsaved-edits-preview-test
  (mt/with-premium-features #{:advanced-permissions :audit-app}
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Unsaved edits group"}
                   :model/PermissionsGroupMembership _ {:group_id group-id :user_id (mt/user->id :rasta)}]
      (mt/with-no-data-perms-for-all-users!
        (perms/set-database-permission! group-id (mt/id) :perms/view-data :blocked)
        (perms/set-database-permission! group-id (mt/id) :perms/create-queries :no)
        (let [table-id    (mt/id :venues)
              edit        {:group_id    group-id
                           :group_name  "Unsaved edits group"
                           :database_id (mt/id)
                           :label       "test-data · Venues"
                           :permission  "View data"
                           :before      "Blocked"
                           :after       "Can view"}
              saved-graph #(t2/select-fn-set (juxt :perm_type :perm_value) :model/DataPermissions
                                             :group_id group-id :table_id table-id)
              before      (saved-graph)
              edits-id    (:unsaved_edits_id
                           (mt/user-http-request :crowberto :post 200 "ee/permission_debug/preview/unsaved-edits"
                                                 {:groups {group-id {(mt/id) {:view-data      "unrestricted"
                                                                              :create-queries "query-builder"}}}
                                                  :edits  [edit]}))
              venues      (fn [& query-params]
                            (->> (apply mt/user-http-request :crowberto :get 200 "ee/permission_debug/preview/data"
                                        :principal-type "user" :principal-id (mt/user->id :rasta) query-params)
                                 :databases
                                 (filter #(= (mt/id) (:id %)))
                                 first
                                 :tables
                                 (filter #(= table-id (:id %)))
                                 first))]
          (testing "the edits list comes back as it was sent"
            (is (= {:edits [edit]}
                   (mt/user-http-request :crowberto :get 200 (str "ee/permission_debug/preview/unsaved-edits/" edits-id)))))
          (testing "the data preview reads the unsaved edits only when asked to"
            (let [group-value (fn [table]
                                (->> (get-in table [:create_queries :groups])
                                     (filter #(= group-id (:group_id %)))
                                     first
                                     :value))]
              (is (= "no" (group-value (venues))))
              (is (= "query-builder" (group-value (venues :unsaved-edits-id edits-id))))))
          (testing "a preview started without the edits refuses the person's query"
            (mt/user-http-request :crowberto :post 200 "ee/permission_debug/preview/start"
                                  {:principal_type "user" :principal_id (mt/user->id :rasta)})
            (mt/client :post 403 "dataset" (browser-session :crowberto (mt/user->id :rasta))
                       (mt/mbql-query venues {:aggregation [[:count]]})))
          (testing "a preview started with the edits runs the person's queries with them"
            (mt/user-http-request :crowberto :post 200 "ee/permission_debug/preview/start"
                                  {:principal_type "user" :principal_id (mt/user->id :rasta) :unsaved_edits_id edits-id})
            (is (= [[100]]
                   (mt/rows (mt/client :post 202 "dataset" (browser-session :crowberto (mt/user->id :rasta))
                                       (mt/mbql-query venues {:aggregation [[:count]]}))))))
          (testing "nothing is saved"
            (is (= before (saved-graph))))
          (testing "another admin can't use them"
            (mt/with-temp [:model/User {other-admin :id} {:is_superuser true}]
              (mt/user-http-request other-admin :get 404 (str "ee/permission_debug/preview/unsaved-edits/" edits-id))))
          (testing "an unknown id is refused"
            (mt/user-http-request :crowberto :post 400 "ee/permission_debug/preview/start"
                                  {:principal_type "user" :principal_id (mt/user->id :rasta) :unsaved_edits_id "gone"})))))))

(ns metabase.users-rest.api-test
  "Tests for /api/user endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase.api.response :as api.response]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.util :as perms-util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.users-rest.api :as api.user]
   [metabase.users.models.user :as user]
   [metabase.users.models.user-test :as user-test]
   [metabase.users.settings :as users.settings]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.string :as string]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures
  :once
  (fixtures/initialize :test-users-personal-collections))

(def ^:private user-defaults
  (delay
    (dissoc
     (merge
      (mt/object-defaults :model/User)
      {:date_joined true
       :id true
       :is_active true
       :last_login false
       :sso_source nil
       :login_attributes nil
       :updated_at true
       :locale nil
       :tenant_id false})
     :type)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |        Fetching Users -- GET /api/user, GET /api/user/current, GET /api/user/:id, GET /api/user/recipients     |
;;; +----------------------------------------------------------------------------------------------------------------+

;; ## /api/user/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint
(deftest user-list-authentication-test
  (testing "authentication"
    (testing "GET /api/user"
      (is (= (get api.response/response-unauthentic :body)
             (client/client :get 401 "user"))))
    (testing "GET /api/user/current"
      (is (= (get api.response/response-unauthentic :body)
             (client/client :get 401 "user/current"))))))

(deftest user-list-test
  (testing "GET /api/user"
    (testing "Check that admins can get a list of all active Users"
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [result (->> ((mt/user-http-request :crowberto :get 200 "user") :data)
                          (filter mt/test-user?))]
          ;; since this is an admin, all keys are available on each user
          (is (= (set
                  (concat
                   user/admin-or-self-visible-columns
                   [:common_name :group_ids :personal_collection_id :tenant_collection_id]))
                 (->> result first keys set)))
          ;; just make sure all users are there by checking the emails
          (is (= #{"crowberto@metabase.com"
                   "lucky@metabase.com"
                   "rasta@metabase.com"}
                 (->> result (map :email) set))))
        (testing "with a query"
          (is (=? [{:email "lucky@metabase.com"}]
                  (->> (mt/user-http-request :crowberto :get 200 "user" :query "lUck")
                       :data
                       (filter mt/test-user?)))))))
    (testing "Check that non-admins cannot get a list of all active Users"
      (mt/with-non-admin-groups-no-root-collection-perms
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :lucky :get 403 "user")))
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :lucky :get 403 "user" :query "rasta")))))))

(deftest user-list-for-group-managers-test
  (testing "Group Managers"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp
        [:model/PermissionsGroup {group-id1 :id} {:name "Cool Friends"}
         :model/PermissionsGroup {group-id2 :id} {:name "Rad Pals"}
         :model/PermissionsGroup {group-id3 :id} {:name "Good Folks"}
         :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id1 :is_group_manager true}
         :model/PermissionsGroupMembership _ {:user_id (mt/user->id :lucky) :group_id group-id1 :is_group_manager false}
         :model/PermissionsGroupMembership _ {:user_id (mt/user->id :crowberto) :group_id group-id2 :is_group_manager true}
         :model/PermissionsGroupMembership _ {:user_id (mt/user->id :lucky) :group_id group-id2 :is_group_manager true}
         :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id3 :is_group_manager false}
         :model/PermissionsGroupMembership _ {:user_id (mt/user->id :lucky) :group_id group-id3 :is_group_manager true}]
        (testing "admin can get users from any group, even when they are also marked as a group manager"
          (is (= #{"lucky@metabase.com"
                   "rasta@metabase.com"}
                 (->> ((mt/user-http-request :crowberto :get 200 "user" :group_id group-id1) :data)
                      (filter mt/test-user?)
                      (map :email)
                      set)))
          (is (= #{"lucky@metabase.com"
                   "crowberto@metabase.com"}
                 (->> ((mt/user-http-request :crowberto :get 200 "user" :group_id group-id2) :data)
                      (filter mt/test-user?)
                      (map :email)
                      set)))
          (is (= #{"crowberto@metabase.com"
                   "rasta@metabase.com"
                   "lucky@metabase.com"}
                 (->> ((mt/user-http-request :crowberto :get 200 "user") :data)
                      (filter mt/test-user?)
                      (map :email)
                      set))))
        (testing "member but non-manager cannot get users"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :lucky :get 403 "user" :group_id group-id1))))
        (testing "manager of a different group cannot get users from groups they're not a member of"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "user" :group_id group-id2))))
        (if config/ee-available?
          ;; Group management is an EE feature
          (do
            (testing "manager can get all users in their group"
              (is (= #{"lucky@metabase.com"
                       "rasta@metabase.com"}
                     (->> ((mt/user-http-request :rasta :get 200 "user" :group_id group-id1) :data)
                          (filter mt/test-user?)
                          (map :email)
                          set))))
            (testing "manager can't get all users in another group"
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :rasta :get 403 "user" :group_id group-id2))))
            (testing "manager can get all users"
              (is (= #{"lucky@metabase.com"
                       "rasta@metabase.com"
                       "crowberto@metabase.com"}
                     (->> ((mt/user-http-request :rasta :get 200 "user") :data)
                          (filter mt/test-user?)
                          (map :email)
                          set)))))
          ;; In OSS, non-admins have no way to see users, because group management is an EE feature
          (testing "in OSS, non-admins have no way to get users"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 "user" :group_id group-id1)))
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 "user")))
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :lucky :get 403 "user")))))))))

(defn- group-ids->sets [users]
  (for [user users]
    (update user :group_ids set)))

(defn- group-or-ids->user-group-memberships
  [group-or-ids]
  (map (fn [group-or-id] {:id (u/the-id group-or-id)}) group-or-ids))

(deftest user-recipients-list-oss-test
  (testing "GET /api/user/recipients without :email-restrict-recipients feature"
    (mt/with-premium-features #{}
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [crowberto "crowberto@metabase.com"
              lucky "lucky@metabase.com"
              rasta "rasta@metabase.com"]
          (testing "return all users for anyone"
            (is (= [crowberto lucky rasta]
                   (->> (:data (mt/user-http-request :rasta :get 200 "user/recipients"))
                        (filter mt/test-user?)
                        (map :email))))
            (is (= [crowberto lucky rasta]
                   (->> (:data (mt/user-http-request :rasta :get 200 "user/recipients"))
                        (filter mt/test-user?)
                        (map :email)))))
          (testing "not affected by the visibility setting"
            (doseq [visibility-value [:all :group :none]]
              (mt/with-temporary-setting-values [user-visibility visibility-value]
                (testing "`user-visibility` setting returns the default value"
                  (is (= :all (users.settings/user-visibility))))

                (testing "return all user by default"
                  (is (= [crowberto lucky rasta]
                         (->> (:data (mt/user-http-request :rasta :get 200 "user/recipients"))
                              (filter mt/test-user?)
                              (map :email)))))))))))))

(deftest user-recipients-list-ee-test
  (mt/with-premium-features #{:email-restrict-recipients}
    (testing "GET /api/user/recipients"
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [crowberto "crowberto@metabase.com"
              lucky "lucky@metabase.com"
              rasta "rasta@metabase.com"]
          (testing "Returns all users when user-visibility is all users"
            (mt/with-temporary-setting-values [user-visibility :all]
              (is (= [crowberto lucky rasta]
                     (->> ((mt/user-http-request :rasta :get 200 "user/recipients") :data)
                          (filter mt/test-user?)
                          (map :email))))))

          (testing "Returns all users when admin"
            (mt/with-temporary-setting-values [user-visibility "none"]
              (is (= [crowberto lucky rasta]
                     (->> ((mt/user-http-request :crowberto :get 200 "user/recipients") :data)
                          (filter mt/test-user?)
                          (map :email))))))

          (testing "Returns users in the group when user-visibility is same group"
            (mt/with-temporary-setting-values [user-visibility :group]
              (mt/with-temp
                [:model/PermissionsGroup {group-id1 :id} {:name "Test recipient group1"}
                 :model/PermissionsGroup {group-id2 :id} {:name "Test recipient group2"}
                 :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id1}
                 :model/PermissionsGroupMembership _ {:user_id (mt/user->id :crowberto) :group_id group-id1}
                 :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id2}
                 :model/PermissionsGroupMembership _ {:user_id (mt/user->id :crowberto) :group_id group-id2}]
                (is (= [crowberto rasta]
                       (->> (:data (mt/user-http-request :rasta :get 200 "user/recipients"))
                            (map :email))))

                (testing "But returns self if the user is sandboxed"
                  (with-redefs [perms-util/sandboxed-or-impersonated-user? (constantly true)]
                    (is (= [rasta]
                           (->> ((mt/user-http-request :rasta :get 200 "user/recipients") :data)
                                (map :email)))))))))

          (testing "Returns only self when user-visibility is none"
            (mt/with-temporary-setting-values [user-visibility :none]
              (is (= [rasta]
                     (->> ((mt/user-http-request :rasta :get 200 "user/recipients") :data)
                          (filter mt/test-user?)
                          (map :email)))))))))))

(deftest ^:parallel admin-user-list-test
  (testing "GET /api/user"
    (testing "Check that admins can get a list of active Users. Should include additional admin Fields"
      (is (=? [{:email "crowberto@metabase.com"
                :first_name "Crowberto"
                :last_name "Corv"
                :is_superuser true
                :group_ids #{(u/the-id (perms-group/all-users))
                             (u/the-id (perms-group/admin))}
                :personal_collection_id pos-int?
                :common_name "Crowberto Corv"}
               {:email "lucky@metabase.com"
                :first_name "Lucky"
                :last_name "Pigeon"
                :group_ids #{(u/the-id (perms-group/all-users))}
                :personal_collection_id pos-int?
                :common_name "Lucky Pigeon"}
               {:email "rasta@metabase.com"
                :first_name "Rasta"
                :last_name "Toucan"
                :group_ids #{(u/the-id (perms-group/all-users))}
                :personal_collection_id pos-int?
                :common_name "Rasta Toucan"}]
              (->> ((mt/user-http-request :crowberto :get 200 "user") :data)
                   (filter mt/test-user?)
                   group-ids->sets))))))

(deftest ^:parallel admin-user-list-test-2
  (testing "GET /api/user"
    (testing "Get list of users with a group id"
      (is (=? [{:email "crowberto@metabase.com"
                :first_name "Crowberto"
                :last_name "Corv"
                :is_superuser true
                :group_ids #{(u/the-id (perms-group/all-users))
                             (u/the-id (perms-group/admin))}
                :personal_collection_id pos-int?
                :common_name "Crowberto Corv"}]
              (->> ((mt/user-http-request :crowberto :get 200 "user" :group_id (u/the-id (perms-group/admin))) :data)
                   (filter mt/test-user?)
                   group-ids->sets))))))

(deftest ^:parallel user-list-include-inactive-test
  (testing "GET /api/user?include_deactivated=true"
    (testing "Non-admins should *not* be allowed to pass in include_deactivated or status"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "user", :include_deactivated true)))
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "user", :status "all"))))))

(deftest ^:parallel user-list-include-inactive-test-2
  (testing "GET /api/user?include_deactivated=true"
    (testing "Pagination gets the total users _in query_, not including the Internal User"
      (is (=? {:total (t2/count :model/User :type "personal")}
              (mt/user-http-request :crowberto :get 200 "user" :status "all"))))))

(deftest ^:parallel user-list-include-inactive-test-3
  (testing "GET /api/user?include_deactivated=true"
    (testing "for admins, it should include those inactive users as we'd expect"
      (is (=? [{:email "crowberto@metabase.com"
                :first_name "Crowberto"
                :last_name "Corv"
                :is_superuser true
                :group_ids #{(u/the-id (perms-group/all-users))
                             (u/the-id (perms-group/admin))}
                :personal_collection_id pos-int?
                :common_name "Crowberto Corv"}
               {:email "lucky@metabase.com"
                :first_name "Lucky"
                :last_name "Pigeon"
                :group_ids #{(u/the-id (perms-group/all-users))}
                :personal_collection_id pos-int?
                :common_name "Lucky Pigeon"}
               {:email "rasta@metabase.com"
                :first_name "Rasta"
                :last_name "Toucan"
                :group_ids #{(u/the-id (perms-group/all-users))}
                :personal_collection_id pos-int?
                :common_name "Rasta Toucan"}
               {:email "trashbird@metabase.com"
                :first_name "Trash"
                :last_name "Bird"
                :is_active false
                :group_ids #{(u/the-id (perms-group/all-users))}
                :personal_collection_id pos-int?
                :common_name "Trash Bird"}]
              (->> ((mt/user-http-request :crowberto :get 200 "user", :include_deactivated true) :data)
                   (filter mt/test-user?)
                   group-ids->sets))))))

(deftest ^:parallel user-list-include-inactive-test-3b
  (testing "GET /api/user?include_deactivated=true"
    (testing "for admins, it should include those inactive users as we'd expect"
      (is (=? [{:email "crowberto@metabase.com"
                :first_name "Crowberto"
                :last_name "Corv"
                :is_superuser true
                :group_ids #{(u/the-id (perms-group/all-users))
                             (u/the-id (perms-group/admin))}
                :personal_collection_id pos-int?
                :common_name "Crowberto Corv"}
               {:email "lucky@metabase.com"
                :first_name "Lucky"
                :last_name "Pigeon"
                :group_ids #{(u/the-id (perms-group/all-users))}
                :personal_collection_id pos-int?
                :common_name "Lucky Pigeon"}
               {:email "rasta@metabase.com"
                :first_name "Rasta"
                :last_name "Toucan"
                :group_ids #{(u/the-id (perms-group/all-users))}
                :personal_collection_id pos-int?
                :common_name "Rasta Toucan"}
               {:email "trashbird@metabase.com"
                :first_name "Trash"
                :last_name "Bird"
                :is_active false
                :group_ids #{(u/the-id (perms-group/all-users))}
                :personal_collection_id pos-int?
                :common_name "Trash Bird"}]
              (->> ((mt/user-http-request :crowberto :get 200 "user", :status "all") :data)
                   (filter mt/test-user?)
                   group-ids->sets))))))

(deftest ^:parallel user-list-include-inactive-test-4
  (testing "GET /api/user?include_deactivated=false should return only active users"
    (is (= #{"crowberto@metabase.com"
             "lucky@metabase.com"
             "rasta@metabase.com"}
           (->> (mt/user-http-request :crowberto :get 200 "user", :include_deactivated false)
                :data
                (filter mt/test-user?)
                (map :email)
                set)))))

(deftest ^:parallel user-list-limit-test
  (testing "GET /api/user?limit=1&offset=1"
    (testing "Limit and offset pagination have defaults"
      (is (= (mt/user-http-request :crowberto :get 200 "user" :limit "1" :offset "0")
             (mt/user-http-request :crowberto :get 200 "user" :limit "1")))
      (is (= (mt/user-http-request :crowberto :get 200 "user" :limit "50" :offset "1")
             (mt/user-http-request :crowberto :get 200 "user" :offset "1"))))))

(deftest ^:parallel user-list-limit-test-2
  (testing "GET /api/user?limit=1&offset=1"
    (testing "Limit and offset pagination get the total"
      (is (= (t2/count :model/User :is_active true :type "personal")
             ((mt/user-http-request :crowberto :get 200 "user" :offset "1" :limit "1") :total))))))

(deftest ^:parallel user-list-limit-test-3
  (testing "GET /api/user?limit=1&offset=1"
    (testing "Limit and offset pagination works for user list"
      (let [first-three-users (:data (mt/user-http-request :crowberto :get 200 "user" :limit "3", :offset "0"))]
        (is (= 3
               (count first-three-users)))
        (is (= (drop 1 first-three-users)
               (:data (mt/user-http-request :crowberto :get 200 "user" :limit "2", :offset "1") :data)))))))

(deftest ^:parallel get-current-user-test
  (testing "GET /api/user/current"
    (testing "check that fetching current user will return extra fields like `is_active`"
      (mt/with-temp [:model/LoginHistory _ {:user_id (mt/user->id :rasta)
                                            :device_id (str (random-uuid))
                                            :timestamp #t "2021-03-18T19:52:41.808482Z"}
                     :model/Card _ {:name "card1" :display "table" :creator_id (mt/user->id :rasta)}]
        (is (=? {:email "rasta@metabase.com"
                 :first_name "Rasta"
                 :last_name "Toucan"
                 :common_name "Rasta Toucan"
                 :first_login "2021-03-18T19:52:41.808482Z"
                 :group_ids [(u/the-id (perms-group/all-users))]
                 :personal_collection_id pos-int?
                 :custom_homepage nil
                 :is_installer (= 1 (mt/user->id :rasta))
                 :has_invited_second_user (= 1 (mt/user->id :rasta))}
                (mt/user-http-request :rasta :get 200 "user/current")))))))

(deftest ^:parallel get-current-user-test-2
  (testing "GET /api/user/current"
    (testing "check that `has_question_and_dashboard` is `true`."
      (mt/with-temp [:model/Dashboard _ {:name "dash1" :creator_id (mt/user->id :rasta)}
                     :model/Card _ {:name "card1" :display "table" :creator_id (mt/user->id :rasta)}
                     :model/Card _ {:name "model" :creator_id (mt/user->id :rasta) :type "model"}]
        (is (=? {:email "rasta@metabase.com"
                 :first_name "Rasta"
                 :last_name "Toucan"
                 :common_name "Rasta Toucan"
                 :group_ids [(u/the-id (perms-group/all-users))]
                 :personal_collection_id pos-int?
                 :has_question_and_dashboard true
                 :has_model true
                 :custom_homepage nil
                 :is_installer (= 1 (mt/user->id :rasta))
                 :has_invited_second_user (= 1 (mt/user->id :rasta))}
                (mt/user-http-request :rasta :get 200 "user/current")))))))

(deftest get-current-user-test-3
  (testing "GET /api/user/current"
    (testing "on a fresh instance, `has_question_and_dashboard` is `false`"
      (mt/with-empty-h2-app-db!
        (is (=? {:has_question_and_dashboard false}
                (mt/user-http-request :rasta :get 200 "user/current")))))))

(deftest get-current-user-test-4
  (testing "GET /api/user/current"
    (testing "on a fresh instance, `has_model` is `false`"
      (mt/with-empty-h2-app-db!
        (is (=? {:has_model false}
                (mt/user-http-request :rasta :get 200 "user/current")))))))

(deftest get-current-user-custom-homepage-test
  (testing "GET /api/user/current"
    (testing "Custom homepage"
      (testing "If id is set but not enabled it is not included"
        (mt/with-temporary-setting-values [custom-homepage false
                                           custom-homepage-dashboard 1]
          (is (nil? (:custom_homepage (mt/user-http-request :rasta :get 200 "user/current")))))))))

(deftest get-current-user-custom-homepage-test-2
  (testing "GET /api/user/current"
    (testing "Custom homepage"
      (testing "Not If enabled and set but"
        (testing "user cannot read"
          (mt/with-non-admin-groups-no-root-collection-perms
            (mt/with-temp [:model/Collection {coll-id :id} {:name "Collection"}
                           :model/Dashboard {dash-id :id} {:name "Dashboard Homepage"
                                                           :collection_id coll-id}]
              (mt/with-temporary-setting-values [custom-homepage true
                                                 custom-homepage-dashboard dash-id]
                (is (nil? (:custom_homepage (mt/user-http-request :rasta :get 200 "user/current"))))))))
        (testing "Dashboard is archived"
          (mt/with-temp [:model/Collection {coll-id :id} {:name "Collection"}
                         :model/Dashboard {dash-id :id} {:name "Dashboard Homepage"
                                                         :archived true
                                                         :collection_id coll-id}]
            (mt/with-temporary-setting-values [custom-homepage true
                                               custom-homepage-dashboard dash-id]
              (is (nil? (:custom_homepage (mt/user-http-request :rasta :get 200 "user/current")))))))
        (testing "Dashboard doesn't exist"
          (mt/with-temporary-setting-values [custom-homepage true
                                             custom-homepage-dashboard Long/MAX_VALUE]
            (is (nil? (:custom_homepage (mt/user-http-request :rasta :get 200 "user/current"))))))))))

(deftest get-current-user-custom-homepage-test-3
  (testing "GET /api/user/current"
    (testing "Custom homepage"
      (testing "Otherwise is set"
        (mt/with-temp [:model/Collection {coll-id :id} {:name "Collection"}
                       :model/Dashboard {dash-id :id} {:name "Dashboard Homepage"
                                                       :collection_id coll-id}]
          (mt/with-temporary-setting-values [custom-homepage true
                                             custom-homepage-dashboard dash-id]
            (is (=? {:first_name "Rasta"
                     :custom_homepage {:dashboard_id dash-id}}
                    (mt/user-http-request :rasta :get 200 "user/current")))))))))

(deftest get-current-user-custom-homepage-test-4
  (testing "GET /api/user/current"
    (testing "Custom homepage"
      (testing "If id does not point to a dashboard is nil"
        (mt/with-temporary-setting-values [custom-homepage true
                                           custom-homepage-dashboard -3]
          (is (nil? (:custom_homepage (mt/user-http-request :rasta :get 200 "user/current")))))))))

(deftest get-current-user-query-permissions-test
  (testing "GET /api/user/current includes can_create_queries and can_create_native_queries"
    (mt/with-premium-features #{}
      (letfn [(user-permissions [user]
                (-> (mt/user-http-request user :get 200 "user/current")
                    :permissions))]
        (testing "admins should have both permissions true"
          (is (partial= {:can_create_queries        true
                         :can_create_native_queries true}
                        (user-permissions :crowberto))))

        (testing "user with query-builder-and-native on a non-sample DB"
          (mt/with-temp [:model/Database {db-id :id} {:is_sample false}]
            (mt/with-all-users-data-perms-graph! {db-id {:view-data      :unrestricted
                                                         :create-queries :query-builder-and-native}}
              (is (partial= {:can_create_queries        true
                             :can_create_native_queries true}
                            (user-permissions :rasta))))))

        (testing "user with only query-builder (no native) on a non-sample DB"
          (mt/with-temp [:model/Database {db-id :id} {:is_sample false}]
            (mt/with-all-users-data-perms-graph! {db-id {:view-data      :unrestricted
                                                         :create-queries :query-builder}}
              (is (partial= {:can_create_queries        true
                             :can_create_native_queries false}
                            (user-permissions :rasta))))))

        (testing "user with no query permissions on non-sample DBs"
          (mt/with-temp [:model/Database {db-id :id} {:is_sample false}]
            (mt/with-all-users-data-perms-graph! {db-id {:view-data      :unrestricted
                                                         :create-queries :no}}
              (is (partial= {:can_create_queries        false
                             :can_create_native_queries false}
                            (user-permissions :rasta))))))

        (testing "at least one non-sample DB with native permission is enough"
          (mt/with-temp [:model/Database {db1-id :id} {:is_sample false}
                         :model/Database {db2-id :id} {:is_sample false}]
            (mt/with-all-users-data-perms-graph! {db1-id {:view-data      :unrestricted
                                                          :create-queries :no}
                                                  db2-id {:view-data      :unrestricted
                                                          :create-queries :query-builder-and-native}}
              (is (partial= {:can_create_queries        true
                             :can_create_native_queries true}
                            (user-permissions :rasta))))))))))

(deftest can-create-queries-ignores-published-tables-oss-test
  (testing "In OSS, can_create_queries should NOT consider published tables"
    (mt/with-premium-features #{}
      (letfn [(user-permissions [user]
                (-> (mt/user-http-request user :get 200 "user/current")
                    :permissions))]
        (testing "user with collection permission on published table should still have can_create_queries false"
          (mt/with-temp [:model/Collection {collection-id :id} {}
                         :model/Table      _table              {:db_id         (mt/id)
                                                                :is_published  true
                                                                :collection_id collection-id}]
            (perms/grant-collection-read-permissions! (perms-group/all-users) collection-id)
            (mt/with-no-data-perms-for-all-users!
              (is (partial= {:can_create_queries        false
                             :can_create_native_queries false}
                            (user-permissions :rasta))
                  "Published tables should NOT grant can_create_queries in OSS"))))))))

(deftest ^:parallel get-user-test
  (mt/with-premium-features #{}
    (testing "GET /api/user/:id"
      (testing "should return a smaller set of fields"
        (let [resp (mt/user-http-request :rasta :get 200 (str "user/" (mt/user->id :rasta)))]
          (is (= [{:id (:id (perms-group/all-users))}]
                 (:user_group_memberships resp)))
          (is (=? {:email "rasta@metabase.com"
                   :first_name "Rasta"
                   :last_name "Toucan"
                   :common_name "Rasta Toucan"}
                  resp)))))))

(deftest ^:parallel get-user-test-2
  (mt/with-premium-features #{}
    (testing "GET /api/user/:id"
      (testing "Check that a non-superuser CANNOT fetch someone else's user details"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (str "user/" (mt/user->id :trashbird)))))))))

(deftest ^:parallel get-user-superuser-fetch-another-user-test
  (mt/with-premium-features #{}
    (testing "GET /api/user/:id"
      (testing "A superuser should be allowed to fetch another users data"
        (let [resp (mt/user-http-request :crowberto :get 200 (str "user/" (mt/user->id :rasta)))]
          (is (= [{:id (:id (perms-group/all-users))}]
                 (:user_group_memberships resp)))
          (is (=? {:email "rasta@metabase.com"
                   :first_name "Rasta"
                   :last_name "Toucan"
                   :common_name "Rasta Toucan"}
                  resp)))))))

(deftest get-user-structured-attributes-test
  (testing "GET /api/user/:id"
    (testing "includes structured_attributes that tracks attribute provenance"
      (mt/with-temp [:model/User user {:first_name "Test"
                                       :last_name "User"
                                       :email "structured@test.com"
                                       :password "p@ssw0rd"
                                       :login_attributes {"role" "admin"
                                                          "department" "engineering"}}]
        (let [response (mt/user-http-request :crowberto :get 200 (str "user/" (:id user)))]
          (testing "response includes structured_attributes"
            (is (contains? response :structured_attributes)))

          (testing "structured_attributes has correct format for login attributes"
            (is (= {:role {:source "user" :frozen false :value "admin"}
                    :department {:source "user" :frozen false :value "engineering"}}
                   (:structured_attributes response))))

          (testing "structured_attributes is included for self-fetch"
            (let [self-response (mt/client {:username "structured@test.com" :password "p@ssw0rd"}
                                           :get 200 (str "user/" (:id user)))]
              (is (contains? self-response :structured_attributes)))))))))

(deftest get-user-structured-attributes-comprehensive-test
  (testing "GET /api/user/:id structured_attributes"
    (testing "with JWT attributes"
      (mt/with-temp [:model/User user {:first_name "Test"
                                       :last_name "User"
                                       :email "jwt@test.com"
                                       :jwt_attributes {"role" "viewer"
                                                        "env" "production"}
                                       :login_attributes {"role" "admin"
                                                          "department" "engineering"}}]
        (let [response (mt/user-http-request :crowberto :get 200 (str "user/" (:id user)))]
          (testing "User attributes override jwt attributes when keys conflict"
            (is (= {:role {:source "user" :frozen false :value "admin"
                           :original {:source "jwt" :frozen false :value "viewer"}}
                    :env {:source "jwt" :frozen false :value "production"}
                    :department {:source "user" :frozen false :value "engineering"}}
                   (:structured_attributes response)))))))

    (testing "with only login attributes"
      (mt/with-temp [:model/User user {:first_name "Test"
                                       :last_name "User"
                                       :email "login@test.com"
                                       :jwt_attributes nil
                                       :login_attributes {"key1" "value1"
                                                          "key2" "value2"}}]
        (let [response (mt/user-http-request :crowberto :get 200 (str "user/" (:id user)))]
          (is (= {:key1 {:source "user" :frozen false :value "value1"}
                  :key2 {:source "user" :frozen false :value "value2"}}
                 (:structured_attributes response))))))

    (testing "with no attributes"
      (mt/with-temp [:model/User user {:first_name "Test"
                                       :last_name "User"
                                       :email "empty@test.com"
                                       :jwt_attributes nil
                                       :login_attributes nil}]
        (let [response (mt/user-http-request :crowberto :get 200 (str "user/" (:id user)))]
          (is (= {}
                 (:structured_attributes response))))))

    (testing "with empty attribute maps"
      (mt/with-temp [:model/User user {:first_name "Test"
                                       :last_name "User"
                                       :email "emptymap@test.com"
                                       :jwt_attributes {}
                                       :login_attributes {}}]
        (let [response (mt/user-http-request :crowberto :get 200 (str "user/" (:id user)))]
          (is (= {}
                 (:structured_attributes response))))))

    (testing "JWT attributes preserve original value when overriding"
      (mt/with-temp [:model/User user {:first_name "Test"
                                       :last_name "User"
                                       :email "override@test.com"
                                       :jwt_attributes {"shared" "jwt-value"}
                                       :login_attributes {"shared" "user-value"
                                                          "unique" "only-user"}}]
        (let [response (mt/user-http-request :crowberto :get 200 (str "user/" (:id user)))]
          (testing "overridden attribute shows original value"
            (is (= {:source "user"
                    :frozen false
                    :value "user-value"
                    :original {:source "jwt" :frozen false :value "jwt-value"}}
                   (get-in response [:structured_attributes :shared]))))
          (testing "non-overridden attribute has no original"
            (is (= {:source "user" :frozen false :value "only-user"}
                   (get-in response [:structured_attributes :unique])))))))))

(deftest update-user-test-structured-attributes-not-in-put-response
  (testing "PUT /api/user/:id"
    (testing "structured_attributes is not included in PUT response"
      (mt/with-temp [:model/User {user-id :id} {:first_name "Test"
                                                :last_name "User"
                                                :email "test@metabase.com"
                                                :login_attributes {"role" "user"}}]
        (let [response (mt/user-http-request :crowberto :put 200 (str "user/" user-id)
                                             {:first_name "Updated"})]
          (testing "PUT response does not include structured_attributes"
            (is (not (contains? response :structured_attributes))))
          (testing "but GET still returns structured_attributes"
            (let [get-response (mt/user-http-request :crowberto :get 200 (str "user/" user-id))]
              (is (contains? get-response :structured_attributes))
              (is (= {:role {:source "user" :frozen false :value "user"}}
                     (:structured_attributes get-response))))))))))

(deftest combine-function-test
  (testing "combine function merges attributes correctly"
    (testing "basic merging"
      (is (= {"key1" {:source :user :frozen false :value "value1"}
              "key2" {:source :jwt :frozen false :value "value2"}}
             (#'api.user/combine {:user {"key1" "value1"}
                                  :jwt {"key2" "value2"}}
                                 nil))))

    (testing "User overrides user attributes"
      (is (= {"key" {:source :user
                     :frozen false
                     :value "user-value"
                     :original {:source :jwt :frozen false :value "jwt-value"}}}
             (#'api.user/combine {:user {"key" "user-value"}
                                  :jwt {"key" "jwt-value"}}
                                 nil))))

    (testing "system attributes are frozen"
      (is (= {"@system.key" {:source :system :frozen true :value "system-value"}}
             (#'api.user/combine {}
                                 {"@system.key" "system-value"}))))

    (testing "empty inputs produce empty output"
      (is (= {}
             (#'api.user/combine {:user nil :jwt nil} nil)))
      (is (= {}
             (#'api.user/combine {:user {} :jwt {}} nil))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Creating a new User -- POST /api/user                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest create-user-test
  (testing "POST /api/user"
    (testing "Test that we can create a new User"
      (mt/with-premium-features #{}
        (let [user-name (mt/random-name)
              email (mt/random-email)]
          (mt/with-model-cleanup [:model/User]
            (mt/with-fake-inbox
              (let [resp (mt/user-http-request :crowberto :post 200 "user"
                                               {:first_name user-name
                                                :last_name user-name
                                                :email email
                                                :login_attributes {:test "value"}})]
                (is (= (merge @user-defaults
                              {:email email
                               :first_name user-name
                               :last_name user-name
                               :common_name (str user-name " " user-name)
                               :jwt_attributes nil
                               :login_attributes {:test "value"}})
                       (-> resp
                           mt/boolean-ids-and-timestamps
                           (dissoc :user_group_memberships))))
                (is (= [{:id (:id (perms-group/all-users))}]
                       (:user_group_memberships resp)))))))))))

(deftest ^:parallel create-user-non-superuser-test
  (testing "POST /api/user"
    (testing "Check that non-superusers are denied access"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "user"
                                   {:first_name "whatever"
                                    :last_name "whatever"
                                    :email "whatever@whatever.com"}))))))

(deftest ^:parallel create-user-existing-email-test
  (testing "POST /api/user"
    (testing "Attempting to create a new user with the same email as an existing user should fail"
      (is (=? {:errors {:email "Email address already in use."}}
              (mt/user-http-request :crowberto :post 400 "user"
                                    {:first_name "Something"
                                     :last_name "Random"
                                     :email (:email (mt/fetch-user :rasta))}))))))

(deftest ^:parallel create-user-validate-input-test
  (testing "POST /api/user"
    (testing "Test input validations"
      (is (=? {:errors {:email "value must be a valid email address."}}
              (mt/user-http-request :crowberto :post 400 "user"
                                    {:first_name "whatever"
                                     :last_name "whatever"})))

      (is (=? {:errors {:email "value must be a valid email address."}}
              (mt/user-http-request :crowberto :post 400 "user"
                                    {:first_name "whatever"
                                     :last_name "whatever"
                                     :email "whatever"}))))))

(defn- do-with-temp-user-email! [f]
  (let [email (mt/random-email)]
    (try
      (f email)
      (finally (t2/delete! :model/User :email email)))))

(defmacro ^:private with-temp-user-email! [[email-binding] & body]
  `(do-with-temp-user-email! (fn [~email-binding] ~@body)))

(deftest create-user-setup-source-test
  (testing "POST /api/user"
    (testing "Inviting a teammate from the setup page should create a user with admin permissions"
      (mt/with-model-cleanup [:model/User]
        (mt/with-fake-inbox
          (let [resp (mt/user-http-request :crowberto :post 200 "user"
                                           {:first_name (mt/random-name)
                                            :last_name (mt/random-name)
                                            :email (mt/random-email)
                                            :source "setup"})]
            (is (=? [{:id (:id (perms-group/all-users))} {:id (:id (perms-group/admin))}]
                    (:user_group_memberships resp)))
            (is (true? (:is_superuser resp)))))))))

(deftest create-user-set-groups-test
  (testing "POST /api/user"
    (mt/with-premium-features #{}
      (testing "we should be able to put a User in groups the same time we create them"
        (mt/with-temp [:model/PermissionsGroup group-1 {:name "Group 1"}
                       :model/PermissionsGroup group-2 {:name "Group 2"}]
          (with-temp-user-email! [email]
            (mt/user-http-request :crowberto :post 200 "user"
                                  {:first_name "Cam"
                                   :last_name "Era"
                                   :email email
                                   :user_group_memberships (group-or-ids->user-group-memberships
                                                            [(perms-group/all-users) group-1 group-2])})
            (is (= #{"All Users" "Group 1" "Group 2"}
                   (user-test/user-group-names (t2/select-one :model/User :email email))))))))))

(deftest create-user-set-groups-test-2
  (testing "POST /api/user"
    (testing (str "If you forget the All Users group it should fail, because you cannot have a User that's not in the "
                  "All Users group. The whole API call should fail and no user should be created, even though the "
                  "permissions groups get set after the User is created")
      (mt/test-helpers-set-global-values!
        (mt/with-temp [:model/PermissionsGroup group {:name "Group"}]
          (with-temp-user-email! [email]
            (mt/user-http-request :crowberto :post 400 "user"
                                  {:first_name "Cam"
                                   :last_name "Era"
                                   :email email
                                   :user_group_memberships (group-or-ids->user-group-memberships [group])})
            (is (not (t2/exists? :model/User :%lower.email (u/lower-case-en email))))))))))

(defn- superuser-and-admin-pgm-info [email]
  {:is-superuser? (t2/select-one-fn :is_superuser :model/User :%lower.email (u/lower-case-en email))
   :pgm-exists? (t2/exists? :model/PermissionsGroupMembership
                            :user_id (t2/select-one-pk :model/User :%lower.email (u/lower-case-en email))
                            :group_id (u/the-id (perms-group/admin)))})

(deftest create-user-add-to-admin-group-test
  (testing "POST /api/user"
    (testing (str "We should be able to put someone in the Admin group when we create them by including the admin "
                  "group in group_ids")
      (mt/with-premium-features #{}
        (with-temp-user-email! [email]
          (mt/user-http-request :crowberto :post 200 "user"
                                {:first_name "Cam"
                                 :last_name "Era"
                                 :email email
                                 :user_group_memberships (group-or-ids->user-group-memberships
                                                          [(perms-group/all-users) (perms-group/admin)])})
          (is (= {:is-superuser? true, :pgm-exists? true}
                 (superuser-and-admin-pgm-info email))))))))

(deftest create-user-add-to-admin-group-test-2
  (testing "POST /api/user"
    (testing (str "for whatever reason we don't let you set is_superuser in the POST endpoint so if someone tries to "
                  "pass that it should get ignored")
      (with-temp-user-email! [email]
        (mt/user-http-request :crowberto :post 200 "user"
                              {:first_name "Cam"
                               :last_name "Era"
                               :email email
                               :is_superuser true})
        (is (= {:is-superuser? false, :pgm-exists? false}
               (superuser-and-admin-pgm-info email)))))))

(deftest create-user-must-assign-to-all-users-group
  (testing "POST /api/user"
    (testing "Creating a tenant user automatically assigns them to All tenant users group even when other groups are specified"
      (mt/with-temp [:model/PermissionsGroup group-1 {:name "Custom Group 1"}
                     :model/PermissionsGroup group-2 {:name "Custom Group 2"}]
        (let [user-name (mt/random-name)
              email     (mt/random-email)]
          (mt/with-model-cleanup [:model/User]
            (mt/with-fake-inbox
              (let [resp (mt/user-http-request :crowberto :post 400 "user"
                                               {:first_name             user-name
                                                :last_name              user-name
                                                :email                  email
                                                :user_group_memberships (group-or-ids->user-group-memberships
                                                                         [group-1 group-2])})]
                (is (= "You cannot add or remove users to/from the 'All Users' group." resp))))))))))

(deftest create-user-mixed-case-email
  (testing "POST /api/user/:id"
    (testing "can create a new User with a mixed case email and the email is normalized to lower case"
      (let [user-name (mt/random-name)
            email (mt/random-email)]
        (is (= email
               (:email (mt/with-fake-inbox
                         (try
                           (mt/boolean-ids-and-timestamps
                            (mt/user-http-request :crowberto :post 200 "user"
                                                  {:first_name user-name
                                                   :last_name user-name
                                                   :email (u/upper-case-en email)
                                                   :login_attributes {:test "value"}}))
                           (finally
                             ;; clean up after ourselves
                             (t2/delete! :model/User :email email)))))))))))

(deftest create-user-mixed-case-email-2
  (testing "POST /api/user/:id"
    (testing "attempting to create a new user with an email with case mutations of an existing email should fail"
      (is (=? {:errors {:email "Email address already in use."}}
              (mt/user-http-request :crowberto :post 400 "user"
                                    {:first_name "Something"
                                     :last_name "Random"
                                     :email (u/upper-case-en (:email (mt/fetch-user :rasta)))}))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Updating a User -- PUT /api/user/:id                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(mi/define-simple-hydration-method include-personal-collection-name
  ::personal-collection-name
  "Hydrate `::personal-collection-name`. This is just for tests."
  [user]
  (t2/select-one-fn :name :model/Collection :id (:personal_collection_id user)))

(deftest admin-update-other-user-test
  (testing "PUT /api/user/:id"
    (testing "test that admins can edit other Users\n"
      (mt/with-premium-features #{}
        (mt/with-temp [:model/User {user-id :id} {:first_name "Cam"
                                                  :last_name "Era"
                                                  :email "cam.era@metabase.com"
                                                  :is_superuser true}
                       :model/Collection _ {}]
          (letfn [(user [] (into {} (-> (t2/select-one [:model/User :id :first_name :last_name :is_superuser :email], :id user-id)
                                        (t2/hydrate :personal_collection_id ::personal-collection-name)
                                        (dissoc :id :personal_collection_id :common_name))))]
            (testing "before API call"
              (is (= {:first_name "Cam"
                      :last_name "Era"
                      :is_superuser true
                      :email "cam.era@metabase.com"
                      ::personal-collection-name "Cam Era's Personal Collection"}
                     (user))))
            (testing "response"
              (let [resp (mt/user-http-request :crowberto :put 200 (str "user/" user-id)
                                               {:last_name "Eron"
                                                :email "cam.eron@metabase.com"})]
                (is (= (group-or-ids->user-group-memberships [(perms-group/all-users)
                                                              (perms-group/admin)])
                       (:user_group_memberships resp)))
                (is (= (merge
                        @user-defaults
                        {:common_name "Cam Eron"
                         :email "cam.eron@metabase.com"
                         :first_name "Cam"
                         :last_name "Eron"
                         :jwt_attributes nil
                         :is_superuser true})
                       (-> (mt/user-http-request :crowberto :put 200 (str "user/" user-id)
                                                 {:last_name "Eron"
                                                  :email "cam.eron@metabase.com"})
                           (dissoc :user_group_memberships)
                           mt/boolean-ids-and-timestamps)))))
            (testing "after API call"
              (is (= {:first_name "Cam"
                      :last_name "Eron"
                      :is_superuser true
                      :email "cam.eron@metabase.com"
                      ::personal-collection-name "Cam Eron's Personal Collection"}
                     (user))))))))))

(deftest update-login-attributes-test
  (testing "PUT /api/user/:id"
    (testing "Test that we can update login attributes after a user has been created"
      (mt/with-temp [:model/User {user-id :id} {:first_name "Test"
                                                :last_name "User"
                                                :email "testuser@metabase.com"
                                                :is_superuser true}]
        (is (= (merge
                @user-defaults
                {:is_superuser true
                 :email "testuser@metabase.com"
                 :first_name "Test"
                 :login_attributes {:test "value"}
                 :jwt_attributes nil
                 :common_name "Test User"
                 :last_name "User"})
               (-> (mt/user-http-request :crowberto :put 200 (str "user/" user-id)
                                         {:email "testuser@metabase.com"
                                          :login_attributes {:test "value"}})
                   (dissoc :user_group_memberships)
                   mt/boolean-ids-and-timestamps)))))))

(deftest update-login-attributes-with-different-value-types-test
  (testing "PUT /api/user/:id"
    (testing "Non-string attributes are converted to strings"
      (mt/with-temp [:model/User {user-id :id} {:first_name "Test"
                                                :last_name "User"
                                                :email "testuser-types@metabase.com"}]
        (let [response (mt/user-http-request :crowberto :put 200 (str "user/" user-id)
                                             {:login_attributes {:string-attr "hello"
                                                                 :number-attr 42
                                                                 :float-attr 3.14
                                                                 :bool-true true
                                                                 :bool-false false}})]
          (is (= {:string-attr "hello"
                  :number-attr "42"
                  :float-attr "3.14"
                  :bool-true "true"
                  :bool-false "false"}
                 (:login_attributes response)))
          (testing "values are persisted correctly in the database"
            (is (= {"string-attr" "hello"
                    "number-attr" "42"
                    "float-attr" "3.14"
                    "bool-true" "true"
                    "bool-false" "false"}
                   (t2/select-one-fn :login_attributes :model/User :id user-id)))))))))

(deftest create-user-with-different-attribute-types-test
  (testing "POST /api/user"
    (testing "Non-string attributes are converted to strings"
      (with-temp-user-email! [email]
        (let [response (mt/user-http-request :crowberto :post 200 "user"
                                             {:first_name "Attribute"
                                              :last_name "Types"
                                              :email email
                                              :login_attributes {:string-val "test-string"
                                                                 :integer-val 123
                                                                 :decimal-val 45.67
                                                                 :boolean-true true
                                                                 :boolean-false false}})]
          (is (= {:string-val "test-string"
                  :integer-val "123"
                  :decimal-val "45.67"
                  :boolean-true "true"
                  :boolean-false "false"}
                 (:login_attributes response)))
          (testing "values are persisted correctly in the database"
            (is (= {"string-val" "test-string"
                    "integer-val" "123"
                    "decimal-val" "45.67"
                    "boolean-true" "true"
                    "boolean-false" "false"}
                   (t2/select-one-fn :login_attributes :model/User :id (:id response))))))))))

(deftest login-attributes-cannot-start-with-at-symbol
  (testing "PUT /api/user/:id"
    (testing "We can't create login attributes starting with `@`"
      (mt/with-temp [:model/User {user-id :id} {:first_name   "Test"
                                                :last_name    "User"
                                                :email        "testuser@metabase.com"
                                                :is_superuser true}]
        (is (= {:specific-errors {:login_attributes {(keyword "@foo") ["login attribute keys must not start with `@`, received: \"@foo\""]}},
                :errors
                {:login_attributes
                 {(keyword "@foo")
                  "nullable map from <login attribute keys must be a keyword or string, and login attribute keys must not start with `@`> to <anything>"}}}
               (mt/user-http-request :crowberto :put 400 (str "user/" user-id)
                                     {:email            "testuser@metabase.com"
                                      :login_attributes {"@foo" "foo"}}))))))
  (testing "POST /api/user"
    (let [user-name (mt/random-name)
          email     (mt/random-email)]
      (mt/with-model-cleanup [:model/User]
        (mt/with-fake-inbox
          (is (= {:specific-errors {:login_attributes {(keyword "@foo") ["login attribute keys must not start with `@`, received: \"@foo\""]}},
                  :errors
                  {:login_attributes
                   {(keyword "@foo")
                    "nullable map from <login attribute keys must be a keyword or string, and login attribute keys must not start with `@`> to <anything>"}}}
                 (mt/user-http-request :crowberto :post 400 "user"
                                       {:first_name       user-name
                                        :last_name        user-name
                                        :email            email
                                        :login_attributes {"@foo" "bar"}}))))))))

(deftest ^:parallel updated-user-name-test
  (testing "Test that `metabase.users-rest.api/updated-user-name` works as intended."
    (let [names {:first_name "Test" :last_name "User"} ;; in a real user map, `:first_name` and `:last_name` will always be present
          nonames {:first_name nil :last_name nil}
          firstname {:first_name "Test" :last_name nil}
          lastname {:first_name nil :last_name "User"}]
      ;; starting with names
      (is (nil? (#'api.user/updated-user-name names {})))
      (is (nil? (#'api.user/updated-user-name names {:first_name "Test"})))
      (is (nil? (#'api.user/updated-user-name names {:last_name "User"})))
      (is (nil? (#'api.user/updated-user-name names {:first_name "Test" :last_name "User"})))
      (is (= {:first_name "T" :last_name "U"} (#'api.user/updated-user-name names {:first_name "T" :last_name "U"})))
      (is (= {:first_name "Test" :last_name "U"} (#'api.user/updated-user-name names {:last_name "U"})))
      (is (= {:first_name "T" :last_name "User"} (#'api.user/updated-user-name names {:first_name "T"})))
      ;; starting with 'nil' names
      (is (nil? (#'api.user/updated-user-name nonames {})))
      (is (nil? (#'api.user/updated-user-name nonames {:first_name nil})))
      (is (nil? (#'api.user/updated-user-name nonames {:last_name nil})))
      (is (nil? (#'api.user/updated-user-name nonames {:first_name nil :last_name nil})))
      (is (= {:first_name "T" :last_name "U"} (#'api.user/updated-user-name nonames {:first_name "T" :last_name "U"})))
      (is (= {:first_name nil :last_name "U"} (#'api.user/updated-user-name nonames {:last_name "U"})))
      (is (= {:first_name "T" :last_name nil} (#'api.user/updated-user-name nonames {:first_name "T"})))
      ;; starting with one name nil
      (is (nil? (#'api.user/updated-user-name firstname {:first_name "Test" :last_name nil})))
      (is (nil? (#'api.user/updated-user-name firstname {:first_name "Test"})))
      (is (nil? (#'api.user/updated-user-name lastname {:first_name nil :last_name "User"})))
      (is (nil? (#'api.user/updated-user-name lastname {:last_name "User"}))))))

(deftest update-first-name-last-name-test
  (testing "PUT /api/user/:id"
    (testing "Test that we can update a user's first and last names"
      (mt/with-temp [:model/User {user-id :id} {:first_name "Blue Ape"
                                                :last_name "Ron"
                                                :email "blueronny@metabase.com"
                                                :is_superuser true}]
        (letfn [(change-user-via-api! [m]
                  (-> (mt/user-http-request :crowberto :put 200 (str "user/" user-id) m)
                      (t2/hydrate :personal_collection_id ::personal-collection-name)
                      (dissoc :user_group_memberships :personal_collection_id :email :is_superuser :jwt_attributes :is_data_analyst)
                      (#(apply (partial dissoc %) (keys @user-defaults)))
                      mt/boolean-ids-and-timestamps))]
          (testing "Name keys ommitted does not update the user"
            (is (= {:first_name "Blue Ape"
                    :last_name "Ron"
                    :common_name "Blue Ape Ron"
                    ::personal-collection-name "Blue Ape Ron's Personal Collection"}
                   (change-user-via-api! {}))))
          (testing "Name keys having the same values does not update the user"
            (is (= {:first_name "Blue Ape"
                    :last_name "Ron"
                    :common_name "Blue Ape Ron"
                    ::personal-collection-name "Blue Ape Ron's Personal Collection"}
                   (change-user-via-api! {:first_name "Blue Ape"
                                          :last_name "Ron"}))))
          (testing "Name keys explicitly set to `nil` updates the user"
            (is (= {:first_name nil
                    :last_name nil
                    :common_name "blueronny@metabase.com"
                    ::personal-collection-name "blueronny@metabase.com's Personal Collection"}
                   (change-user-via-api! {:first_name nil
                                          :last_name nil}))))
          (testing "Nil keys compare correctly with nil names and cause no change."
            (is (= {:first_name nil
                    :last_name nil
                    :common_name "blueronny@metabase.com"
                    ::personal-collection-name "blueronny@metabase.com's Personal Collection"}
                   (change-user-via-api! {:first_name nil
                                          :last_name nil}))))
          (testing "First/last_name keys are sent but one is unchanged, updates only the altered key for the user"
            (is (= {:first_name nil
                    :last_name "Apron"
                    :common_name "Apron"
                    ::personal-collection-name "Apron's Personal Collection"}
                   (change-user-via-api! {:first_name nil
                                          :last_name "Apron"}))))
          (testing "Both new name keys update the user"
            (is (= {:first_name "Blue"
                    :last_name nil
                    :common_name "Blue"
                    ::personal-collection-name "Blue's Personal Collection"}
                   (change-user-via-api! {:first_name "Blue"
                                          :last_name nil})))))))))

(deftest update-sso-user-test
  (testing "PUT /api/user/:id"
    (testing "Test that we do not update a user's first and last names if they are an SSO user."
      (mt/with-temp [:model/User {user-id :id} {:first_name "SSO"
                                                :last_name "User"
                                                :email "sso-user@metabase.com"
                                                :sso_source :jwt
                                                :is_superuser true}]
        (letfn [(change-user-via-api! [expected-status m]
                  (mt/user-http-request :crowberto :put expected-status (str "user/" user-id) m))]
          (testing "`:first_name` changes are rejected"
            (is (=? {:errors {:first_name "Editing first name is not allowed for SSO users."}}
                    (change-user-via-api! 400 {:first_name "NOT-SSO"}))))
          (testing "`:last_name` changes are rejected"
            (is (=? {:errors {:last_name "Editing last name is not allowed for SSO users."}}
                    (change-user-via-api! 400 {:last_name "USER"}))))
          (testing "New names that are the same as existing names succeed because there is no change."
            (is (partial= {:first_name "SSO" :last_name "User"}
                          (change-user-via-api! 200 {:first_name "SSO" :last_name "User"})))))))))

(deftest update-email-check-if-already-used-test
  (testing "PUT /api/user/:id"
    (testing "test that updating a user's email to an existing inactive user's email fails"
      (let [trashbird (mt/fetch-user :trashbird)
            rasta (mt/fetch-user :rasta)]
        (is (=? {:errors {:email "Email address already associated to another user."}}
                (mt/user-http-request :crowberto :put 400 (str "user/" (u/the-id rasta))
                                      (select-keys trashbird [:email]))))))))

(deftest update-existing-email-case-mutation-test
  (testing "PUT /api/user/:id"
    (testing "test that updating a user's email to an an existing inactive email by mutating case fails"
      (let [trashbird (mt/fetch-user :trashbird)
            rasta (mt/fetch-user :rasta)
            trashbird-mutated (update trashbird :email u/upper-case-en)]
        (is (=? {:errors {:email "Email address already associated to another user."}}
                (mt/user-http-request :crowberto :put 400 (str "user/" (u/the-id rasta))
                                      (select-keys trashbird-mutated [:email]))))))))

(deftest update-superuser-status-test
  (testing "PUT /api/user/:id"
    (testing "Test that a normal user cannot change the :is_superuser flag for themselves"
      (letfn [(fetch-rasta []
                (t2/select-one [:model/User :first_name :last_name :is_superuser :email], :id (mt/user->id :rasta)))]
        (let [before (fetch-rasta)]
          (mt/user-http-request :rasta :put 200 (str "user/" (mt/user->id :rasta))
                                (assoc (fetch-rasta) :is_superuser true))
          (is (= before
                 (fetch-rasta))))))))

(defn- user-is-data-analyst?
  "Check if a user is a member of the Data Analysts group."
  [user-id]
  (t2/exists? :model/PermissionsGroupMembership
              :user_id user-id
              :group_id (:id (perms-group/data-analyst))))

(deftest update-data-analyst-status-test
  (testing "PUT /api/user/:id"
    (testing "Test that a superuser can set the :is_data_analyst flag (adds to Data Analysts group)"
      (mt/with-temp [:model/User {user-id :id} {:first_name "Test" :last_name "User" :email "test-analyst@metabase.com"}]
        (is (not (user-is-data-analyst? user-id)))
        (mt/user-http-request :crowberto :put 200 (str "user/" user-id)
                              {:is_data_analyst true})
        (is (user-is-data-analyst? user-id))))

    (testing "Test that a superuser can unset the :is_data_analyst flag (removes from Data Analysts group)"
      (mt/with-temp [:model/User {user-id :id} {:first_name "Test" :last_name "User" :email "test-analyst-unset@metabase.com"}]
        (mt/user-http-request :crowberto :put 200 (str "user/" user-id)
                              {:is_data_analyst true})
        (is (user-is-data-analyst? user-id))
        (mt/user-http-request :crowberto :put 200 (str "user/" user-id)
                              {:is_data_analyst false})
        (is (not (user-is-data-analyst? user-id)))))

    (testing "Test that a normal user cannot change the :is_data_analyst flag for themselves"
      (is (not (user-is-data-analyst? (mt/user->id :rasta))))
      (mt/user-http-request :rasta :put 200 (str "user/" (mt/user->id :rasta))
                            {:is_data_analyst true})
      (is (not (user-is-data-analyst? (mt/user->id :rasta)))))

    (testing "Test that a normal user cannot change the :is_data_analyst flag for another user"
      (mt/with-temp [:model/User {user-id :id} {:first_name "Test" :last_name "User" :email "test-analyst2@metabase.com"}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (str "user/" user-id)
                                     {:is_data_analyst true})))))))

(deftest filter-by-data-analyst-test
  (testing "GET /api/user"
    (testing "Filter users by is_data_analyst=true includes data analysts group members"
      (mt/with-temp [:model/User {analyst-id :id} {:first_name "Analyst" :last_name "User"
                                                   :email "analyst-filter@metabase.com"
                                                   :is_data_analyst true}
                     :model/User {non-analyst-id :id} {:first_name "NonAnalyst" :last_name "User"
                                                       :email "non-analyst-filter@metabase.com"}]
        (let [result (:data (mt/user-http-request :crowberto :get 200 "user" :is_data_analyst true))
              result-ids (set (map :id result))]
          (testing "data analyst group member is included"
            (is (contains? result-ids analyst-id)))
          (testing "non-analyst is excluded"
            (is (not (contains? result-ids non-analyst-id)))))))

    (testing "Filter users by is_data_analyst=false excludes data analysts group members"
      (mt/with-temp [:model/User {analyst-id :id} {:first_name "Analyst2"
                                                   :last_name "User"
                                                   :email "analyst-filter2@metabase.com"
                                                   :is_data_analyst true}
                     :model/User {non-analyst-id :id} {:first_name "NonAnalyst2" :last_name "User"
                                                       :email "non-analyst-filter2@metabase.com"}]
        (let [result (:data (mt/user-http-request :crowberto :get 200 "user" :is_data_analyst false))
              result-ids (set (map :id result))]
          (testing "data analyst group member is excluded"
            (is (not (contains? result-ids analyst-id))))
          (testing "non-analyst is included"
            (is (contains? result-ids non-analyst-id))))))))

(deftest update-permissions-test
  (testing "PUT /api/user/:id"
    (testing "Check that a non-superuser CANNOT update someone else's user details"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (str "user/" (mt/user->id :trashbird))
                                   {:email "toucan@metabase.com"}))))

    (testing "We should get a 404 when trying to access a disabled account"
      (is (= "Not found."
             (mt/user-http-request :crowberto :put 404 (str "user/" (mt/user->id :trashbird))
                                   {:email "toucan@metabase.com"}))))

    (testing "Google auth users shouldn't be able to change their own password as we get that from Google"
      (mt/with-temp [:model/User user {:email "anemail@metabase.com"
                                       :password "def123"
                                       :sso_source "google"}]
        (let [creds {:username "anemail@metabase.com"
                     :password "def123"}]
          (is (= "You don't have permissions to do that."
                 (client/client creds :put 403 (format "user/%d" (u/the-id user))
                                {:email "adifferentemail@metabase.com"}))))))

    (testing (str "Similar to Google auth accounts, we should not allow LDAP users to change their own email address "
                  "as we get that from the LDAP server")
      (mt/with-temp [:model/User user {:email "anemail@metabase.com"
                                       :password "def123"
                                       :sso_source "ldap"}]
        (let [creds {:username "anemail@metabase.com"
                     :password "def123"}]
          (is (= "You don't have permissions to do that."
                 (client/client creds :put 403 (format "user/%d" (u/the-id user))
                                {:email "adifferentemail@metabase.com"}))))))))

(deftest update-permissions-test-2
  (testing "PUT /api/user/:id"
    (testing "Google auth users can change their locale"
      (mt/with-temp [:model/User user {:email "anemail@metabase.com"
                                       :password "def123"
                                       :sso_source "google"}]
        (let [creds {:username "anemail@metabase.com"
                     :password "def123"}]
          (client/client creds :put 200 (format "user/%d" (u/the-id user))
                         {:locale "id"}))))

    (testing "LDAP users can change their locale"
      (mt/with-temp [:model/User user {:email "anemail@metabase.com"
                                       :password "def123"
                                       :sso_source "ldap"}]
        (let [creds {:username "anemail@metabase.com"
                     :password "def123"}]
          (client/client creds :put 200 (format "user/%d" (u/the-id user))
                         {:locale "id"}))))))

(defn- do-with-preserved-rasta-personal-collection-name! [thunk]
  (let [{collection-name :name, :keys [slug id]} (collection/user->personal-collection (mt/user->id :rasta))]
    (mt/with-temp-vals-in-db :model/Collection id {:name collection-name, :slug slug}
      (thunk))))

(defmacro ^:private with-preserved-rasta-personal-collection-name!
  "Preserve the name of Rasta's personal collection inside a body that might cause it to change (e.g. changing user name
  via the API.)"
  [& body]
  `(do-with-preserved-rasta-personal-collection-name! (fn [] ~@body)))

(deftest update-groups-test
  (testing "PUT /api/user/:id"
    (testing "Check that we can update the groups a User belongs to -- if we are a superuser"
      (mt/with-premium-features #{}
        (mt/with-temp [:model/User user {}
                       :model/PermissionsGroup group {:name "Blue Man Group"}]
          (mt/user-http-request :crowberto :put 200 (str "user/" (u/the-id user))
                                {:user_group_memberships (group-or-ids->user-group-memberships [(perms-group/all-users) group])})
          (is (= #{"All Users" "Blue Man Group"}
                 (user-test/user-group-names user))))))))

(deftest update-groups-test-2
  (testing "PUT /api/user/:id"
    (testing "if we pass user_group_memberships, and are updating ourselves as a non-superuser, the entire call should fail"
      ;; By wrapping the test in this macro even if the test fails it will restore the original values
      (mt/with-temp-vals-in-db :model/User (mt/user->id :rasta) {:first_name "Rasta"}
        (mt/test-helpers-set-global-values!
          (with-preserved-rasta-personal-collection-name!
            (mt/with-temp [:model/PermissionsGroup group {:name "Blue Man Group"}]
              (mt/user-http-request :rasta :put 403 (str "user/" (mt/user->id :rasta))
                                    {:user_group_memberships (group-or-ids->user-group-memberships [(perms-group/all-users) group])
                                     :first_name "Reggae"}))))
        (testing "groups"
          (is (= #{"All Users"}
                 (user-test/user-group-names (mt/user->id :rasta)))))
        (testing "first name"
          (is (= "Rasta"
                 (t2/select-one-fn :first_name :model/User :id (mt/user->id :rasta)))))))))

(deftest update-groups-test-3
  (testing "PUT /api/user/:id"
    (testing "if we pass user_group_memberships as a non-superuser the call should succeed, so long as the value doesn't change"
      (mt/with-premium-features #{}
        (mt/with-temp-vals-in-db :model/User (mt/user->id :rasta) {:first_name "Rasta"}
          (with-preserved-rasta-personal-collection-name!
            (is (=? {:id (mt/user->id :rasta)}
                    (mt/user-http-request :rasta :put 200 (str "user/" (mt/user->id :rasta))
                                          {:user_group_memberships [{:id (:id (perms-group/all-users))}]
                                           :first_name "Reggae"}))))
          (testing "groups"
            (is (= #{"All Users"}
                   (user-test/user-group-names (mt/user->id :rasta)))))
          (testing "first name"
            (is (= "Reggae"
                   (t2/select-one-fn :first_name :model/User :id (mt/user->id :rasta))))))))))

(deftest update-groups-test-4
  (testing "PUT /api/user/:id"
    (testing (str "We should be able to put someone in the Admin group when we update them them (is_superuser TRUE? "
                  "and user_group_memberships including admin group ID)")
      (mt/with-premium-features #{}
        (mt/with-temp [:model/User {:keys [email id]}]
          (mt/user-http-request :crowberto :put 200 (str "user/" id)
                                {:is_superuser true
                                 :user_group_memberships (group-or-ids->user-group-memberships [(perms-group/all-users) (perms-group/admin)])})
          (is (= {:is-superuser? true, :pgm-exists? true}
                 (superuser-and-admin-pgm-info email))))))))

(deftest update-groups-test-5
  (testing "PUT /api/user/:id"
    (testing (str "if we try to create a new user with is_superuser FALSE but user_group_memberships that includes the Admin group "
                  "ID, the entire call should fail")
      (mt/test-helpers-set-global-values!
        (mt/with-temp [:model/User {:keys [email id]} {:first_name "Old First Name"}]
          (mt/user-http-request :crowberto :put 400 (str "user/" id)
                                {:is_superuser false
                                 :user_group_memberships (group-or-ids->user-group-memberships [(perms-group/all-users) (perms-group/admin)])
                                 :first_name "Cool New First Name"})
          (is (= {:is-superuser? false, :pgm-exists? false, :first-name "Old First Name"}
                 (assoc (superuser-and-admin-pgm-info email)
                        :first-name (t2/select-one-fn :first_name :model/User :id id)))))))))

(deftest update-groups-test-6
  (testing "PUT /api/user/:id"
    (testing (str "if we try to create a new user with is_superuser TRUE but user_group_memberships that does not include the Admin "
                  "group ID, things should fail")
      (mt/test-helpers-set-global-values!
        (mt/with-temp [:model/User {:keys [email id]}]
          (mt/user-http-request :crowberto :put 400 (str "user/" id)
                                {:is_superuser true
                                 :user_group_memberships (group-or-ids->user-group-memberships [(perms-group/all-users)])})
          (is (= {:is-superuser? false, :pgm-exists? false}
                 (superuser-and-admin-pgm-info email))))))))

(deftest update-groups-test-7
  (testing "PUT /api/user/:id"
    (testing "if we PUT a user with is_superuser TRUE but don't specify user_group_memberships, we should be ok"
      (mt/with-temp [:model/User {:keys [email id]}]
        (mt/user-http-request :crowberto :put 200 (str "user/" id)
                              {:is_superuser true})
        (is (= {:is-superuser? true, :pgm-exists? true}
               (superuser-and-admin-pgm-info email)))))))

(deftest update-groups-test-8
  (testing "PUT /api/user/:id"
    (testing "if we include Admin in user_group_memberships but don't specify is_superuser we should be ok"
      (mt/with-premium-features #{}
        (mt/with-temp [:model/User {:keys [email id]}]
          (is (=? {:id id
                   :is_superuser true}
                  (mt/user-http-request :crowberto :put 200 (str "user/" id)
                                        {:user_group_memberships (group-or-ids->user-group-memberships [(perms-group/all-users) (perms-group/admin)])})))
          (is (= {:is-superuser? true, :pgm-exists? true}
                 (superuser-and-admin-pgm-info email))))))))

(deftest ^:parallel update-groups-test-9
  (testing "Double-check that the tests above cleaned up after themselves"
    (is (= "Rasta"
           (t2/select-one-fn :first_name :model/User :id (mt/user->id :rasta))))
    (is (= {:name "Rasta Toucan's Personal Collection"
            :slug "rasta_toucan_s_personal_collection"}
           (t2/select-one [:model/Collection :name :slug] :personal_owner_id (mt/user->id :rasta))))))

(deftest update-locale-test
  (testing "PUT /api/user/:id\n"
    (mt/with-temp [:model/User {user-id :id, email :email} {:password "p@ssw0rd"}]
      (letfn [(set-locale! [expected-status-code new-locale]
                (mt/client {:username email, :password "p@ssw0rd"}
                           :put expected-status-code (str "user/" user-id)
                           {:locale new-locale}))
              (locale-from-db []
                (t2/select-one-fn :locale :model/User :id user-id))]
        (let [url (str "user/" user-id)]
          (testing "normal Users should be able to update their own locale"
            (doseq [[message locale] {"to a language-country locale (with dash)" "es-MX"
                                      "to a language-country locale (with underscore)" "es_MX"
                                      "to a language-only locale" "es"
                                      "to `nil` (use system default)" nil}]
              (testing message
                (testing "response"
                  (is (= (i18n/normalized-locale-string locale)
                         (:locale (set-locale! 200 locale)))))
                (testing "value in DB should be updated to new locale"
                  (is (= (i18n/normalized-locale-string locale)
                         (locale-from-db)))))))

          (testing "admins should be able to update someone else's locale"
            (testing "response"
              (is (= "en_US"
                     (:locale (mt/user-http-request :crowberto :put 200 url {:locale "en-US"})))))
            (testing "value in DB should be updated and normalized"
              (is (= "en_US"
                     (locale-from-db)))))

          (testing "normal Users should not be able to update someone else's locale"
            (testing "response"
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :lucky :put 403 url {:locale "en-GB"}))))
            (testing "value in DB should be unchanged"
              (is (= "en_US"
                     (locale-from-db)))))

          (testing "attempting to set an invalid locales should result in an error"
            (doseq [[group locales] {"invalid input" [nil "" 100 "ab/cd" "USA!"]
                                     "3-letter codes" ["eng" "eng-USA"]
                                     "languages that don't exist" ["zz" "xx" "xx-yy"]}
                    new-locale locales]
              (testing group
                (testing (format "attempt to set locale to %s" new-locale)
                  (testing "response"
                    (is (=? {:errors {:locale #".*String must be a valid two-letter ISO language or language-country code.*"}}
                            (set-locale! 400 {:locale new-locale}))))
                  (testing "value in DB should be unchanged"
                    (is (= "en_US"
                           (locale-from-db)))))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                              Reactivating a User -- PUT /api/user/:id/reactivate                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest reactivate-user-test
  (testing "PUT /api/user/:id/reactivate"
    (testing "Test that reactivating a disabled account works"
      (mt/with-temp [:model/User user {:is_active false}]
        ;; now try creating the same user again, should re-activiate the original
        (mt/user-http-request :crowberto :put 200 (format "user/%s/reactivate" (u/the-id user))
                              {:first_name (:first_name user)
                               :last_name "whatever"
                               :email (:email user)})
        (is (true?
             (t2/select-one-fn :is_active :model/User :id (:id user)))
            "the user should now be active")))

    (testing "error conditions"
      (testing "Attempting to reactivate a non-existant user should return a 404"
        (is (= "Not found."
               (mt/user-http-request :crowberto :put 404 (format "user/%s/reactivate" Integer/MAX_VALUE)))))

      (testing " Attempting to reactivate an already active user should fail"
        (is (=? {:message "Not able to reactivate an active user"}
                (mt/user-http-request :crowberto :put 400 (format "user/%s/reactivate" (mt/user->id :rasta)))))))

    (testing (str "test that when disabling Google auth if a user gets disabled and re-enabled they are no longer "
                  "Google Auth (#3323)")
      (mt/with-temporary-setting-values [google-auth-client-id "pretend-client-id.apps.googleusercontent.com"
                                         google-auth-enabled true]
        (mt/with-temp [:model/User user {:sso_source :google}]
          (t2/update! :model/User (u/the-id user)
                      {:is_active false})
          (mt/with-temporary-setting-values [google-auth-enabled false]
            (mt/user-http-request :crowberto :put 200 (format "user/%s/reactivate" (u/the-id user)))
            (is (= {:is_active true, :sso_source nil}
                   (mt/derecordize (t2/select-one [:model/User :is_active :sso_source] :id (u/the-id user)))))))))))

(deftest reactivate-second-to-last-admin-test
  (mt/with-single-admin-user! [{id :id}]
    (testing "With two admins, one deactivated"
      (mt/with-temp [:model/User {other-user :id} {:is_superuser true}]
        (mt/user-http-request id :delete 200 (format "user/%d" other-user))
        (testing "We can reactivate the other admin"
          (mt/user-http-request id :put 200 (format "user/%d/reactivate" other-user)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                               Updating a Password -- PUT /api/user/:id/password                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- user-can-reset-password? [superuser?]
  (mt/with-temp [:model/User user {:password "def", :is_superuser (boolean superuser?)}]
    (let [creds {:username (:email user), :password "def"}
          hashed-password (t2/select-one-fn :password :model/User, :%lower.email (u/lower-case-en (:email user)))]
      ;; use API to reset the users password
      (mt/client creds :put 200 (format "user/%d/password" (:id user)) {:password "abc123!!DEF"
                                                                        :old_password "def"})
      ;; now simply grab the lastest pass from the db and compare to the one we have from before reset
      (not= hashed-password (t2/select-one-fn :password :model/User, :%lower.email (u/lower-case-en (:email user)))))))

(deftest can-reset-password-test
  (testing "PUT /api/user/:id/password"
    (testing "Test that we can reset our own password. If user is a"
      (testing "superuser"
        (is (true?
             (user-can-reset-password? :superuser))))
      (testing "non-superuser"
        (is (true?
             (user-can-reset-password? (not :superuser))))))))

(deftest reset-password-permissions-test
  (testing "PUT /api/user/:id/password"
    (testing "Check that a non-superuser CANNOT update someone else's password"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (format "user/%d/password" (mt/user->id :trashbird))
                                   {:password "whateverUP12!!"
                                    :old_password "whatever"}))))))

(deftest reset-password-input-validation-test
  (testing "PUT /api/user/:id/password"
    (testing "Test input validations on password change"
      (is (=? {:errors {:password "password is too common."}}
              (mt/user-http-request :rasta :put 400 (format "user/%d/password" (mt/user->id :rasta)) {}))))

    (testing "Make sure that if current password doesn't match we get a 400"
      (is (=? {:errors {:old_password "Invalid password"}}
              (mt/user-http-request :rasta :put 400 (format "user/%d/password" (mt/user->id :rasta))
                                    {:password "whateverUP12!!"
                                     :old_password "mismatched"}))))))

(deftest reset-password-session-test
  (testing "PUT /api/user/:id/password"
    (testing "Test that we return a session if we are changing our own password"
      (mt/with-temp [:model/User user {:password "def", :is_superuser false}]
        (let [creds {:username (:email user), :password "def"}]
          (is (=? {:session_id string/valid-uuid?
                   :success true}
                  (mt/client creds :put 200 (format "user/%d/password" (:id user)) {:password "abc123!!DEF"
                                                                                    :old_password "def"}))))))

    (testing "Test that we don't return a session if we are changing our someone else's password as a superuser"
      (mt/with-temp [:model/User user {:password "def", :is_superuser false}]
        (is (nil? (mt/user-http-request :crowberto :put 204 (format "user/%d/password" (:id user)) {:password "abc123!!DEF"
                                                                                                    :old_password "def"})))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                             Deleting (Deactivating) a User -- DELETE /api/user/:id                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest deactivate-user-test
  (testing "DELETE /api/user/:id"
    (mt/with-temp [:model/User user]
      (is (= {:success true}
             (mt/user-http-request :crowberto :delete 200 (format "user/%d" (:id user)) {})))

      (testing "User should still exist, but be inactive"
        (is (= {:is_active false}
               (mt/derecordize (t2/select-one [:model/User :is_active] :id (:id user)))))))

    (testing "Check that the last superuser cannot deactivate themselves"
      (mt/with-single-admin-user! [{id :id}]
        (is (= "You cannot remove the last member of the 'Admin' group!"
               (mt/user-http-request id :delete 400 (format "user/%d" id))))))

    (testing "Check that the last non-archived superuser cannot deactivate themselves"
      (mt/with-single-admin-user! [{id :id}]
        (mt/with-temp [:model/User _ {:is_active false
                                      :is_superuser true}]
          (is (= "You cannot remove the last member of the 'Admin' group!"
                 (mt/user-http-request id :delete 400 (format "user/%d" id)))))))

    (testing "Check that a non-superuser CANNOT deactivate themselves"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :delete 403 (format "user/%d" (mt/user->id :rasta)) {}))))))

(deftest deactivate-missing-user-fails
  (testing "DELETE /api/user/:id"
    (let [max-id (:max_id (t2/query-one {:select [[:%max.id :max_id]]
                                         :from :core_user}))]
      (is (= "Not found." (mt/user-http-request :crowberto :delete 404 (format "user/%d" (* 2 max-id))))))))

(deftest deactivate-deactivated-user-again-succeeds
  (testing "DELETE /api/user/:id"
    (mt/with-temp [:model/User user {:is_active false}]
      (is (= {:success true}
             (mt/user-http-request :crowberto :delete 200 (format "user/%d" (:id user)) {}))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Other Endpoints                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-user-modal-test
  (doseq [[endpoint property] [["qbnewb" :is_qbnewb]
                               ["datasetnewb" :is_datasetnewb]]]
    (testing (str "PUT /api/user/:id/modal/" endpoint)
      (testing "Test that we can set the QB newb status of ourselves"
        (mt/with-temp [:model/User {:keys [id]} {:first_name (mt/random-name)
                                                 :last_name (mt/random-name)
                                                 :email "def@metabase.com"
                                                 :password "def123"}]
          (let [creds {:username "def@metabase.com"
                       :password "def123"}]
            (testing "defaults to true"
              (is (true? (t2/select-one-fn property :model/User, :id id))))
            (testing "response"
              (is (= {:success true}
                     (mt/client creds :put 200 (format "user/%d/modal/%s" id endpoint)))))
            (testing (str endpoint "?")
              (is (false? (t2/select-one-fn property :model/User, :id id)))))))

      (testing "shouldn't be allowed to set someone else's status"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403
                                     (format "user/%d/modal/%s"
                                             (mt/user->id :trashbird)
                                             endpoint))))))))

(deftest user-activate-deactivate-event-test
  (testing "User Deactivate/Reactivate events via the API are recorded in the audit log"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/User {:keys [id]} {:first_name "John"
                                               :last_name "Cena"}]
        (testing "DELETE /api/user/:id and PUT /api/user/:id/reactivate"
          (mt/user-http-request :crowberto :delete 200 (format "user/%s" id))
          (mt/user-http-request :crowberto :put 200 (format "user/%s/reactivate" id))
          (is (= [{:topic :user-deactivated
                   :user_id (mt/user->id :crowberto)
                   :model "User"
                   :model_id id
                   :details {}}
                  {:topic :user-reactivated
                   :user_id (mt/user->id :crowberto)
                   :model "User"
                   :model_id id
                   :details {}}]
                 [(mt/latest-audit-log-entry :user-deactivated id)
                  (mt/latest-audit-log-entry :user-reactivated id)])))))))

(deftest user-update-event-test
  (testing "User Updates via the API are recorded in the audit log"
    (mt/with-temp [:model/User {:keys [id]} {:first_name "John"
                                             :last_name "Cena"}]
      (mt/with-premium-features #{:audit-app}
        (testing "PUT /api/user/:id"
          (mt/user-http-request :crowberto :put 200 (format "user/%s" id)
                                {:first_name "Johnny" :last_name "Appleseed"})
          (is (= {:topic :user-update
                  :user_id (mt/user->id :crowberto)
                  :model "User"
                  :model_id id
                  :details {:new {:first_name "Johnny"
                                  :last_name "Appleseed"}
                            :previous {:first_name "John"
                                       :last_name "Cena"}}}
                 (mt/latest-audit-log-entry :user-update id))))))))

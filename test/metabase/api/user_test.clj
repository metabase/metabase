(ns ^:mb/once metabase.api.user-test
  "Tests for /api/user endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase.api.user :as api.user]
   [metabase.config :as config]
   [metabase.http-client :as client]
   [metabase.models
    :refer [Card Collection Dashboard LoginHistory PermissionsGroup
            PermissionsGroupMembership User]]
   [metabase.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.user :as user]
   [metabase.models.user-test :as user-test]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.server.middleware.util :as mw.util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(use-fixtures
  :once
  (fixtures/initialize :test-users-personal-collections))

(def ^:private user-defaults
  (delay
    (merge
     (mt/object-defaults User)
     {:date_joined      true
      :id               true
      :is_active        true
      :last_login       false
      :sso_source       nil
      :login_attributes nil
      :updated_at       true
      :locale           nil})))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |        Fetching Users -- GET /api/user, GET /api/user/current, GET /api/user/:id, GET /api/user/recipients     |
;;; +----------------------------------------------------------------------------------------------------------------+


;; ## /api/user/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint
(deftest user-list-authentication-test
  (testing "authentication"
    (testing "GET /api/user"
      (is (= (get mw.util/response-unauthentic :body)
             (client/client :get 401 "user"))))
    (testing "GET /api/user/current"
      (is (= (get mw.util/response-unauthentic :body)
             (client/client :get 401 "user/current"))))))

(deftest user-list-test
  (testing "GET /api/user"
    (testing "Check that admins can get a list of all active Users"
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [result (->> ((mt/user-http-request :crowberto :get 200 "user") :data)
                          (filter mt/test-user?))]
          ;; since this is an admin, all keys are available on each user
          (is (= (set (concat
                       user/admin-or-self-visible-columns
                       [:common_name :group_ids :personal_collection_id]))
                 (->> result first keys set)))
          ;; just make sure all users are there by checking the emails
          (is (= #{"crowberto@metabase.com"
                   "lucky@metabase.com"
                   "rasta@metabase.com"}
                 (->> result (map :email) set))))
        (testing "with a query"
          (is (= "lucky@metabase.com"
                 (-> (mt/user-http-request :crowberto :get 200 "user" :query "lUck") :data first :email))))))
    (testing "Check that non-admins cannot get a list of all active Users"
      (mt/with-non-admin-groups-no-root-collection-perms
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :lucky :get 403 "user")))
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :lucky :get 403 "user" :query "rasta")))))))

(deftest user-list-for-group-managers-test
  (testing "Group Managers"
    (premium-features-test/with-premium-features #{:advanced-permissions}
      (t2.with-temp/with-temp
          [:model/PermissionsGroup           {group-id1 :id} {:name "Cool Friends"}
           :model/PermissionsGroup           {group-id2 :id} {:name "Rad Pals"}
           :model/PermissionsGroup           {group-id3 :id} {:name "Good Folks"}
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
          (testing "manager can get users from their groups"
            (is (= #{"lucky@metabase.com"
                     "rasta@metabase.com"}
                   (->> ((mt/user-http-request :rasta :get 200 "user" :group_id group-id1) :data)
                        (filter mt/test-user?)
                        (map :email)
                        set)))
            (is (= #{"lucky@metabase.com"
                     "rasta@metabase.com"}
                   (->> ((mt/user-http-request :rasta :get 200 "user") :data)
                        (filter mt/test-user?)
                        (map :email)
                        set)))
            (testing "see users from all groups the user manages"
              (is (= #{"lucky@metabase.com"
                       "rasta@metabase.com"
                       "crowberto@metabase.com"}
                     (->> ((mt/user-http-request :lucky :get 200 "user") :data)
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
    (mt/with-non-admin-groups-no-root-collection-perms
      (let [crowberto "crowberto@metabase.com"
            lucky     "lucky@metabase.com"
            rasta     "rasta@metabase.com"]

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
                (is (= :all (api.user/user-visibility))))

              (testing "return all user by default"
                (is (= [crowberto lucky rasta]
                       (->> (:data (mt/user-http-request :rasta :get 200 "user/recipients"))
                            (filter mt/test-user?)
                            (map :email))))))))))))

(deftest user-recipients-list-ee-test
  (premium-features-test/with-premium-features #{:email-restrict-recipients}
    (testing "GET /api/user/recipients"
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [crowberto "crowberto@metabase.com"
              lucky     "lucky@metabase.com"
              rasta     "rasta@metabase.com"]
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
              (t2.with-temp/with-temp
                [:model/PermissionsGroup           {group-id1 :id} {:name "Test recipient group1"}
                 :model/PermissionsGroup           {group-id2 :id} {:name "Test recipient group2"}
                 :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id1}
                 :model/PermissionsGroupMembership _ {:user_id (mt/user->id :crowberto) :group_id group-id1}
                 :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id2}
                 :model/PermissionsGroupMembership _ {:user_id (mt/user->id :crowberto) :group_id group-id2}]
                (is (= [crowberto rasta]
                       (->> (:data (mt/user-http-request :rasta :get 200 "user/recipients"))
                            (map :email))))

               (testing "But returns self if the user is sandboxed"
                 (with-redefs [premium-features/sandboxed-or-impersonated-user? (constantly true)]
                   (is (= [rasta]
                          (->> ((mt/user-http-request :rasta :get 200 "user/recipients") :data)
                               (map :email)))))))))

          (testing "Returns only self when user-visibility is none"
            (mt/with-temporary-setting-values [user-visibility :none]
              (is (= [rasta]
                     (->> ((mt/user-http-request :rasta :get 200 "user/recipients") :data)
                          (filter mt/test-user?)
                          (map :email)))))))))))

(deftest admin-user-list-test
  (testing "GET /api/user"
    (testing "Check that admins can get a list of active Users. Should include additional admin Fields"
      (is (= (->> [{:email                  "crowberto@metabase.com"
                    :first_name             "Crowberto"
                    :last_name              "Corv"
                    :is_superuser           true
                    :group_ids              #{(u/the-id (perms-group/all-users))
                                              (u/the-id (perms-group/admin))}
                    :personal_collection_id true
                    :common_name            "Crowberto Corv"}
                   {:email                  "lucky@metabase.com"
                    :first_name             "Lucky"
                    :last_name              "Pigeon"
                    :group_ids              #{(u/the-id (perms-group/all-users))}
                    :personal_collection_id true
                    :common_name            "Lucky Pigeon"}
                   {:email                  "rasta@metabase.com"
                    :first_name             "Rasta"
                    :last_name              "Toucan"
                    :group_ids              #{(u/the-id (perms-group/all-users))}
                    :personal_collection_id true
                    :common_name            "Rasta Toucan"}]
                  (map (partial merge @user-defaults))
                  (map #(dissoc % :is_qbnewb :last_login)))
             (->> ((mt/user-http-request :crowberto :get 200 "user") :data)
                  (filter mt/test-user?)
                  group-ids->sets
                  mt/boolean-ids-and-timestamps
                  (map #(dissoc % :is_qbnewb :last_login))))))
    (testing "Get list of users with a group id"
      (is (= (->> [{:email                  "crowberto@metabase.com"
                    :first_name             "Crowberto"
                    :last_name              "Corv"
                    :is_superuser           true
                    :group_ids              #{(u/the-id (perms-group/all-users))
                                              (u/the-id (perms-group/admin))}
                    :personal_collection_id true
                    :common_name            "Crowberto Corv"}]
                  (map (partial merge @user-defaults))
                  (map #(dissoc % :is_qbnewb :last_login)))
             (->> ((mt/user-http-request :crowberto :get 200 "user" :group_id (u/the-id (perms-group/admin))) :data)
                  (filter mt/test-user?)
                  group-ids->sets
                  mt/boolean-ids-and-timestamps
                  (map #(dissoc % :is_qbnewb :last_login))))))))

(deftest user-list-include-inactive-test
  (testing "GET /api/user?include_deactivated=true"
    (testing "Non-admins should *not* be allowed to pass in include_deactivated or status"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "user", :include_deactivated true)))
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "user", :status "all"))))

    (testing "Pagination gets the total users _in query_, not including the Internal User"
      (let [f (if (t2/exists? User config/internal-mb-user-id) dec identity)] ;; is there a smarter way to do this?
        (is (= (f (t2/count User))
               ((mt/user-http-request :crowberto :get 200 "user" :status "all") :total)))))
    (testing "for admins, it should include those inactive users as we'd expect"
      (is (= (->> [{:email                  "crowberto@metabase.com"
                    :first_name             "Crowberto"
                    :last_name              "Corv"
                    :is_superuser           true
                    :group_ids              #{(u/the-id (perms-group/all-users))
                                              (u/the-id (perms-group/admin))}
                    :personal_collection_id true
                    :common_name            "Crowberto Corv"}
                   {:email                  "lucky@metabase.com"
                    :first_name             "Lucky"
                    :last_name              "Pigeon"
                    :group_ids              #{(u/the-id (perms-group/all-users))}
                    :personal_collection_id true
                    :common_name            "Lucky Pigeon"}
                   {:email                  "rasta@metabase.com"
                    :first_name             "Rasta"
                    :last_name              "Toucan"
                    :group_ids              #{(u/the-id (perms-group/all-users))}
                    :personal_collection_id true
                    :common_name            "Rasta Toucan"}
                   {:email                  "trashbird@metabase.com"
                    :first_name             "Trash"
                    :last_name              "Bird"
                    :is_active              false
                    :group_ids              #{(u/the-id (perms-group/all-users))}
                    :personal_collection_id true
                    :common_name            "Trash Bird"}]
                  (map (partial merge @user-defaults))
                  (map #(dissoc % :is_qbnewb :last_login)))
             (->> ((mt/user-http-request :crowberto :get 200 "user", :include_deactivated true) :data)
                  (filter mt/test-user?)
                  group-ids->sets
                  mt/boolean-ids-and-timestamps
                  (map #(dissoc % :is_qbnewb :last_login)))))
      (is (= (->> [{:email                  "crowberto@metabase.com"
                    :first_name             "Crowberto"
                    :last_name              "Corv"
                    :is_superuser           true
                    :group_ids              #{(u/the-id (perms-group/all-users))
                                              (u/the-id (perms-group/admin))}
                    :personal_collection_id true
                    :common_name            "Crowberto Corv"}
                   {:email                  "lucky@metabase.com"
                    :first_name             "Lucky"
                    :last_name              "Pigeon"
                    :group_ids              #{(u/the-id (perms-group/all-users))}
                    :personal_collection_id true
                    :common_name            "Lucky Pigeon"}
                   {:email                  "rasta@metabase.com"
                    :first_name             "Rasta"
                    :last_name              "Toucan"
                    :group_ids              #{(u/the-id (perms-group/all-users))}
                    :personal_collection_id true
                    :common_name            "Rasta Toucan"}
                   {:email                  "trashbird@metabase.com"
                    :first_name             "Trash"
                    :last_name              "Bird"
                    :is_active              false
                    :group_ids              #{(u/the-id (perms-group/all-users))}
                    :personal_collection_id true
                    :common_name            "Trash Bird"}]
                  (map (partial merge @user-defaults))
                  (map #(dissoc % :is_qbnewb :last_login)))
             (->> ((mt/user-http-request :crowberto :get 200 "user", :status "all") :data)
                  (filter mt/test-user?)
                  group-ids->sets
                  mt/boolean-ids-and-timestamps
                  (map #(dissoc % :is_qbnewb :last_login)))))))

  (testing "GET /api/user?include_deactivated=false should return only active users"
    (is (= #{"crowberto@metabase.com"
             "lucky@metabase.com"
             "rasta@metabase.com"}
           (->> ((mt/user-http-request :crowberto :get 200 "user", :include_deactivated false) :data)
                (filter mt/test-user?)
                (map :email)
                set)))))

(deftest user-list-limit-test
  (testing "GET /api/user?limit=1&offset=1"
    (testing "Limit and offset pagination have defaults"
      (is (= (mt/user-http-request :crowberto :get 200 "user" :limit "1" :offset "0")
             (mt/user-http-request :crowberto :get 200 "user" :limit "1")))
      (is (= (mt/user-http-request :crowberto :get 200 "user" :limit "50" :offset "1")
             (mt/user-http-request :crowberto :get 200 "user" :offset "1"))))
    (testing "Limit and offset pagination get the total"
      (is (= (t2/count User :is_active true)
             ((mt/user-http-request :crowberto :get 200 "user" :offset "1" :limit "1") :total))))
    (testing "Limit and offset pagination works for user list"
      (let [first-three-users (:data (mt/user-http-request :crowberto :get 200 "user" :limit "3", :offset "0"))]
        (is (= 3
               (count first-three-users)))
        (is (= (drop 1 first-three-users)
               (:data (mt/user-http-request :crowberto :get 200 "user" :limit "2", :offset "1") :data)))))))

(deftest get-current-user-test
  (testing "GET /api/user/current"
    (testing "check that fetching current user will return extra fields like `is_active`"
      (mt/with-temp [LoginHistory _ {:user_id   (mt/user->id :rasta)
                                     :device_id (str (random-uuid))
                                     :timestamp #t "2021-03-18T19:52:41.808482Z"}
                     Card _ {:name "card1" :display "table" :creator_id (mt/user->id :rasta)}]
        (is (= (-> (merge
                    @user-defaults
                    {:email                      "rasta@metabase.com"
                     :first_name                 "Rasta"
                     :last_name                  "Toucan"
                     :common_name                "Rasta Toucan"
                     :first_login                "2021-03-18T19:52:41.808482Z"
                     :group_ids                  [(u/the-id (perms-group/all-users))]
                     :personal_collection_id     true
                     :custom_homepage            nil
                     :is_installer               (= 1 (mt/user->id :rasta))
                     :has_invited_second_user    (= 1 (mt/user->id :rasta))})
                   (dissoc :is_qbnewb :last_login))
               (-> (mt/user-http-request :rasta :get 200 "user/current")
                   mt/boolean-ids-and-timestamps
                   (dissoc :is_qbnewb :has_question_and_dashboard :last_login))))))
    (testing "check that `has_question_and_dashboard` is `true`."
      (mt/with-temp [Dashboard _ {:name "dash1" :creator_id (mt/user->id :rasta)}
                     Card      _ {:name "card1" :display "table" :creator_id (mt/user->id :rasta)}]
        (is (= (-> (merge
                    @user-defaults
                    {:email                      "rasta@metabase.com"
                     :first_name                 "Rasta"
                     :last_name                  "Toucan"
                     :common_name                "Rasta Toucan"
                     :group_ids                  [(u/the-id (perms-group/all-users))]
                     :personal_collection_id     true
                     :has_question_and_dashboard true
                     :custom_homepage            nil
                     :is_installer               (= 1 (mt/user->id :rasta))
                     :has_invited_second_user    (= 1 (mt/user->id :rasta))})
                   (dissoc :is_qbnewb :last_login))
               (-> (mt/user-http-request :rasta :get 200 "user/current")
                   mt/boolean-ids-and-timestamps
                   (dissoc :is_qbnewb :first_login :last_login))))))
    (testing "Custom homepage"
      (testing "If id is set but not enabled it is not included"
        (mt/with-temporary-setting-values [custom-homepage false
                                           custom-homepage-dashboard 1]
          (is (nil? (:custom_homepage (mt/user-http-request :rasta :get 200 "user/current"))))))
      (testing "Not If enabled and set but"
        (testing "user cannot read"
          (mt/with-non-admin-groups-no-root-collection-perms
            (mt/with-temp [Collection {coll-id :id} {:name "Collection"}
                           Dashboard  {dash-id :id} {:name          "Dashboard Homepage"
                                                     :collection_id coll-id}]
              (mt/with-temporary-setting-values [custom-homepage true
                                                 custom-homepage-dashboard dash-id]
                (is (nil? (:custom_homepage (mt/user-http-request :rasta :get 200 "user/current"))))))))
        (testing "Dashboard is archived"
          (mt/with-temp [Collection {coll-id :id} {:name "Collection"}
                         Dashboard  {dash-id :id} {:name          "Dashboard Homepage"
                                                   :archived      true
                                                   :collection_id coll-id}]
            (mt/with-temporary-setting-values [custom-homepage true
                                               custom-homepage-dashboard dash-id]
              (is (nil? (:custom_homepage (mt/user-http-request :rasta :get 200 "user/current")))))))
        (testing "Dashboard doesn't exist"
          (mt/with-temporary-setting-values [custom-homepage true
                                             custom-homepage-dashboard Long/MAX_VALUE]
            (is (nil? (:custom_homepage (mt/user-http-request :rasta :get 200 "user/current")))))))

      (testing "Otherwise is set"
        (mt/with-temp [Collection {coll-id :id} {:name "Collection"}
                       Dashboard  {dash-id :id} {:name          "Dashboard Homepage"
                                                 :collection_id coll-id}]
          (mt/with-temporary-setting-values [custom-homepage true
                                             custom-homepage-dashboard dash-id]
            (is (=? {:first_name      "Rasta"
                     :custom_homepage {:dashboard_id dash-id}}
                    (mt/user-http-request :rasta :get 200 "user/current"))))))
      (testing "If id does not point to a dashboard is nil"
        (mt/with-temporary-setting-values [custom-homepage true
                                           custom-homepage-dashboard -3]
          (is (nil? (:custom_homepage (mt/user-http-request :rasta :get 200 "user/current")))))))))

(deftest get-user-test
  (premium-features-test/with-premium-features #{}
    (testing "GET /api/user/:id"
      (testing "should return a smaller set of fields"
        (let [resp (mt/user-http-request :rasta :get 200 (str "user/" (mt/user->id :rasta)))]
          (is (= [{:id (:id (perms-group/all-users))}]
                 (:user_group_memberships resp)))
          (is (= (-> (merge
                      @user-defaults
                      {:email       "rasta@metabase.com"
                       :first_name  "Rasta"
                       :last_name   "Toucan"
                       :common_name "Rasta Toucan"})
                     (dissoc :is_qbnewb :last_login))
                 (-> resp
                     mt/boolean-ids-and-timestamps
                     (dissoc :is_qbnewb :last_login :user_group_memberships))))))

      (testing "Check that a non-superuser CANNOT fetch someone else's user details"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (str "user/" (mt/user->id :trashbird))))))

      (testing "A superuser should be allowed to fetch another users data"
        (let [resp (mt/user-http-request :crowberto :get 200 (str "user/" (mt/user->id :rasta)))]
          (is (= [{:id (:id (perms-group/all-users))}]
                 (:user_group_memberships resp)))
          (is (= (-> (merge
                      @user-defaults
                      {:email       "rasta@metabase.com"
                       :first_name  "Rasta"
                       :last_name   "Toucan"
                       :common_name "Rasta Toucan"})
                     (dissoc :is_qbnewb :last_login))
                 (-> resp
                     mt/boolean-ids-and-timestamps
                     (dissoc :is_qbnewb :last_login :user_group_memberships))))))

      (testing "We should get a 404 when trying to access a disabled account"
        (is (= "Not found."
               (mt/user-http-request :crowberto :get 404 (str "user/" (mt/user->id :trashbird)))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Creating a new User -- POST /api/user                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest create-user-test
  (testing "POST /api/user"
    (testing "Test that we can create a new User"
      (premium-features-test/with-premium-features #{}
        (let [user-name (mt/random-name)
              email     (mt/random-email)]
          (mt/with-model-cleanup [User]
            (mt/with-fake-inbox
              (let [resp (mt/user-http-request :crowberto :post 200 "user"
                                               {:first_name       user-name
                                                :last_name        user-name
                                                :email            email
                                                :login_attributes {:test "value"}})]
                (is (= (merge @user-defaults
                              (merge
                               @user-defaults
                               {:email                  email
                                :first_name             user-name
                                :last_name              user-name
                                :common_name            (str user-name " " user-name)
                                :login_attributes       {:test "value"}}))
                       (-> resp
                           mt/boolean-ids-and-timestamps
                           (dissoc :user_group_memberships))))
                (is (= [{:id (:id (perms-group/all-users))}]
                       (:user_group_memberships resp)))))))))

    (testing "Check that non-superusers are denied access"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "user"
                                   {:first_name "whatever"
                                    :last_name  "whatever"
                                    :email      "whatever@whatever.com"}))))

    (testing "Attempting to create a new user with the same email as an existing user should fail"
      (is (=? {:errors {:email "Email address already in use."}}
              (mt/user-http-request :crowberto :post 400 "user"
                                    {:first_name "Something"
                                     :last_name  "Random"
                                     :email      (:email (mt/fetch-user :rasta))}))))))

(deftest create-user-validate-input-test
  (testing "POST /api/user"
    (testing "Test input validations"
      (is (=? {:errors {:email "value must be a valid email address."}}
              (mt/user-http-request :crowberto :post 400 "user"
                                    {:first_name "whatever"
                                     :last_name  "whatever"})))

      (is (=? {:errors {:email "value must be a valid email address."}}
              (mt/user-http-request :crowberto :post 400 "user"
                                    {:first_name "whatever"
                                     :last_name  "whatever"
                                     :email      "whatever"}))))))

(defn- do-with-temp-user-email [f]
  (let [email (mt/random-email)]
    (try
      (f email)
      (finally (t2/delete! User :email email)))))

(defmacro ^:private with-temp-user-email [[email-binding] & body]
  `(do-with-temp-user-email (fn [~email-binding] ~@body)))

(deftest create-user-set-groups-test
  (testing "POST /api/user"
    (testing "we should be able to put a User in groups the same time we create them"
      (mt/with-temp [PermissionsGroup group-1 {:name "Group 1"}
                     PermissionsGroup group-2 {:name "Group 2"}]
        (with-temp-user-email [email]
          (mt/user-http-request :crowberto :post 200 "user"
                                {:first_name             "Cam"
                                 :last_name              "Era"
                                 :email                  email
                                 :user_group_memberships (group-or-ids->user-group-memberships
                                                          [(perms-group/all-users) group-1 group-2])})
          (is (= #{"All Users" "Group 1" "Group 2"}
                 (user-test/user-group-names (t2/select-one User :email email)))))))

    (testing (str "If you forget the All Users group it should fail, because you cannot have a User that's not in the "
                  "All Users group. The whole API call should fail and no user should be created, even though the "
                  "permissions groups get set after the User is created")
      (mt/with-temp! [PermissionsGroup group {:name "Group"}]
        (with-temp-user-email [email]
          (mt/user-http-request :crowberto :post 400 "user"
                                {:first_name             "Cam"
                                 :last_name              "Era"
                                 :email                  email
                                 :user_group_memberships (group-or-ids->user-group-memberships [group])})
          (is (= false
                 (t2/exists? User :%lower.email (u/lower-case-en email)))))))))

(defn- superuser-and-admin-pgm-info [email]
  {:is-superuser? (t2/select-one-fn :is_superuser User :%lower.email (u/lower-case-en email))
   :pgm-exists?   (t2/exists? PermissionsGroupMembership
                    :user_id  (t2/select-one-pk User :%lower.email (u/lower-case-en email))
                    :group_id (u/the-id (perms-group/admin)))})

(deftest create-user-add-to-admin-group-test
  (testing "POST /api/user"
    (testing (str "We should be able to put someone in the Admin group when we create them by including the admin "
                  "group in group_ids")
      (with-temp-user-email [email]
        (mt/user-http-request :crowberto :post 200 "user"
                              {:first_name             "Cam"
                               :last_name              "Era"
                               :email                  email
                               :user_group_memberships (group-or-ids->user-group-memberships
                                                        [(perms-group/all-users) (perms-group/admin)])})
        (is (= {:is-superuser? true, :pgm-exists? true}
               (superuser-and-admin-pgm-info email)))))

    (testing (str "for whatever reason we don't let you set is_superuser in the POST endpoint so if someone tries to "
                  "pass that it should get ignored")
      (with-temp-user-email [email]
        (mt/user-http-request :crowberto :post 200 "user"
                              {:first_name   "Cam"
                               :last_name    "Era"
                               :email        email
                               :is_superuser true})
        (is (= {:is-superuser? false, :pgm-exists? false}
               (superuser-and-admin-pgm-info email)))))))

(deftest create-user-mixed-case-email
  (testing "POST /api/user/:id"
    (testing "can create a new User with a mixed case email and the email is normalized to lower case"
      (let [user-name (mt/random-name)
            email     (mt/random-email)]
        (is (= email
               (:email (mt/with-fake-inbox
                         (try
                           (mt/boolean-ids-and-timestamps
                            (mt/user-http-request :crowberto :post 200 "user"
                                                  {:first_name       user-name
                                                   :last_name        user-name
                                                   :email            (u/upper-case-en email)
                                                   :login_attributes {:test "value"}}))
                           (finally
                             ;; clean up after ourselves
                             (t2/delete! User :email email)))))))))

    (testing "attempting to create a new user with an email with case mutations of an existing email should fail"
      (is (=? {:errors {:email "Email address already in use."}}
              (mt/user-http-request :crowberto :post 400 "user"
                                    {:first_name "Something"
                                     :last_name  "Random"
                                     :email      (u/upper-case-en (:email (mt/fetch-user :rasta)))}))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Updating a User -- PUT /api/user/:id                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(mi/define-simple-hydration-method include-personal-collection-name
  ::personal-collection-name
  "Hydrate `::personal-collection-name`. This is just for tests."
  [user]
  (t2/select-one-fn :name Collection :id (:personal_collection_id user)))

(deftest admin-update-other-user-test
  (testing "PUT /api/user/:id"
    (testing "test that admins can edit other Users\n"
      (mt/with-temp [User {user-id :id} {:first_name   "Cam"
                                         :last_name    "Era"
                                         :email        "cam.era@metabase.com"
                                         :is_superuser true}
                     Collection _ {}]
        (letfn [(user [] (into {} (-> (t2/select-one [User :id :first_name :last_name :is_superuser :email], :id user-id)
                                      (t2/hydrate :personal_collection_id ::personal-collection-name)
                                      (dissoc :id :personal_collection_id :common_name))))]
          (testing "before API call"
            (is (= {:first_name                "Cam"
                    :last_name                 "Era"
                    :is_superuser              true
                    :email                     "cam.era@metabase.com"
                    ::personal-collection-name "Cam Era's Personal Collection"}
                   (user))))
          (testing "response"
            (let [resp (mt/user-http-request :crowberto :put 200 (str "user/" user-id)
                                             {:last_name "Eron"
                                              :email     "cam.eron@metabase.com"})]
              (is (= (group-or-ids->user-group-memberships [(perms-group/all-users)
                                                            (perms-group/admin)])
                     (:user_group_memberships resp)))
              (is (= (merge
                      @user-defaults
                      {:common_name  "Cam Eron"
                       :email        "cam.eron@metabase.com"
                       :first_name   "Cam"
                       :last_name    "Eron"
                       :is_superuser true})
                     (-> (mt/user-http-request :crowberto :put 200 (str "user/" user-id)
                                               {:last_name "Eron"
                                                :email     "cam.eron@metabase.com"})
                         (dissoc :user_group_memberships)
                         mt/boolean-ids-and-timestamps)))))
          (testing "after API call"
            (is (= {:first_name                "Cam"
                    :last_name                 "Eron"
                    :is_superuser              true
                    :email                     "cam.eron@metabase.com"
                    ::personal-collection-name "Cam Eron's Personal Collection"}
                   (user)))))))))

(deftest update-login-attributes-test
  (testing "PUT /api/user/:id"
    (testing "Test that we can update login attributes after a user has been created"
      (t2.with-temp/with-temp [User {user-id :id} {:first_name   "Test"
                                                   :last_name    "User"
                                                   :email        "testuser@metabase.com"
                                                   :is_superuser true}]
        (is (= (merge
                @user-defaults
                {:is_superuser           true
                 :email                  "testuser@metabase.com"
                 :first_name             "Test"
                 :login_attributes       {:test "value"}
                 :common_name            "Test User"
                 :last_name              "User"})
               (-> (mt/user-http-request :crowberto :put 200 (str "user/" user-id)
                                         {:email            "testuser@metabase.com"
                                          :login_attributes {:test "value"}})
                   (dissoc :user_group_memberships)
                   mt/boolean-ids-and-timestamps)))))))

(deftest updated-user-name-test
  (testing "Test that `metabase.api.user/updated-user-name` works as intended."
    (let [names     {:first_name "Test" :last_name "User"} ;; in a real user map, `:first_name` and `:last_name` will always be present
          nonames   {:first_name nil :last_name nil}
          firstname {:first_name "Test" :last_name nil}
          lastname  {:first_name nil :last_name "User"}]
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
      (t2.with-temp/with-temp [User {user-id :id} {:first_name   "Blue Ape"
                                                   :last_name    "Ron"
                                                   :email        "blueronny@metabase.com"
                                                   :is_superuser true}]
        (letfn [(change-user-via-api! [m]
                  (-> (mt/user-http-request :crowberto :put 200 (str "user/" user-id) m)
                      (t2/hydrate :personal_collection_id ::personal-collection-name)
                      (dissoc :user_group_memberships :personal_collection_id :email :is_superuser)
                      (#(apply (partial dissoc %) (keys @user-defaults)))
                      mt/boolean-ids-and-timestamps))]
          (testing "Name keys ommitted does not update the user"
            (is (= {:first_name                "Blue Ape"
                    :last_name                 "Ron"
                    :common_name               "Blue Ape Ron"
                    ::personal-collection-name "Blue Ape Ron's Personal Collection"}
                   (change-user-via-api! {}))))
          (testing "Name keys having the same values does not update the user"
            (is (= {:first_name                "Blue Ape"
                    :last_name                 "Ron"
                    :common_name               "Blue Ape Ron"
                    ::personal-collection-name "Blue Ape Ron's Personal Collection"}
                   (change-user-via-api! {:first_name "Blue Ape"
                                          :last_name  "Ron"}))))
          (testing "Name keys explicitly set to `nil` updates the user"
            (is (= {:first_name                nil
                    :last_name                 nil
                    :common_name               "blueronny@metabase.com"
                    ::personal-collection-name "blueronny@metabase.com's Personal Collection"}
                   (change-user-via-api! {:first_name nil
                                          :last_name  nil}))))
          (testing "Nil keys compare correctly with nil names and cause no change."
            (is (= {:first_name                nil
                    :last_name                 nil
                    :common_name               "blueronny@metabase.com"
                    ::personal-collection-name "blueronny@metabase.com's Personal Collection"}
                   (change-user-via-api! {:first_name nil
                                          :last_name  nil}))))
          (testing "First/last_name keys are sent but one is unchanged, updates only the altered key for the user"
            (is (= {:first_name                nil
                    :last_name                 "Apron"
                    :common_name               "Apron"
                    ::personal-collection-name "Apron's Personal Collection"}
                   (change-user-via-api! {:first_name nil
                                          :last_name  "Apron"}))))
          (testing "Both new name keys update the user"
            (is (= {:first_name                "Blue"
                    :last_name                 nil
                    :common_name               "Blue"
                    ::personal-collection-name "Blue's Personal Collection"}
                   (change-user-via-api! {:first_name "Blue"
                                          :last_name  nil})))))))))

(deftest update-sso-user-test
  (testing "PUT /api/user/:id"
    (testing "Test that we do not update a user's first and last names if they are an SSO user."
      (t2.with-temp/with-temp [User {user-id :id} {:first_name   "SSO"
                                                   :last_name    "User"
                                                   :email        "sso-user@metabase.com"
                                                   :sso_source   :jwt
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
            (is (partial= {:first_name "SSO" :last_name  "User"}
                          (change-user-via-api! 200 {:first_name "SSO" :last_name  "User"})))))))))

(deftest update-email-check-if-already-used-test
  (testing "PUT /api/user/:id"
    (testing "test that updating a user's email to an existing inactive user's email fails"
      (let [trashbird (mt/fetch-user :trashbird)
            rasta     (mt/fetch-user :rasta)]
        (is (=? {:errors {:email "Email address already associated to another user."}}
                (mt/user-http-request :crowberto :put 400 (str "user/" (u/the-id rasta))
                                      (select-keys trashbird [:email]))))))))

(deftest update-existing-email-case-mutation-test
  (testing "PUT /api/user/:id"
    (testing "test that updating a user's email to an an existing inactive email by mutating case fails"
      (let [trashbird         (mt/fetch-user :trashbird)
            rasta             (mt/fetch-user :rasta)
            trashbird-mutated (update trashbird :email u/upper-case-en)]
        (is (=? {:errors {:email "Email address already associated to another user."}}
                (mt/user-http-request :crowberto :put 400 (str "user/" (u/the-id rasta))
                                      (select-keys trashbird-mutated [:email]))))))))

(deftest update-superuser-status-test
  (testing "PUT /api/user/:id"
    (testing "Test that a normal user cannot change the :is_superuser flag for themselves"
      (letfn [(fetch-rasta []
                (t2/select-one [User :first_name :last_name :is_superuser :email], :id (mt/user->id :rasta)))]
        (let [before (fetch-rasta)]
          (mt/user-http-request :rasta :put 200 (str "user/" (mt/user->id :rasta))
                                (assoc (fetch-rasta) :is_superuser true))
          (is (= before
                 (fetch-rasta))))))))

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
      (t2.with-temp/with-temp [User user {:email       "anemail@metabase.com"
                                          :password    "def123"
                                          :sso_source  "google"}]
        (let [creds {:username "anemail@metabase.com"
                     :password "def123"}]
          (is (= "You don't have permissions to do that."
                 (client/client creds :put 403 (format "user/%d" (u/the-id user))
                                {:email "adifferentemail@metabase.com"}))))))

    (testing (str "Similar to Google auth accounts, we should not allow LDAP users to change their own email address "
                  "as we get that from the LDAP server")
      (t2.with-temp/with-temp [User user {:email     "anemail@metabase.com"
                                          :password  "def123"
                                          :sso_source "ldap"}]
        (let [creds {:username "anemail@metabase.com"
                     :password "def123"}]
          (is (= "You don't have permissions to do that."
                 (client/client creds :put 403 (format "user/%d" (u/the-id user))
                                {:email "adifferentemail@metabase.com"}))))))))

(defn- do-with-preserved-rasta-personal-collection-name [thunk]
  (let [{collection-name :name, :keys [slug id]} (collection/user->personal-collection (mt/user->id :rasta))]
    (mt/with-temp-vals-in-db Collection id {:name collection-name, :slug slug}
      (thunk))))

(defmacro ^:private with-preserved-rasta-personal-collection-name
  "Preserve the name of Rasta's personal collection inside a body that might cause it to change (e.g. changing user name
  via the API.)"
  [& body]
  `(do-with-preserved-rasta-personal-collection-name (fn [] ~@body)))

(deftest update-groups-test
  (testing "PUT /api/user/:id"
    (testing "Check that we can update the groups a User belongs to -- if we are a superuser"
      (mt/with-temp [User             user {}
                     PermissionsGroup group {:name "Blue Man Group"}]
        (mt/user-http-request :crowberto :put 200 (str "user/" (u/the-id user))
                              {:user_group_memberships (group-or-ids->user-group-memberships [(perms-group/all-users) group])})
        (is (= #{"All Users" "Blue Man Group"}
               (user-test/user-group-names user)))))

    (testing "if we pass user_group_memberships, and are updating ourselves as a non-superuser, the entire call should fail"
      ;; By wrapping the test in this macro even if the test fails it will restore the original values
      (mt/with-temp-vals-in-db User (mt/user->id :rasta) {:first_name "Rasta"}
        (mt/with-ensure-with-temp-no-transaction!
          (with-preserved-rasta-personal-collection-name
            (t2.with-temp/with-temp [PermissionsGroup group {:name "Blue Man Group"}]
              (mt/user-http-request :rasta :put 403 (str "user/" (mt/user->id :rasta))
                                    {:user_group_memberships (group-or-ids->user-group-memberships [(perms-group/all-users) group])
                                     :first_name             "Reggae"}))))
        (testing "groups"
          (is (= #{"All Users"}
                 (user-test/user-group-names (mt/user->id :rasta)))))
        (testing "first name"
          (is (= "Rasta"
                 (t2/select-one-fn :first_name User :id (mt/user->id :rasta)))))))

    (testing "if we pass user_group_memberships as a non-superuser the call should succeed, so long as the value doesn't change"
      (mt/with-temp-vals-in-db User (mt/user->id :rasta) {:first_name "Rasta"}
        (with-preserved-rasta-personal-collection-name
          (mt/user-http-request :rasta :put 200 (str "user/" (mt/user->id :rasta))
                                {:user_group_memberships (group-or-ids->user-group-memberships [(perms-group/all-users)])
                                 :first_name             "Reggae"}))
        (testing "groups"
          (is (= #{"All Users"}
                 (user-test/user-group-names (mt/user->id :rasta)))))
        (testing "first name"
          (is (= "Reggae"
                 (t2/select-one-fn :first_name User :id (mt/user->id :rasta)))))))

    (testing (str "We should be able to put someone in the Admin group when we update them them (is_superuser = TRUE "
                  "and user_group_memberships including admin group ID)")
      (t2.with-temp/with-temp [User {:keys [email id]}]
        (mt/user-http-request :crowberto :put 200 (str "user/" id)
                              {:is_superuser           true
                               :user_group_memberships (group-or-ids->user-group-memberships [(perms-group/all-users) (perms-group/admin)])})
        (is (= {:is-superuser? true, :pgm-exists? true}
               (superuser-and-admin-pgm-info email)))))

    (testing (str "if we try to create a new user with is_superuser FALSE but user_group_memberships that includes the Admin group "
                  "ID, the entire call should fail")
      (mt/with-temp! [User {:keys [email id]} {:first_name "Old First Name"}]
        (mt/user-http-request :crowberto :put 400 (str "user/" id)
                              {:is_superuser           false
                               :user_group_memberships (group-or-ids->user-group-memberships [(perms-group/all-users) (perms-group/admin)])
                               :first_name             "Cool New First Name"})
        (is (= {:is-superuser? false, :pgm-exists? false, :first-name "Old First Name"}
               (assoc (superuser-and-admin-pgm-info email)
                      :first-name (t2/select-one-fn :first_name User :id id))))))

    (testing (str "if we try to create a new user with is_superuser TRUE but user_group_memberships that does not include the Admin "
                  "group ID, things should fail")
      (mt/with-temp! [User {:keys [email id]}]
        (mt/user-http-request :crowberto :put 400 (str "user/" id)
                              {:is_superuser           true
                               :user_group_memberships (group-or-ids->user-group-memberships [(perms-group/all-users)])})
        (is (= {:is-superuser? false, :pgm-exists? false}
               (superuser-and-admin-pgm-info email)))))

    (testing "if we PUT a user with is_superuser TRUE but don't specify user_group_memberships, we should be ok"
      (t2.with-temp/with-temp [User {:keys [email id]}]
        (mt/user-http-request :crowberto :put 200 (str "user/" id)
                              {:is_superuser true})
        (is (= {:is-superuser? true, :pgm-exists? true}
               (superuser-and-admin-pgm-info email)))))

    (testing "if we include Admin in user_group_memberships but don't specify is_superuser we should be ok"
      (t2.with-temp/with-temp [User {:keys [email id]}]
        (mt/user-http-request :crowberto :put 200 (str "user/" id)
                              {:user_group_memberships (group-or-ids->user-group-memberships [(perms-group/all-users) (perms-group/admin)])})
        (is (= {:is-superuser? true, :pgm-exists? true}
               (superuser-and-admin-pgm-info email))))))

  (testing "Double-check that the test cleaned up after itself"
    (is (= "Rasta"
           (t2/select-one-fn :first_name User :id (mt/user->id :rasta))))
    (is (= {:name "Rasta Toucan's Personal Collection"
            :slug "rasta_toucan_s_personal_collection"}
           (mt/derecordize (t2/select-one [Collection :name :slug] :personal_owner_id (mt/user->id :rasta)))))))

(deftest update-locale-test
  (testing "PUT /api/user/:id\n"
    (t2.with-temp/with-temp [User {user-id :id, email :email} {:password "p@ssw0rd"}]
      (letfn [(set-locale! [expected-status-code new-locale]
                (mt/client {:username email, :password "p@ssw0rd"}
                           :put expected-status-code (str "user/" user-id)
                           {:locale new-locale}))
              (locale-from-db []
                (t2/select-one-fn :locale User :id user-id))]
        (let [url (str "user/" user-id)]
          (testing "normal Users should be able to update their own locale"
            (doseq [[message locale] {"to a language-country locale (with dash)"       "es-MX"
                                      "to a language-country locale (with underscore)" "es_MX"
                                      "to a language-only locale"                      "es"
                                      "to `nil` (use system default)"                  nil}]
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
            (doseq [[group locales] {"invalid input"              [nil "" 100 "ab/cd" "USA!"]
                                     "3-letter codes"             ["eng" "eng-USA"]
                                     "languages that don't exist" ["zz" "xx" "xx-yy"]}
                    new-locale      locales]
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
      (t2.with-temp/with-temp [User user {:is_active false}]
        ;; now try creating the same user again, should re-activiate the original
        (mt/user-http-request :crowberto :put 200 (format "user/%s/reactivate" (u/the-id user))
                              {:first_name (:first_name user)
                               :last_name  "whatever"
                               :email      (:email user)})
        (is (= true
               (t2/select-one-fn :is_active User :id (:id user)))
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
                                         google-auth-enabled    true]
        (t2.with-temp/with-temp [User user {:sso_source :google}]
          (t2/update! User (u/the-id user)
                      {:is_active false})
          (mt/with-temporary-setting-values [google-auth-enabled false]
            (mt/user-http-request :crowberto :put 200 (format "user/%s/reactivate" (u/the-id user)))
            (is (= {:is_active true, :sso_source nil}
                   (mt/derecordize (t2/select-one [User :is_active :sso_source] :id (u/the-id user)))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                               Updating a Password -- PUT /api/user/:id/password                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- user-can-reset-password? [superuser?]
  (t2.with-temp/with-temp [User user {:password "def", :is_superuser (boolean superuser?)}]
    (let [creds           {:username (:email user), :password "def"}
          hashed-password (t2/select-one-fn :password User, :%lower.email (u/lower-case-en (:email user)))]
      ;; use API to reset the users password
      (mt/client creds :put 200 (format "user/%d/password" (:id user)) {:password     "abc123!!DEF"
                                                                        :old_password "def"})
      ;; now simply grab the lastest pass from the db and compare to the one we have from before reset
      (not= hashed-password (t2/select-one-fn :password User, :%lower.email (u/lower-case-en (:email user)))))))

(deftest can-reset-password-test
  (testing "PUT /api/user/:id/password"
    (testing "Test that we can reset our own password. If user is a"
      (testing "superuser"
        (is (= true
               (user-can-reset-password? :superuser))))
      (testing "non-superuser"
        (is (= true
               (user-can-reset-password? (not :superuser))))))))

(deftest reset-password-permissions-test
  (testing "PUT /api/user/:id/password"
    (testing "Check that a non-superuser CANNOT update someone else's password"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (format "user/%d/password" (mt/user->id :trashbird))
                                   {:password     "whateverUP12!!"
                                    :old_password "whatever"}))))))

(deftest reset-password-input-validation-test
  (testing "PUT /api/user/:id/password"
    (testing "Test input validations on password change"
      (is (=? {:errors {:password "password is too common."}}
              (mt/user-http-request :rasta :put 400 (format "user/%d/password" (mt/user->id :rasta)) {}))))

    (testing "Make sure that if current password doesn't match we get a 400"
      (is (=? {:errors {:old_password "Invalid password"}}
              (mt/user-http-request :rasta :put 400 (format "user/%d/password" (mt/user->id :rasta))
                                    {:password     "whateverUP12!!"
                                     :old_password "mismatched"}))))))

(deftest reset-password-session-test
  (testing "PUT /api/user/:id/password"
    (testing "Test that we return a session if we are changing our own password"
      (t2.with-temp/with-temp [User user {:password "def", :is_superuser false}]
        (let [creds {:username (:email user), :password "def"}]
          (is (=? {:session_id mt/is-uuid-string?
                   :success    true}
                  (mt/client creds :put 200 (format "user/%d/password" (:id user)) {:password     "abc123!!DEF"
                                                                                    :old_password "def"}))))))

    (testing "Test that we don't return a session if we are changing our someone else's password as a superuser"
      (t2.with-temp/with-temp [User user {:password "def", :is_superuser false}]
        (is (nil? (mt/user-http-request :crowberto :put 204 (format "user/%d/password" (:id user)) {:password     "abc123!!DEF"
                                                                                                    :old_password "def"})))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                             Deleting (Deactivating) a User -- DELETE /api/user/:id                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest deactivate-user-test
  (testing "DELETE /api/user/:id"
    (t2.with-temp/with-temp [User user]
      (is (= {:success true}
             (mt/user-http-request :crowberto :delete 200 (format "user/%d" (:id user)) {})))

      (testing "User should still exist, but be inactive"
        (is (= {:is_active false}
               (mt/derecordize (t2/select-one [User :is_active] :id (:id user)))))))

    (testing "Check that the last superuser cannot deactivate themselves"
      (mt/with-single-admin-user [{id :id}]
        (is (= "You cannot remove the last member of the 'Admin' group!"
               (mt/user-http-request id :delete 400 (format "user/%d" id))))))

    (testing "Check that the last non-archived superuser cannot deactivate themselves"
      (mt/with-single-admin-user [{id :id}]
        (t2.with-temp/with-temp [User _ {:is_active    false
                                         :is_superuser true}]
          (is (= "You cannot remove the last member of the 'Admin' group!"
                 (mt/user-http-request id :delete 400 (format "user/%d" id)))))))

    (testing "Check that a non-superuser CANNOT deactivate themselves"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :delete 403 (format "user/%d" (mt/user->id :rasta)) {}))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                  Other Endpoints -- PUT /api/user/:id/qpnewb, POST /api/user/:id/send_invite                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-user-modal-test
  (doseq [[endpoint property] [["qbnewb" :is_qbnewb]
                               ["datasetnewb" :is_datasetnewb]]]
    (testing (str "PUT /api/user/:id/modal/" endpoint)
      (testing "Test that we can set the QB newb status of ourselves"
        (t2.with-temp/with-temp [User {:keys [id]} {:first_name (mt/random-name)
                                                    :last_name  (mt/random-name)
                                                    :email      "def@metabase.com"
                                                    :password   "def123"}]
          (let [creds {:username "def@metabase.com"
                       :password "def123"}]
            (testing "defaults to true"
              (is (true? (t2/select-one-fn property User, :id id))))
            (testing "response"
              (is (= {:success true}
                     (mt/client creds :put 200 (format "user/%d/modal/%s" id endpoint)))))
            (testing (str endpoint "?")
              (is (false? (t2/select-one-fn property User, :id id)))))))

      (testing "shouldn't be allowed to set someone else's status"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403
                                     (format "user/%d/modal/%s"
                                             (mt/user->id :trashbird)
                                             endpoint))))))))

(deftest send-invite-test
  (testing "POST /api/user/:id/send_invite"
    (testing "Check that non-superusers are denied access to resending invites"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 (format "user/%d/send_invite" (mt/user->id :crowberto))))))))

(deftest user-activate-deactivate-event-test
  (testing "User Deactivate/Reactivate events via the API are recorded in the audit log"
    (premium-features-test/with-premium-features #{:audit-app}
      (t2.with-temp/with-temp [User {:keys [id]} {:first_name "John"
                                                  :last_name  "Cena"}]
        (testing "DELETE /api/user/:id and PUT /api/user/:id/reactivate"
          (mt/user-http-request :crowberto :delete 200 (format "user/%s" id))
          (mt/user-http-request :crowberto :put 200 (format "user/%s/reactivate" id))
          (is (= [{:topic    :user-deactivated
                   :user_id  (mt/user->id :crowberto)
                   :model    "User"
                   :model_id id
                   :details  {}}
                  {:topic    :user-reactivated
                   :user_id  (mt/user->id :crowberto)
                   :model    "User"
                   :model_id id
                   :details  {}}]
                 [(mt/latest-audit-log-entry :user-deactivated id)
                  (mt/latest-audit-log-entry :user-reactivated id)])))))))

(deftest user-update-event-test
  (testing "User Updates via the API are recorded in the audit log"
    (t2.with-temp/with-temp [User {:keys [id]} {:first_name "John"
                                                :last_name  "Cena"}]
      (premium-features-test/with-premium-features #{:audit-app}
        (testing "PUT /api/user/:id"
          (mt/user-http-request :crowberto :put 200 (format "user/%s" id)
                                {:first_name "Johnny" :last_name "Appleseed"})
          (is (= {:topic    :user-update
                  :user_id  (mt/user->id :crowberto)
                  :model    "User"
                  :model_id id
                  :details  {:new {:first_name "Johnny"
                                   :last_name "Appleseed"}
                             :previous {:first_name "John"
                                        :last_name "Cena"}}}
                 (mt/latest-audit-log-entry :user-update id))))))))

(ns metabase.models.user-test
  (:require [clojure
             [set :as set]
             [string :as str]
             [test :refer :all]]
            [metabase
             [email-test :as email-test]
             [http-client :as http]
             [test :as mt]
             [util :as u]]
            [metabase.models
             [collection :as collection :refer [Collection]]
             [collection-test :as collection-test]
             [permissions :as perms]
             [permissions-group :as group :refer [PermissionsGroup]]
             [permissions-group-membership :refer [PermissionsGroupMembership]]
             [session :refer [Session]]
             [user :as user :refer [User]]]
            [metabase.test.data.users :as test-users]
            [metabase.util.password :as u.password]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

;;; Tests for permissions-set

(deftest check-test-users-have-valid-permissions-sets-test
  (testing "Make sure the test users have valid permissions sets"
    (doseq [user [:rasta :crowberto :lucky :trashbird]]
      (testing user
        (is (= true
               (perms/is-permissions-set? (user/permissions-set (mt/user->id user)))))))))

(deftest group-with-no-permissions-test
  (testing (str "Adding a group with *no* permissions shouldn't suddenly break all the permissions sets (This was a "
                "bug @tom found where a group with no permissions would cause the permissions set to contain `nil`).")
    (mt/with-temp* [PermissionsGroup           [{group-id :id}]
                    PermissionsGroupMembership [_              {:group_id group-id, :user_id (mt/user->id :rasta)}]]
      (is (= true
             (perms/is-permissions-set? (user/permissions-set (mt/user->id :rasta))))))))

(defn- remove-non-collection-perms [perms-set]
  (set (for [perms-path perms-set
             :when      (str/starts-with? perms-path "/collection/")]
         perms-path)))

(deftest personal-collection-permissions-test
  (testing "Does permissions-set include permissions for my Personal Collection?"
    (mt/with-non-admin-groups-no-root-collection-perms
      (is (contains?
           (user/permissions-set (mt/user->id :lucky))
           (perms/collection-readwrite-path (collection/user->personal-collection (mt/user->id :lucky)))))

      (testing "...and for any descendant Collections of my Personal Collection?"
        (mt/with-temp* [Collection [child-collection      {:name     "child"
                                                           :location (collection/children-location
                                                                      (collection/user->personal-collection (mt/user->id :lucky)))}]
                        Collection [grandchild-collection {:name     "grandchild"
                                                           :location (collection/children-location child-collection)}]]
          (is (set/subset?
               #{(perms/collection-readwrite-path (collection/user->personal-collection (mt/user->id :lucky)))
                 "/collection/child/"
                 "/collection/grandchild/"}
               (->> (user/permissions-set (mt/user->id :lucky))
                    remove-non-collection-perms
                    (collection-test/perms-path-ids->names [child-collection grandchild-collection])))))))))

;;; Tests for invite-user and create-new-google-auth-user!

(defn- maybe-accept-invite!
  "Accept an invite if applicable. Look in the body of the content of the invite email for the reset token since this is
  the only place to get it (the token stored in the DB is an encrypted hash)."
  [new-user-email-address]
  (when-let [[{[{invite-email :content}] :body}] (get @email-test/inbox new-user-email-address)]
    (let [[_ reset-token] (re-find #"/auth/reset_password/(\d+_[\w_-]+)#new" invite-email)]
      (http/client :post 200 "session/reset_password" {:token    reset-token
                                                       :password "ABC123"}))))

(defn sent-emails
  "Fetch the emails that have been sent in the form of a map of email address -> sequence of email subjects.
  For test-writing convenience the random email and names assigned to the new user are replaced with `<New User>`."
  [new-user-email-address new-user-first-name new-user-last-name]
  (into {} (for [[address emails] @email-test/inbox
                 :let             [address (if (= address new-user-email-address)
                                             "<New User>"
                                             address)]]
             [address (for [{subject :subject} emails]
                        (str/replace subject (str new-user-first-name " " new-user-last-name) "<New User>"))])))


(defn- invite-user-accept-and-check-inboxes!
  "Create user by passing `invite-user-args` to `create-and-invite-user!` or `create-new-google-auth-user!`,
  and return a map of addresses emails were sent to to the email subjects."
  [& {:keys [google-auth? accept-invite? password invitor]
      :or   {accept-invite? true}}]
  (mt/with-temporary-setting-values [site-name "Metabase"]
    (email-test/with-fake-inbox
      (let [new-user-email      (mt/random-email)
            new-user-first-name (mt/random-name)
            new-user-last-name  (mt/random-name)
            new-user            {:first_name new-user-first-name
                                 :last_name  new-user-last-name
                                 :email      new-user-email
                                 :password   password}]
        (try
          (if google-auth?
            (user/create-new-google-auth-user! (dissoc new-user :password))
            (user/create-and-invite-user! new-user invitor))
          (when accept-invite?
            (maybe-accept-invite! new-user-email))
          (sent-emails new-user-email new-user-first-name new-user-last-name)
          ;; Clean up after ourselves
          (finally
            (db/delete! User :email new-user-email)))))))

(def ^:private default-invitor
  {:email "crowberto@metabase.com", :is_active true, :first_name "Crowberto"})

;; admin shouldn't get email saying user joined until they accept the invite (i.e., reset their password)

(deftest new-user-emails-test
  (testing "New user should get an invite email"
    (is (= {"<New User>" ["You're invited to join Metabase's Metabase"]}
           (invite-user-accept-and-check-inboxes! :invitor default-invitor, :accept-invite? false))))

  (testing "admin should get an email when a new user joins..."
    (is (= {"<New User>"             ["You're invited to join Metabase's Metabase"]
            "crowberto@metabase.com" ["<New User> accepted their Metabase invite"]}
           (-> (invite-user-accept-and-check-inboxes! :invitor default-invitor)
               (select-keys ["<New User>" "crowberto@metabase.com"]))))

    (testing "...including the site admin if it is set..."
      (mt/with-temporary-setting-values [admin-email "cam2@metabase.com"]
        (is (= {"<New User>"             ["You're invited to join Metabase's Metabase"]
                "crowberto@metabase.com" ["<New User> accepted their Metabase invite"]
                "cam2@metabase.com"      ["<New User> accepted their Metabase invite"]}
               (-> (invite-user-accept-and-check-inboxes! :invitor default-invitor)
                   (select-keys ["<New User>" "crowberto@metabase.com" "cam2@metabase.com"])))))

      (testing "... but if that admin is inactive they shouldn't get an email"
        (mt/with-temp User [inactive-admin {:is_superuser true, :is_active false}]
          (is (= {"<New User>"             ["You're invited to join Metabase's Metabase"]
                  "crowberto@metabase.com" ["<New User> accepted their Metabase invite"]}
                 (-> (invite-user-accept-and-check-inboxes! :invitor (assoc inactive-admin :is_active false))
                     (select-keys ["<New User>" "crowberto@metabase.com" (:email inactive-admin)]))))))))

  (testing "for google auth, all admins should get an email..."
    (mt/with-temp User [_ {:is_superuser true, :email "some_other_admin@metabase.com"}]
      (is (= {"crowberto@metabase.com"        ["<New User> created a Metabase account"]
              "some_other_admin@metabase.com" ["<New User> created a Metabase account"]}
             (-> (invite-user-accept-and-check-inboxes! :google-auth? true)
                 (select-keys ["crowberto@metabase.com" "some_other_admin@metabase.com"])))))

    (testing "...including the site admin if it is set..."
      (mt/with-temporary-setting-values [admin-email "cam2@metabase.com"]
        (mt/with-temp User [_ {:is_superuser true, :email "some_other_admin@metabase.com"}]
          (is (= {"crowberto@metabase.com"        ["<New User> created a Metabase account"]
                  "some_other_admin@metabase.com" ["<New User> created a Metabase account"]
                  "cam2@metabase.com"             ["<New User> created a Metabase account"]}
                 (-> (invite-user-accept-and-check-inboxes! :google-auth? true)
                     (select-keys ["crowberto@metabase.com" "some_other_admin@metabase.com" "cam2@metabase.com"]))))))

      (testing "...unless they are inactive"
        (mt/with-temp User [user {:is_superuser true, :is_active false}]
          (is (= {"crowberto@metabase.com" ["<New User> created a Metabase account"]}
                 (-> (invite-user-accept-and-check-inboxes! :google-auth? true)
                     (select-keys ["crowberto@metabase.com" (:email user)])))))))))

(deftest ldap-user-passwords-test
  (testing (str "LDAP users should not persist their passwords. Check that if somehow we get passed an LDAP user "
                "password, it gets swapped with something random")
    (try
      (user/create-new-ldap-auth-user! {:email      "ldaptest@metabase.com"
                                        :first_name "Test"
                                        :last_name  "SomeLdapStuff"
                                        :password   "should be removed"})
      (let [{:keys [password password_salt]} (db/select-one [User :password :password_salt] :email "ldaptest@metabase.com")]
        (is (= false
               (u.password/verify-password "should be removed" password_salt password))))
      (finally
        (db/delete! User :email "ldaptest@metabase.com")))))

(deftest new-admin-user-test
  (testing (str "when you create a new user with `is_superuser` set to `true`, it should create a "
                "PermissionsGroupMembership object")
    (mt/with-temp User [user {:is_superuser true}]
      (is (= true
             (db/exists? PermissionsGroupMembership :user_id (u/get-id user), :group_id (u/get-id (group/admin))))))))

(deftest ldap-sequential-login-attributes-test
  (testing "You should be able to create a new LDAP user if some `login_attributes` are vectors (#10291)"
    (try
      (user/create-new-ldap-auth-user! {:email            "ldaptest@metabase.com"
                                        :first_name       "Test"
                                        :last_name        "SomeLdapStuff"
                                        :login_attributes {:local_birds ["Steller's Jay" "Mountain Chickadee"]}})
      (is (= {"local_birds" ["Steller's Jay" "Mountain Chickadee"]}
             (db/select-one-field :login_attributes User :email "ldaptest@metabase.com")))
      (finally
        (db/delete! User :email "ldaptest@metabase.com")))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            New Group IDs Functions                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn group-names [groups-or-ids]
  (when (seq groups-or-ids)
    (db/select-field :name PermissionsGroup :id [:in (map u/get-id groups-or-ids)])))

(defn- do-with-group [group-properties group-members f]
  (mt/with-temp PermissionsGroup [group group-properties]
    (doseq [member group-members]
      (db/insert! PermissionsGroupMembership
        {:group_id (u/get-id group)
         :user_id  (if (keyword? member)
                     (mt/user->id member)
                     (u/get-id member))}))
    (f group)))

(defmacro ^:private with-groups [[group-binding group-properties members & more-groups] & body]
  (if (seq more-groups)
    `(with-groups [~group-binding ~group-properties ~members]
       (with-groups ~more-groups
         ~@body))
    `(do-with-group ~group-properties ~members (fn [~group-binding] ~@body))))

(deftest group-ids-test
  (testing "the `group-ids` hydration function"
    (testing "should work as expected"
      (with-groups [_ {:name "Group 1"} #{:lucky :rasta}
                    _ {:name "Group 2"} #{:lucky}
                    _ {:name "Group 3"} #{}]
        (is (= #{"All Users" "Group 2" "Group 1"}
               (group-names (user/group-ids (mt/user->id :lucky)))))))

    (testing "should be a single DB call"
      (with-groups [_ {:name "Group 1"} #{:lucky}
                    _ {:name "Group 2"} #{:lucky}
                    _ {:name "Group 3"} #{}]
        (let [lucky-id (mt/user->id :lucky)]
          (db/with-call-counting [call-count]
            (user/group-ids lucky-id)
            (is (= 1
                   (call-count)))))))

    (testing "shouldn't barf if passed `nil`"
      (is (= nil
             (user/group-ids nil))))))

(deftest add-group-ids-test
  (testing "the `add-group-ids` hydration function"
    (testing "should do a batched hydate"
      (with-groups [_ {:name "Group 1"} #{:lucky :rasta}
                    _ {:name "Group 2"} #{:lucky}
                    _ {:name "Group 3"} #{}]
        (let [users (user/add-group-ids (map test-users/fetch-user [:lucky :rasta]))]
          (is (= {"Lucky" #{"All Users" "Group 1" "Group 2"}
                  "Rasta" #{"All Users" "Group 1"}}
                 (zipmap (map :first_name users)
                         (map (comp group-names :group_ids) users)))))))

    (testing "should be the hydrate function for `:group_ids`"
      (with-redefs [user/group-ids     (constantly '(user/group-ids <user>))
                    user/add-group-ids (fn [users]
                                         (for [user users]
                                           (assoc user :group_ids '(user/add-group-ids <users>))))]
        (testing "for a single User"
          (is (= '(user/add-group-ids <users>)
                 (-> (hydrate (User (mt/user->id :lucky)) :group_ids)
                     :group_ids))))

        (testing "for multiple Users"
          (is (= '[(user/add-group-ids <users>)
                   (user/add-group-ids <users>)]
                 (as-> (map test-users/fetch-user [:rasta :lucky]) users
                   (hydrate users :group_ids)
                   (mapv :group_ids users)))))))

    (testing "should be done in a single DB call"
      (with-groups [_ {:name "Group 1"} #{:lucky :rasta}
                    _ {:name "Group 2"} #{:lucky}
                    _ {:name "Group 3"} #{}]
        (let [users (mapv test-users/fetch-user [:lucky :rasta])]
          (db/with-call-counting [call-count]
            (dorun (user/add-group-ids users))
            (is (= 1
                   (call-count)))))))

    (testing "shouldn't barf if passed an empty seq"
      (is (= nil
             (user/add-group-ids []))))))

(defn user-group-names [user-or-id-or-kw]
  (group-names (user/group-ids (if (keyword? user-or-id-or-kw)
                                 (test-users/fetch-user user-or-id-or-kw)
                                 user-or-id-or-kw))))

(deftest set-permissions-groups-test
  (testing "set-permissions-groups!"
    (testing "should be able to add a User to new groups"
      (with-groups [group-1 {:name "Group 1"} #{}
                    group-2 {:name "Group 2"} #{}]
        (user/set-permissions-groups! (mt/user->id :lucky) #{(group/all-users) group-1 group-2})
        (is (= #{"All Users" "Group 1" "Group 2"}
               (user-group-names :lucky)))))

    (testing "should be able to remove a User from groups"
      (with-groups [group-1 {:name "Group 1"} #{:lucky}
                    group-2 {:name "Group 2"} #{:lucky}]
        (user/set-permissions-groups! (mt/user->id :lucky) #{(group/all-users)})
        (is (= #{"All Users"}
               (user-group-names :lucky)))))

    (testing "should be able to add & remove groups at the same time! :wow:"
      (with-groups [group-1 {:name "Group 1"} #{:lucky}
                    group-2 {:name "Group 2"} #{}]
        (user/set-permissions-groups! (mt/user->id :lucky) #{(group/all-users) group-2})
        (is (= #{"All Users" "Group 2"}
               (user-group-names :lucky)))))

    (testing "should throw an Exception if you attempt to remove someone from All Users"
      (with-groups [group-1 {:name "Group 1"} #{}]
        (is (thrown? Exception
                     (user/set-permissions-groups! (mt/user->id :lucky) #{group-1})))))

    (testing "should be able to add someone to the Admin group"
      (mt/with-temp User [user]
        (user/set-permissions-groups! user #{(group/all-users) (group/admin)})
        (is (= #{"Administrators" "All Users"}
               (user-group-names user)))

        (testing "their is_superuser flag should be set to true"
          (is (= true
                 (db/select-one-field :is_superuser User :id (u/get-id user)))))))

    (testing "should be able to remove someone from the Admin group"
      (mt/with-temp User [user {:is_superuser true}]
        (user/set-permissions-groups! user #{(group/all-users)})
        (is (= #{"All Users"}
               (user-group-names user)))

        (testing "their is_superuser flag should be set to false"
          (is (= false
                 (db/select-one-field :is_superuser User :id (u/get-id user)))))))

    (testing "should run all changes in a transaction -- if one set of changes fails, others should not be persisted"
      (testing "Invalid ADD operation"
        ;; User should not be removed from the admin group because the attempt to add them to the Integer/MAX_VALUE group
        ;; should fail, causing the entire transaction to fail
        (mt/with-temp User [user {:is_superuser true}]
          (u/ignore-exceptions
            (user/set-permissions-groups! user #{(group/all-users) Integer/MAX_VALUE}))
          (is (= true
                 (db/select-one-field :is_superuser User :id (u/get-id user))))))

      (testing "Invalid REMOVE operation"
        ;; Attempt to remove someone from All Users + add to a valid group at the same time -- neither should persist
        (mt/with-temp User [user]
          (with-groups [group {:name "Group"} {}]
            (u/ignore-exceptions
              (user/set-permissions-groups! (test-users/fetch-user :lucky) #{group})))
          (is (= #{"All Users"}
                 (user-group-names :lucky))
              "If an INVALID REMOVE is attempted, valid adds should not be persisted"))))))

(deftest set-password-test
  (testing "set-password!"
    (testing "should change the password"
      (mt/with-temp User [{user-id :id} {:password "ABC_DEF"}]
        (letfn [(password [] (db/select-one-field :password User :id user-id))]
          (let [original-password (password)]
            (user/set-password! user-id "p@ssw0rd")
            (is (not= original-password
                      (password)))))))

    (testing "should clear out password reset token"
      (mt/with-temp User [{user-id :id} {:reset_token "ABC123"}]
        (user/set-password! user-id "p@ssw0rd")
        (is (= nil
               (db/select-one-field :reset_token User :id user-id)))))

    (testing "should clear out all existing Sessions"
      (mt/with-temp* [User    [{user-id :id}]
                      Session [_ {:id (str (java.util.UUID/randomUUID)), :user_id user-id}]
                      Session [_ {:id (str (java.util.UUID/randomUUID)), :user_id user-id}]]
        (letfn [(session-count [] (db/count Session :user_id user-id))]
          (is (= 2
                 (session-count)))
          (user/set-password! user-id "p@ssw0rd")
          (is (= 0
                 (session-count))))))))

(deftest validate-locale-test
  (testing "`:locale` should be validated"
    (testing "creating a new User"
      (testing "valid locale"
        (mt/with-temp User [{user-id :id} {:locale "en_US"}]
          (is (= "en_US"
                 (db/select-one-field :locale User :id user-id)))))
      (testing "invalid locale"
        (is (thrown?
             AssertionError
             (mt/with-temp User [{user-id :id} {:locale "en_XX"}])))))

    (testing "updating a User"
      (mt/with-temp User [{user-id :id} {:locale "en_US"}]
        (testing "valid locale"
          (db/update! User user-id :locale "en_GB")
          (is (= "en_GB"
                 (db/select-one-field :locale User :id user-id))))
        (testing "invalid locale"
          (is (thrown?
               AssertionError
               (db/update! User user-id :locale "en_XX"))))))))

(deftest normalize-locale-test
  (testing "`:locale` should be normalized"
    (mt/with-temp User [{user-id :id} {:locale "EN-us"}]
      (testing "creating a new User"
        (is (= "en_US"
               (db/select-one-field :locale User :id user-id))))

      (testing "updating a User"
        (db/update! User user-id :locale "en-GB")
        (is (= "en_GB"
               (db/select-one-field :locale User :id user-id)))))))

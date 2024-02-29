(ns metabase.models.user-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.http-client :as client]
   [metabase.integrations.google]
   [metabase.models
    :refer [Collection Database PermissionsGroup PermissionsGroupMembership
            Pulse PulseChannel PulseChannelRecipient Session Table User]]
   [metabase.models.collection :as collection]
   [metabase.models.collection-test :as collection-test]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.permissions-test :as perms-test]
   [metabase.models.serialization :as serdes]
   [metabase.models.setting :as setting]
   [metabase.models.user :as user]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.integrations.ldap :as ldap.test]
   [metabase.util :as u]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(comment
  ;; this has to be loaded for the Google Auth tests to work
  metabase.integrations.google/keep-me)

;;; Tests for permissions-set

(deftest check-test-users-have-valid-permissions-sets-test
  (testing "Make sure the test users have valid permissions sets"
    (doseq [user [:rasta :crowberto :lucky :trashbird]]
      (testing user
        (is (perms-test/is-permissions-set? (user/permissions-set (mt/user->id user))))))))

(deftest group-with-no-permissions-test
  (testing (str "Adding a group with *no* permissions shouldn't suddenly break all the permissions sets (This was a "
                "bug @tom found where a group with no permissions would cause the permissions set to contain `nil`).")
    (t2.with-temp/with-temp [PermissionsGroup           {group-id :id} {}
                             PermissionsGroupMembership _              {:group_id group-id, :user_id (mt/user->id :rasta)}]
      (is (perms-test/is-permissions-set? (user/permissions-set (mt/user->id :rasta)))))))

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
        (t2.with-temp/with-temp [Collection child-collection      {:name     "child"
                                                                   :location (collection/children-location
                                                                              (collection/user->personal-collection (mt/user->id :lucky)))}
                                 Collection grandchild-collection {:name     "grandchild"
                                                                   :location (collection/children-location child-collection)}]
          (is (set/subset?
               #{(perms/collection-readwrite-path (collection/user->personal-collection (mt/user->id :lucky)))
                 "/collection/child/"
                 "/collection/grandchild/"}
               (->> (user/permissions-set (mt/user->id :lucky))
                    remove-non-collection-perms
                    (collection-test/perms-path-ids->names [child-collection grandchild-collection])))))))))

(deftest group-data-permissions-test
  (testing "If a User is a member of a Group with data permissions for an object, `permissions-set` should return the perms"
    (t2.with-temp/with-temp [Database                   {db-id :id}    {}
                             Table                      table          {:name "Round Table", :db_id db-id}
                             PermissionsGroup           {group-id :id} {}
                             PermissionsGroupMembership _              {:group_id group-id, :user_id (mt/user->id :rasta)}]
      (perms/revoke-data-perms! (perms-group/all-users) db-id (:schema table) (:id table))
      (perms/grant-permissions! group-id (perms/table-read-path table))
      (is (set/subset?
           #{(perms/table-read-path table)}
           (user/permissions-set (mt/user->id :rasta)))))))

;;; Tests for invite-user and create-new-google-auth-user!

(defn- maybe-accept-invite!
  "Accept an invite if applicable. Look in the body of the content of the invite email for the reset token since this is
  the only place to get it (the token stored in the DB is an encrypted hash)."
  [new-user-email-address]
  (when-let [[{[{invite-email :content}] :body}] (get @mt/inbox new-user-email-address)]
    (let [[_ reset-token] (re-find #"/auth/reset_password/(\d+_[\w_-]+)#new" invite-email)]
      (client/client :post 200 "session/reset_password" {:token    reset-token
                                                         :password "p@ssword1"}))))

(defn sent-emails
  "Fetch the emails that have been sent in the form of a map of email address -> sequence of email subjects.
  For test-writing convenience the random email and names assigned to the new user are replaced with `<New User>`."
  [new-user-email-address new-user-first-name new-user-last-name]
  (into {} (for [[address emails] @mt/inbox
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
    (mt/with-fake-inbox
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
            (user/create-and-invite-user! new-user invitor false))
          (when accept-invite?
            (maybe-accept-invite! new-user-email))
          (sent-emails new-user-email new-user-first-name new-user-last-name)
          ;; Clean up after ourselves
          (finally
            (t2/delete! User :email new-user-email)))))))

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
        (t2.with-temp/with-temp [User inactive-admin {:is_superuser true, :is_active false}]
          (is (= {"<New User>"             ["You're invited to join Metabase's Metabase"]
                  "crowberto@metabase.com" ["<New User> accepted their Metabase invite"]}
                 (-> (invite-user-accept-and-check-inboxes! :invitor (assoc inactive-admin :is_active false))
                     (select-keys ["<New User>" "crowberto@metabase.com" (:email inactive-admin)]))))))))

  (testing "for google auth, all admins should get an email..."
    (t2.with-temp/with-temp [User _ {:is_superuser true, :email "some_other_admin@metabase.com"}]
      (is (= {"crowberto@metabase.com"        ["<New User> created a Metabase account"]
              "some_other_admin@metabase.com" ["<New User> created a Metabase account"]}
             (-> (invite-user-accept-and-check-inboxes! :google-auth? true)
                 (select-keys ["crowberto@metabase.com" "some_other_admin@metabase.com"])))))

    (testing "...including the site admin if it is set..."
      (mt/with-temporary-setting-values [admin-email "cam2@metabase.com"]
        (t2.with-temp/with-temp [User _ {:is_superuser true, :email "some_other_admin@metabase.com"}]
          (is (= {"crowberto@metabase.com"        ["<New User> created a Metabase account"]
                  "some_other_admin@metabase.com" ["<New User> created a Metabase account"]
                  "cam2@metabase.com"             ["<New User> created a Metabase account"]}
                 (-> (invite-user-accept-and-check-inboxes! :google-auth? true)
                     (select-keys ["crowberto@metabase.com" "some_other_admin@metabase.com" "cam2@metabase.com"]))))))

      (testing "...unless they are inactive..."
        (t2.with-temp/with-temp [User user {:is_superuser true, :is_active false}]
          (is (= {"crowberto@metabase.com" ["<New User> created a Metabase account"]}
                 (-> (invite-user-accept-and-check-inboxes! :google-auth? true)
                     (select-keys ["crowberto@metabase.com" (:email user)])))))

        (testing "...or if setting is disabled"
          (mt/with-premium-features #{:sso-ldap}
            (mt/with-temporary-raw-setting-values [send-new-sso-user-admin-email? "false"]
              (t2.with-temp/with-temp [User _ {:is_superuser true, :email "some_other_admin@metabase.com"}]
                (is (= (if config/ee-available? {} {"crowberto@metabase.com" ["<New User> created a Metabase account"],
                                                    "some_other_admin@metabase.com" ["<New User> created a Metabase account"]})
                       (-> (invite-user-accept-and-check-inboxes! :google-auth? true)
                           (select-keys ["crowberto@metabase.com" "some_other_admin@metabase.com"])))))))))))

 (testing "if sso enabled and password login is disabled, email should send a link to sso login"
   (mt/with-premium-features #{:disable-password-login}
     (mt/with-temporary-setting-values [enable-password-login false]
       (ldap.test/with-ldap-server
         (invite-user-accept-and-check-inboxes! :invitor default-invitor , :accept-invite? false)
         (is (seq (mt/regex-email-bodies #"/auth/login"))))))))

(deftest ldap-user-passwords-test
  (testing (str "LDAP users should not persist their passwords. Check that if somehow we get passed an LDAP user "
                "password, it gets swapped with something random")
    (try
      (user/create-new-ldap-auth-user! {:email      "ldaptest@metabase.com"
                                        :first_name "Test"
                                        :last_name  "SomeLdapStuff"
                                        :password   "should be removed"})
      (let [{:keys [password password_salt]} (t2/select-one [User :password :password_salt] :email "ldaptest@metabase.com")]
        (is (= false
               (u.password/verify-password "should be removed" password_salt password))))
      (finally
        (t2/delete! User :email "ldaptest@metabase.com")))))

(deftest new-admin-user-test
  (testing (str "when you create a new user with `is_superuser` set to `true`, it should create a "
                "PermissionsGroupMembership object")
    (t2.with-temp/with-temp [User user {:is_superuser true}]
      (is (= true
             (t2/exists? PermissionsGroupMembership :user_id (u/the-id user), :group_id (u/the-id (perms-group/admin))))))))

(deftest ldap-sequential-login-attributes-test
  (testing "You should be able to create a new LDAP user if some `login_attributes` are vectors (#10291)"
    (try
      (user/create-new-ldap-auth-user! {:email            "ldaptest@metabase.com"
                                        :first_name       "Test"
                                        :last_name        "SomeLdapStuff"
                                        :login_attributes {:local_birds ["Steller's Jay" "Mountain Chickadee"]}})
      (is (= {"local_birds" ["Steller's Jay" "Mountain Chickadee"]}
             (t2/select-one-fn :login_attributes User :email "ldaptest@metabase.com")))
      (finally
        (t2/delete! User :email "ldaptest@metabase.com")))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            New Group IDs Functions                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn group-names [groups-or-ids]
  (when (seq groups-or-ids)
    (t2/select-fn-set :name PermissionsGroup :id [:in (map u/the-id groups-or-ids)])))

(defn- do-with-group [group-properties group-members f]
  (t2.with-temp/with-temp [PermissionsGroup group group-properties]
    (doseq [member group-members]
      (t2/insert! PermissionsGroupMembership
                  {:group_id (u/the-id group)
                   :user_id  (if (keyword? member)
                               (mt/user->id member)
                               (u/the-id member))}))
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
          (t2/with-call-count [call-count]
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
        (let [users (user/add-group-ids (map test.users/fetch-user [:lucky :rasta]))]
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
                 (-> (t2/hydrate (t2/select-one User :id (mt/user->id :lucky)) :group_ids)
                     :group_ids))))

        (testing "for multiple Users"
          (is (= '[(user/add-group-ids <users>)
                   (user/add-group-ids <users>)]
                 (as-> (map test.users/fetch-user [:rasta :lucky]) users
                   (t2/hydrate users :group_ids)
                   (mapv :group_ids users)))))))

    (testing "should be done in a single DB call"
      (with-groups [_ {:name "Group 1"} #{:lucky :rasta}
                    _ {:name "Group 2"} #{:lucky}
                    _ {:name "Group 3"} #{}]
        (let [users (mapv test.users/fetch-user [:lucky :rasta])]
          (t2/with-call-count [call-count]
            (dorun (user/add-group-ids users))
            (is (= 1
                   (call-count)))))))

    (testing "shouldn't barf if passed an empty seq"
      (is (= nil
             (user/add-group-ids []))))))

(defn user-group-names [user-or-id-or-kw]
  (group-names (user/group-ids (if (keyword? user-or-id-or-kw)
                                 (test.users/fetch-user user-or-id-or-kw)
                                 user-or-id-or-kw))))

(deftest set-permissions-groups-test
  (testing "set-permissions-groups!"
    (testing "should be able to add a User to new groups"
      (with-groups [group-1 {:name "Group 1"} #{}
                    group-2 {:name "Group 2"} #{}]
        (user/set-permissions-groups! (mt/user->id :lucky) #{(perms-group/all-users) group-1 group-2})
        (is (= #{"All Users" "Group 1" "Group 2"}
               (user-group-names :lucky)))))

    (testing "should be able to remove a User from groups"
      (with-groups [_group-1 {:name "Group 1"} #{:lucky}
                    _group-2 {:name "Group 2"} #{:lucky}]
        (user/set-permissions-groups! (mt/user->id :lucky) #{(perms-group/all-users)})
        (is (= #{"All Users"}
               (user-group-names :lucky)))))

    (testing "should be able to add & remove groups at the same time! :wow:"
      (with-groups [_group-1 {:name "Group 1"} #{:lucky}
                    group-2 {:name "Group 2"} #{}]
        (user/set-permissions-groups! (mt/user->id :lucky) #{(perms-group/all-users) group-2})
        (is (= #{"All Users" "Group 2"}
               (user-group-names :lucky)))))

    (testing "should throw an Exception if you attempt to remove someone from All Users"
      (with-groups [group-1 {:name "Group 1"} #{}]
        (is (thrown? Exception
                     (user/set-permissions-groups! (mt/user->id :lucky) #{group-1})))))

    (testing "should be able to add someone to the Admin group"
      (t2.with-temp/with-temp [User user]
        (user/set-permissions-groups! user #{(perms-group/all-users) (perms-group/admin)})
        (is (= #{"Administrators" "All Users"}
               (user-group-names user)))

        (testing "their is_superuser flag should be set to true"
          (is (= true
                 (t2/select-one-fn :is_superuser User :id (u/the-id user)))))))

    (testing "should be able to remove someone from the Admin group"
      (t2.with-temp/with-temp [User user {:is_superuser true}]
        (user/set-permissions-groups! user #{(perms-group/all-users)})
        (is (= #{"All Users"}
               (user-group-names user)))

        (testing "their is_superuser flag should be set to false"
          (is (= false
                 (t2/select-one-fn :is_superuser User :id (u/the-id user)))))))

    (testing "should run all changes in a transaction -- if one set of changes fails, others should not be persisted"
      (testing "Invalid ADD operation"
        ;; User should not be removed from the admin group because the attempt to add them to the Integer/MAX_VALUE group
        ;; should fail, causing the entire transaction to fail
        (mt/test-helpers-set-global-values!
          (mt/with-temp [User user {:is_superuser true}]
            (u/ignore-exceptions
              (user/set-permissions-groups! user #{(perms-group/all-users) Integer/MAX_VALUE}))
            (is (= true
                   (t2/select-one-fn :is_superuser User :id (u/the-id user)))))))

      (testing "Invalid REMOVE operation"
        ;; Attempt to remove someone from All Users + add to a valid group at the same time -- neither should persist
        (t2.with-temp/with-temp [User _]
          (with-groups [group {:name "Group"} {}]
            (u/ignore-exceptions
              (user/set-permissions-groups! (test.users/fetch-user :lucky) #{group})))
          (is (= #{"All Users"}
                 (user-group-names :lucky))
              "If an INVALID REMOVE is attempted, valid adds should not be persisted"))))))

(deftest set-password-test
  (testing "set-password!"
    (testing "should change the password"
      (t2.with-temp/with-temp [User {user-id :id} {:password "ABC_DEF"}]
        (letfn [(password [] (t2/select-one-fn :password User :id user-id))]
          (let [original-password (password)]
            (user/set-password! user-id "p@ssw0rd")
            (is (not= original-password
                      (password)))))))

    (testing "should clear out password reset token"
      (t2.with-temp/with-temp [User {user-id :id} {:reset_token "ABC123"}]
        (user/set-password! user-id "p@ssw0rd")
        (is (= nil
               (t2/select-one-fn :reset_token User :id user-id)))))

    (testing "should clear out all existing Sessions"
      (t2.with-temp/with-temp [User {user-id :id} {}]
        (dotimes [_ 2]
          (t2/insert! Session {:id (str (random-uuid)), :user_id user-id}))
        (letfn [(session-count [] (t2/count Session :user_id user-id))]
          (is (= 2
                 (session-count)))
          (user/set-password! user-id "p@ssw0rd")
          (is (= 0
                 (session-count))))))))

(deftest validate-locale-test
  (testing "`:locale` should be validated"
    (testing "creating a new User"
      (testing "valid locale"
        (t2.with-temp/with-temp [User {user-id :id} {:locale "en_US"}]
          (is (= "en_US"
                 (t2/select-one-fn :locale User :id user-id)))))
      (testing "invalid locale"
        (is (thrown-with-msg?
             Throwable
             #"Assert failed: Invalid locale: \"en_XX\""
             (t2.with-temp/with-temp [User _ {:locale "en_XX"}])))))

    (testing "updating a User"
      (t2.with-temp/with-temp [User {user-id :id} {:locale "en_US"}]
        (testing "valid locale"
          (t2/update! User user-id {:locale "en_GB"})
          (is (= "en_GB"
                 (t2/select-one-fn :locale User :id user-id))))
        (testing "invalid locale"
          (is (thrown-with-msg?
               Throwable
               #"Assert failed: Invalid locale: \"en_XX\""
               (t2/update! User user-id {:locale "en_XX"}))))))))

(deftest normalize-locale-test
  (testing "`:locale` should be normalized"
    (t2.with-temp/with-temp [User {user-id :id} {:locale "EN-us"}]
      (testing "creating a new User"
        (is (= "en_US"
               (t2/select-one-fn :locale User :id user-id))))

      (testing "updating a User"
        (t2/update! User user-id {:locale "en-GB"})
        (is (= "en_GB"
               (t2/select-one-fn :locale User :id user-id)))))))

(deftest delete-pulse-subscriptions-when-archived-test
  (testing "Delete a User's Pulse/Alert/Dashboard Subscription subscriptions when they get archived"
    (t2.with-temp/with-temp [User                  {user-id :id}          {}
                             Pulse                 {pulse-id :id}         {}
                             PulseChannel          {pulse-channel-id :id} {:pulse_id pulse-id}
                             PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id, :user_id user-id}]
      (letfn [(subscription-exists? []
                (t2/exists? PulseChannelRecipient :pulse_channel_id pulse-channel-id, :user_id user-id))]
        (testing "Sanity check: subscription should exist"
          (is (subscription-exists?)))
        (testing "user is updated but not archived: don't delete the subscription"
          (is (pos? (t2/update! User user-id {:is_active true :first_name "New name"})))
          (is (subscription-exists?)))
        (testing "archive the user"
          (is (pos? (t2/update! User user-id {:is_active false}))))
        (testing "subscription should no longer exist"
          (is (not (subscription-exists?))))))))

(deftest identity-hash-test
  (testing "User hashes are based on the email address"
    (t2.with-temp/with-temp [User user {:email "fred@flintston.es"}]
      (is (= "e8d63472"
             (serdes/raw-hash ["fred@flintston.es"])
             (serdes/identity-hash user))))))

(deftest hash-password-on-update-test
  (testing "Setting `:password` with [[t2/update!]] should hash the password, just like [[t2/insert!]]"
    (let [plaintext-password "password-1234"]
      (t2.with-temp/with-temp [User {user-id :id} {:password plaintext-password}]
        (let [salt                     (fn [] (t2/select-one-fn :password_salt User :id user-id))
              hashed-password          (fn [] (t2/select-one-fn :password User :id user-id))
              original-hashed-password (hashed-password)]
          (testing "sanity check: check that password can be verified"
            (is (u.password/verify-password plaintext-password
                                            (salt)
                                            original-hashed-password)))
          (is (= 1
                 (t2/update! User user-id {:password plaintext-password})))
          (let [new-hashed-password (hashed-password)]
            (testing "password should have been hashed"
              (is (not= plaintext-password
                        new-hashed-password)))
            (testing "even tho the plaintext password is the same, hashed password should be different (different salts)"
              (is (not= original-hashed-password
                        new-hashed-password)))
            (testing "salt should have been set; verify password was hashed correctly"
              (is (u.password/verify-password plaintext-password
                                              (salt)
                                              new-hashed-password)))))))))

(deftest last-acknowledged-version-can-be-read-and-set
  (testing "last-acknowledged-version can be read and set"
    (mt/with-test-user :rasta
      (let [old-version (setting/get :last-acknowledged-version)
            new-version "v0.47.1"]
        (try
          (is (not= new-version old-version))
          (setting/set! :last-acknowledged-version new-version)
          (is (= new-version (setting/get :last-acknowledged-version)))
          ;; Ensure it's saved on the user, not globally:
          (is (= new-version (:last-acknowledged-version (t2/select-one-fn :settings User :id (mt/user->id :rasta)))))
          (finally
            (setting/set! :last-acknowledged-version old-version)))))))

(deftest last-acknowledged-version-is-set-on-create
  (testing "last-acknowledged-version is automatically set for new users"
    (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.47.1")]
      (t2.with-temp/with-temp [User {user-id :id} {}]
        (mw.session/with-current-user user-id
          (is (= "v0.47.1" (setting/get :last-acknowledged-version))))))))

(deftest last-used-native-database-id-can-be-read-and-set
  (testing "last-used-native-database-id can be read and set"
    (mt/with-test-user :rasta
      (let [initial-value  (user/last-used-native-database-id)
            existing-db-id (:id (t2/select-one Database))
            wrong-db-id    999]
        (is (nil? initial-value))
        (user/last-used-native-database-id! existing-db-id)
        (is (= existing-db-id (user/last-used-native-database-id)))
        (testing "returns nil if the database doesn't exist"
          (user/last-used-native-database-id! wrong-db-id)
          (is (nil? (user/last-used-native-database-id)))))))

  (testing "last-used-native-database-id should be a user-local setting"
    (is (=? {:user-local :only}
            (setting/resolve-setting :last-used-native-database-id)))
    (mt/with-temp [Database {id1 :id} {:name "DB1"}
                   Database {id2 :id} {:name "DB2"}]
      (mt/with-test-user :rasta
        (let [old-db-id (user/last-used-native-database-id)]
          (user/last-used-native-database-id! id1)
          (mt/with-test-user :crowberto
            (let [old-db-id (user/last-used-native-database-id)]
              (user/last-used-native-database-id! id2)
              (is (= (user/last-used-native-database-id) id2))
              (mt/with-test-user :rasta
                (is (= (user/last-used-native-database-id) id1)))
              (user/last-used-native-database-id! old-db-id)))
          (user/last-used-native-database-id! old-db-id))))))

  (deftest common-name-test
    (testing "common_name should be present depending on what is selected"
      (mt/with-temp [User user {:first_name "John"
                                :last_name  "Smith"
                                :email      "john.smith@gmail.com"}]
        (is (= "John Smith"
               (:common_name (t2/select-one [User :first_name :last_name] (:id user)))))
        (is (= "John Smith"
               (:common_name (t2/select-one User (:id user)))))
        (is (nil? (:common_name (t2/select-one [User :first_name :email] (:id user)))))
        (is (nil? (:common_name (t2/select-one [User :email] (:id user)))))))
    (testing "common_name should be present if first_name and last_name are selected but nil and email is also selected"
      (mt/with-temp [User user {:first_name nil
                                :last_name  nil
                                :email      "john.smith@gmail.com"}]
        (is (= "john.smith@gmail.com"
               (:common_name (t2/select-one [User :email :first_name :last_name] (:id user)))))
        (is (nil? (:common_name (t2/select-one [User :first_name :last_name] (:id user))))))))

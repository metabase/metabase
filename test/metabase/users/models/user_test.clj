(ns metabase.users.models.user-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.schema-migrations-test.impl :as schema-migrations-test.impl]
   [metabase.config.core :as config]
   [metabase.models.serialization :as serdes]
   [metabase.notification.test-util :as notification.tu]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.request.core :as request]
   [metabase.settings.core :as setting]
   [metabase.sso.ldap-test-util :as ldap.test]
   [metabase.tenants.core :as tenants]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.users.models.user :as user]
   [metabase.util :as u]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures
  :once
  (fixtures/initialize :test-users :notifications))

;;; Tests for invite-user and create-new-google-auth-user!

(defn- maybe-accept-invite!
  "Accept an invite if applicable. Look in the body of the content of the invite email for the reset token since this is
  the only place to get it (the token stored in the DB is an encrypted hash)."
  [new-user-email-address]
  (when-let [[{[{invite-email :content}] :body}] (get @mt/inbox new-user-email-address)]
    (let [[_ reset-token] (re-find #"/auth/reset_password/(\d+_[\w_-]+)\?.+#new" invite-email)]
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
            (t2/delete! :model/User :email new-user-email)))))))

(def ^:private default-invitor
  {:email "crowberto@metabase.com", :is_active true, :first_name "Crowberto"})

;; admin shouldn't get email saying user joined until they accept the invite (i.e., reset their password)

(deftest new-user-invite-email-test
  (notification.tu/with-send-notification-sync
    (testing "New user should get an invite email"
      (is (= {"<New User>" ["You're invited to join Metabase's Metabase"]}
             (invite-user-accept-and-check-inboxes! :invitor default-invitor, :accept-invite? false))))))

(deftest admin-email-on-user-acceptance-test
  (notification.tu/with-send-notification-sync
    (testing "admin should get an email when a new user joins"
      (is (= {"<New User>"             ["You're invited to join Metabase's Metabase"]
              "crowberto@metabase.com" ["<New User> accepted their Metabase invite"]}
             (-> (invite-user-accept-and-check-inboxes! :invitor default-invitor)
                 (select-keys ["<New User>" "crowberto@metabase.com"])))))))

(deftest admin-email-with-site-admin-test
  (notification.tu/with-send-notification-sync
    (testing "site admin should also get email when user joins"
      (mt/with-temporary-setting-values [admin-email "cam2@metabase.com"]
        (is (= {"<New User>"             ["You're invited to join Metabase's Metabase"]
                "crowberto@metabase.com" ["<New User> accepted their Metabase invite"]
                "cam2@metabase.com"      ["<New User> accepted their Metabase invite"]}
               (-> (invite-user-accept-and-check-inboxes! :invitor default-invitor)
                   (select-keys ["<New User>" "crowberto@metabase.com" "cam2@metabase.com"]))))))))

(deftest inactive-admin-no-email-test
  (notification.tu/with-send-notification-sync
    (testing "inactive admin should not get email when user joins"
      (mt/with-temp [:model/User inactive-admin {:is_superuser true, :is_active false}]
        (is (= {"<New User>"             ["You're invited to join Metabase's Metabase"]
                "crowberto@metabase.com" ["<New User> accepted their Metabase invite"]}
               (-> (invite-user-accept-and-check-inboxes! :invitor (assoc inactive-admin :is_active false))
                   (select-keys ["<New User>" "crowberto@metabase.com" (:email inactive-admin)]))))))))

(deftest google-auth-admin-emails-test
  (notification.tu/with-send-notification-sync
    (testing "for google auth, all admins should get an email"
      (mt/with-temporary-raw-setting-values [send-new-sso-user-admin-email? "true"]
        (mt/with-temp [:model/User _ {:is_superuser true, :email "some_other_admin@metabase.com"}]
          (is (= {"crowberto@metabase.com"        ["<New User> created a Metabase account"]
                  "some_other_admin@metabase.com" ["<New User> created a Metabase account"]}
                 (-> (invite-user-accept-and-check-inboxes! :google-auth? true)
                     (select-keys ["crowberto@metabase.com" "some_other_admin@metabase.com"])))))))))

(deftest google-auth-site-admin-email-test
  (notification.tu/with-send-notification-sync
    (testing "for google auth, site admin should also get email"
      (mt/with-temporary-raw-setting-values [send-new-sso-user-admin-email? "true"]
        (mt/with-temporary-raw-setting-values [admin-email "cam2@metabase.com"]
          (mt/with-temp [:model/User _ {:is_superuser true, :email "some_other_admin@metabase.com"}]
            (is (= {"crowberto@metabase.com"        ["<New User> created a Metabase account"]
                    "some_other_admin@metabase.com" ["<New User> created a Metabase account"]
                    "cam2@metabase.com"             ["<New User> created a Metabase account"]}
                   (-> (invite-user-accept-and-check-inboxes! :google-auth? true)
                       (select-keys ["crowberto@metabase.com" "some_other_admin@metabase.com" "cam2@metabase.com"]))))))))))

(deftest google-auth-inactive-admin-no-email-test
  (notification.tu/with-send-notification-sync
    (testing "for google auth, inactive admin should not get email"
      (mt/with-temporary-raw-setting-values [send-new-sso-user-admin-email? "true"]
        (mt/with-temp [:model/User user {:is_superuser true, :is_active false}]
          (is (= {"crowberto@metabase.com" ["<New User> created a Metabase account"]}
                 (-> (invite-user-accept-and-check-inboxes! :google-auth? true)
                     (select-keys ["crowberto@metabase.com" (:email user)])))))))))

(deftest google-auth-setting-disabled-test
  (notification.tu/with-send-notification-sync
    (testing "for google auth, no emails sent if setting is disabled"
      (mt/with-premium-features #{:sso-ldap}
        (mt/with-temporary-raw-setting-values [send-new-sso-user-admin-email? "false"]
          (mt/with-temp [:model/User _ {:is_superuser true, :email "some_other_admin@metabase.com"}]
            (is (= (if config/ee-available? {} {"crowberto@metabase.com" ["<New User> created a Metabase account"],
                                                "some_other_admin@metabase.com" ["<New User> created a Metabase account"]})
                   (-> (invite-user-accept-and-check-inboxes! :google-auth? true)
                       (select-keys ["crowberto@metabase.com" "some_other_admin@metabase.com"]))))))))))

(deftest sso-login-link-email-test
  (notification.tu/with-send-notification-sync
    (testing "if sso enabled and password login is disabled, email should send a link to sso login"
      (mt/with-premium-features #{:disable-password-login}
        (mt/with-temporary-setting-values [enable-password-login false]
          (ldap.test/with-ldap-server!
            (invite-user-accept-and-check-inboxes! :invitor default-invitor , :accept-invite? false)
            (is (seq (mt/regex-email-bodies #"/auth/login")))))))))

(deftest new-admin-user-test
  (testing (str "when you create a new user with `is_superuser` set to `true`, it should create a "
                "PermissionsGroupMembership object")
    (mt/with-temp [:model/User user {:is_superuser true}]
      (is (true?
           (t2/exists? :model/PermissionsGroupMembership :user_id (u/the-id user), :group_id (u/the-id (perms-group/admin))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            New Group IDs Functions                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn group-names [groups-or-ids]
  (when (seq groups-or-ids)
    (t2/select-fn-set :name :model/PermissionsGroup :id [:in (map u/the-id groups-or-ids)])))

(defn- do-with-group! [group-properties group-members f]
  (mt/with-temp [:model/PermissionsGroup group group-properties]
    (perms/add-users-to-groups! (for [member group-members]
                                  {:user (if (keyword? member)
                                           (mt/user->id member)
                                           (u/the-id member))
                                   :group group}))
    (f group)))

(defmacro ^:private with-groups! [[group-binding group-properties members & more-groups] & body]
  (if (seq more-groups)
    `(with-groups! [~group-binding ~group-properties ~members]
       (with-groups! ~more-groups
         ~@body))
    `(do-with-group! ~group-properties ~members (fn [~group-binding] ~@body))))

(deftest group-ids-test
  (testing "the `group-ids` hydration function"
    (testing "should work as expected"
      (with-groups! [_ {:name "Group 1"} #{:lucky :rasta}
                     _ {:name "Group 2"} #{:lucky}
                     _ {:name "Group 3"} #{}]
        (is (= #{"All Users" "Group 2" "Group 1"}
               (group-names (user/group-ids (mt/user->id :lucky)))))))
    (testing "should be a single DB call"
      (with-groups! [_ {:name "Group 1"} #{:lucky}
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
      (with-groups! [_ {:name "Group 1"} #{:lucky :rasta}
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
                 (-> (t2/hydrate (t2/select-one :model/User :id (mt/user->id :lucky)) :group_ids)
                     :group_ids))))
        (testing "for multiple Users"
          (is (= '[(user/add-group-ids <users>)
                   (user/add-group-ids <users>)]
                 (as-> (map test.users/fetch-user [:rasta :lucky]) users
                   (t2/hydrate users :group_ids)
                   (mapv :group_ids users)))))))
    (testing "should be done in a single DB call"
      (with-groups! [_ {:name "Group 1"} #{:lucky :rasta}
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
      (with-groups! [group-1 {:name "Group 1"} #{}
                     group-2 {:name "Group 2"} #{}]
        (user/set-permissions-groups! (mt/user->id :lucky) #{(perms-group/all-users) group-1 group-2})
        (is (= #{"All Users" "Group 1" "Group 2"}
               (user-group-names :lucky)))))
    (testing "should be able to remove a User from groups"
      (with-groups! [_group-1 {:name "Group 1"} #{:lucky}
                     _group-2 {:name "Group 2"} #{:lucky}]
        (user/set-permissions-groups! (mt/user->id :lucky) #{(perms-group/all-users)})
        (is (= #{"All Users"}
               (user-group-names :lucky)))))
    (testing "should be able to add & remove groups at the same time! :wow:"
      (with-groups! [_group-1 {:name "Group 1"} #{:lucky}
                     group-2 {:name "Group 2"} #{}]
        (user/set-permissions-groups! (mt/user->id :lucky) #{(perms-group/all-users) group-2})
        (is (= #{"All Users" "Group 2"}
               (user-group-names :lucky)))))
    (testing "should throw an Exception if you attempt to remove someone from All Users"
      (with-groups! [group-1 {:name "Group 1"} #{}]
        (is (thrown? Exception
                     (user/set-permissions-groups! (mt/user->id :lucky) #{group-1})))))
    (testing "should be able to add someone to the Admin group"
      (mt/with-temp [:model/User user]
        (user/set-permissions-groups! user #{(perms-group/all-users) (perms-group/admin)})
        (is (= #{"Administrators" "All Users"}
               (user-group-names user)))
        (testing "their is_superuser flag should be set to true"
          (is (true?
               (t2/select-one-fn :is_superuser :model/User :id (u/the-id user)))))))
    (testing "should be able to remove someone from the Admin group"
      (mt/with-temp [:model/User user {:is_superuser true}]
        (user/set-permissions-groups! user #{(perms-group/all-users)})
        (is (= #{"All Users"}
               (user-group-names user)))
        (testing "their is_superuser flag should be set to false"
          (is (= false
                 (t2/select-one-fn :is_superuser :model/User :id (u/the-id user)))))))
    (testing "should run all changes in a transaction -- if one set of changes fails, others should not be persisted"
      (testing "Invalid ADD operation"
        ;; User should not be removed from the admin group because the attempt to add them to the Integer/MAX_VALUE group
        ;; should fail, causing the entire transaction to fail
        (mt/test-helpers-set-global-values!
          (mt/with-temp [:model/User user {:is_superuser true}]
            (u/ignore-exceptions
              (user/set-permissions-groups! user #{(perms-group/all-users) Integer/MAX_VALUE}))
            (is (true?
                 (t2/select-one-fn :is_superuser :model/User :id (u/the-id user)))))))
      (testing "Invalid REMOVE operation"
        ;; Attempt to remove someone from All Users + add to a valid group at the same time -- neither should persist
        (mt/with-temp [:model/User _]
          (with-groups! [group {:name "Group"} {}]
            (u/ignore-exceptions
              (user/set-permissions-groups! (test.users/fetch-user :lucky) #{group})))
          (is (= #{"All Users"}
                 (user-group-names :lucky))
              "If an INVALID REMOVE is attempted, valid adds should not be persisted"))))))

(deftest password-sync-to-auth-identity-test
  (testing "Password changes are automatically synced to AuthIdentity via lifecycle hooks"
    (testing "Password update via t2/update! also syncs to AuthIdentity"
      (mt/with-temp [:model/User {user-id :id} {:password "initial-password"}]
        (let [initial-user (t2/select-one [:model/User :password] :id user-id)
              initial-password-hash (:password initial-user)]
          (t2/update! :model/User user-id {:password "another-new-password"})
          (let [updated-user (t2/select-one [:model/User :password] :id user-id)
                updated-password-hash (:password updated-user)
                updated-auth-identity (t2/select-one :model/AuthIdentity :user_id user-id :provider "password")
                auth-identity-hash (get-in updated-auth-identity [:credentials :password_hash])]
            (is (not= initial-password-hash updated-password-hash) "Password should be updated in User table")
            (is (some? updated-auth-identity) "AuthIdentity should still exist")
            (is (= updated-password-hash auth-identity-hash) "AuthIdentity password hash should match User table")))))))

(deftest validate-locale-test
  (testing "`:locale` should be validated"
    (testing "creating a new User"
      (testing "valid locale"
        (mt/with-temp [:model/User {user-id :id} {:locale "en_US"}]
          (is (= "en_US"
                 (t2/select-one-fn :locale :model/User :id user-id)))))
      (testing "invalid locale"
        (is (thrown-with-msg?
             Throwable
             #"Assert failed: Invalid locale: \"en_XX\""
             (mt/with-temp [:model/User _ {:locale "en_XX"}])))))
    (testing "updating a User"
      (mt/with-temp [:model/User {user-id :id} {:locale "en_US"}]
        (testing "valid locale"
          (t2/update! :model/User user-id {:locale "en_GB"})
          (is (= "en_GB"
                 (t2/select-one-fn :locale :model/User :id user-id))))
        (testing "invalid locale"
          (is (thrown-with-msg?
               Throwable
               #"Assert failed: Invalid locale: \"en_XX\""
               (t2/update! :model/User user-id {:locale "en_XX"}))))))))

(deftest normalize-locale-test
  (testing "`:locale` should be normalized"
    (mt/with-temp [:model/User {user-id :id} {:locale "EN-us"}]
      (testing "creating a new User"
        (is (= "en_US"
               (t2/select-one-fn :locale :model/User :id user-id))))
      (testing "updating a User"
        (t2/update! :model/User user-id {:locale "en-GB"})
        (is (= "en_GB"
               (t2/select-one-fn :locale :model/User :id user-id)))))))

(deftest delete-pulse-subscriptions-when-archived-test
  (testing "Delete a User's Pulse/Alert/Dashboard Subscription subscriptions when they get archived"
    (mt/with-temp [:model/User                  {user-id :id}          {}
                   :model/Pulse                 {pulse-id :id}         {}
                   :model/PulseChannel          {pulse-channel-id :id} {:pulse_id pulse-id}
                   :model/PulseChannelRecipient _ {:pulse_channel_id pulse-channel-id, :user_id user-id}]
      (letfn [(subscription-exists? []
                (t2/exists? :model/PulseChannelRecipient :pulse_channel_id pulse-channel-id, :user_id user-id))]
        (testing "Sanity check: subscription should exist"
          (is (subscription-exists?)))
        (testing "user is updated but not archived: don't delete the subscription"
          (is (pos? (t2/update! :model/User user-id {:is_active true :first_name "New name"})))
          (is (subscription-exists?)))
        (testing "archive the user"
          (is (pos? (t2/update! :model/User user-id {:is_active false}))))
        (testing "subscription should no longer exist"
          (is (not (subscription-exists?))))))))

(deftest identity-hash-test
  (testing "User hashes are based on the email address"
    (mt/with-temp [:model/User user {:email "fred@flintston.es"}]
      (is (= "e8d63472"
             (serdes/raw-hash ["fred@flintston.es"])
             (serdes/identity-hash user))))))

(deftest hash-password-on-update-test
  (testing "Setting `:password` with [[t2/update!]] should hash the password, just like [[t2/insert!]]"
    (let [plaintext-password "password-1234"]
      (mt/with-temp [:model/User {user-id :id} {:password plaintext-password}]
        (let [salt                     (fn [] (t2/select-one-fn :password_salt :model/User :id user-id))
              hashed-password          (fn [] (t2/select-one-fn :password :model/User :id user-id))
              original-hashed-password (hashed-password)]
          (testing "sanity check: check that password can be verified"
            (is (u.password/verify-password plaintext-password
                                            (salt)
                                            original-hashed-password)))
          (is (= 1
                 (t2/update! :model/User user-id {:password plaintext-password})))
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
          (is (= new-version (:last-acknowledged-version (t2/select-one-fn :settings :model/User :id (mt/user->id :rasta)))))
          (finally
            (setting/set! :last-acknowledged-version old-version)))))))

(deftest last-acknowledged-version-is-set-on-create
  (testing "last-acknowledged-version is automatically set for new users"
    (with-redefs [config/mb-version-info (assoc config/mb-version-info :tag "v0.47.1")]
      (mt/with-temp [:model/User {user-id :id} {}]
        (request/with-current-user user-id
          (is (= "v0.47.1" (setting/get :last-acknowledged-version))))))))

(deftest common-name-test
  (testing "common_name should be present depending on what is selected"
    (mt/with-temp [:model/User user {:first_name "John"
                                     :last_name  "Smith"
                                     :email      "john.smith@gmail.com"}]
      (is (= "John Smith"
             (:common_name (t2/select-one [:model/User :first_name :last_name] (:id user)))))
      (is (= "John Smith"
             (:common_name (t2/select-one :model/User (:id user)))))
      (is (nil? (:common_name (t2/select-one [:model/User :first_name :email] (:id user)))))
      (is (nil? (:common_name (t2/select-one [:model/User :email] (:id user)))))))
  (testing "common_name should be present if first_name and last_name are selected but nil and email is also selected"
    (mt/with-temp [:model/User user {:first_name nil
                                     :last_name  nil
                                     :email      "john.smith@gmail.com"}]
      (is (= "john.smith@gmail.com"
             (:common_name (t2/select-one [:model/User :email :first_name :last_name] (:id user)))))
      (is (nil? (:common_name (t2/select-one [:model/User :first_name :last_name] (:id user))))))))

(deftest block-sso-provisioning-if-instance-not-set-up
  (testing "SSO users should not be created if an admin user has not already been created (metabase-private#201)"
    (schema-migrations-test.impl/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? true)
      (is (thrown-with-msg?
           Exception
           #"Metabase instance has not been initialized"
           (user/create-and-invite-user! {:first_name "John"
                                          :last_name  "Smith"
                                          :email      "john.smith@gmail.com"
                                          :sso_source "jwt"}
                                         default-invitor
                                         false))))))

(deftest deactivated-at-test
  (testing "deactivated_at is set when a user is deactivated and unset when reactivated (#51728)"
    (mt/with-temp [:model/User {user-id :id :as user} {}]
      (is (nil? (:deactivated_at user)))
      (t2/update! :model/User user-id {:is_active false})
      (let [deactivated-at (t2/select-one-fn :deactivated_at :model/User user-id)]
        (is (instance? java.time.OffsetDateTime deactivated-at)))
      (t2/update! :model/User user-id {:is_active true})
      (let [deactivated-at (t2/select-one-fn :deactivated_at :model/User user-id)]
        (is (nil? deactivated-at))))))

(deftest add-attributes-merges-login-and-jwt-attributes-test
  (testing "add-attributes should add :attributes key with merged login attributes"
    (let [user {:login_attributes {"user_attr" "user_value"}
                :jwt_attributes {"jwt_attr" "jwt_value"}
                :email "test@example.com"}
          result (user/add-attributes user)]
      (is (= {"jwt_attr" "jwt_value"
              "user_attr" "user_value"}
             (:attributes result)))
      (is (= user (dissoc result :attributes))))))

(deftest add-attributes-handles-nil-login-attributes-test
  (testing "add-attributes should handle nil login_attributes"
    (let [user {:email "test@example.com"
                :jwt_attributes {"jwt_attr" "jwt_value"}}
          result (user/add-attributes user)]
      (is (= {"jwt_attr" "jwt_value"}
             (:attributes result))))))

(deftest add-attributes-handles-empty-login-attributes-test
  (testing "add-attributes should handle empty login_attributes"
    (let [user {:login_attributes {}
                :jwt_attributes {"jwt_attr" "jwt_value"}
                :email "test@example.com"}
          result (user/add-attributes user)]
      (is (= {"jwt_attr" "jwt_value"}
             (:attributes result))))))

(deftest add-attributes-user-overrides-jwt-test
  (testing "add-attributes: user attributes should override jwt attributes with same keys"
    (let [user {:login_attributes {"shared_key" "user_value"
                                   "user_only" "user_val"}
                :jwt_attributes   {"shared_key" "jwt_value"
                                   "jwt_only" "jwt_val"}
                :email "test@example.com"}
          result (user/add-attributes user)]
      (is (= {"shared_key" "user_value"
              "jwt_only" "jwt_val"
              "user_only" "user_val"}
             (:attributes result))))))

(deftest add-attributes-preserves-user-fields-test
  (testing "add-attributes should preserve all other user fields"
    (let [user {:id 123
                :email "test@example.com"
                :first_name "John"
                :last_name "Doe"
                :jwt_attributes {"jwt_attr" "jwt_value"}
                :login_attributes {"user_attr" "user_value"}}
          result (user/add-attributes user)]
      (is (= 123 (:id result)))
      (is (= "test@example.com" (:email result)))
      (is (= "John" (:first_name result)))
      (is (= "Doe" (:last_name result)))
      (is (= {"user_attr" "user_value"} (:login_attributes result)))
      (is (= {"jwt_attr" "jwt_value"
              "user_attr" "user_value"}
             (:attributes result))))))

(deftest add-attributes-merges-tenant-attributes-test
  (testing "add-attributes should merge tenant attributes"
    (with-redefs [tenants/login-attributes (constantly {"tenant_attr" "tenant_value"})]
      (let [user {:login_attributes {"user_attr" "user_value"}
                  :email "test@example.com"}
            result (user/add-attributes user)]
        (is (= {"tenant_attr" "tenant_value"
                "user_attr" "user_value"}
               (:attributes result)))
        (is (= user (dissoc result :attributes)))))))

(deftest add-attributes-tenant-handles-nil-login-attributes-test
  (testing "add-attributes with tenant attributes should handle nil login_attributes"
    (with-redefs [tenants/login-attributes (constantly {"tenant_attr" "tenant_value"})]
      (let [user {:email "test@example.com"}
            result (user/add-attributes user)]
        (is (= {"tenant_attr" "tenant_value"}
               (:attributes result)))))))

(deftest add-attributes-tenant-handles-empty-login-attributes-test
  (testing "add-attributes with tenant attributes should handle empty login_attributes"
    (with-redefs [tenants/login-attributes (constantly {"tenant_attr" "tenant_value"})]
      (let [user {:login_attributes {}
                  :email "test@example.com"}
            result (user/add-attributes user)]
        (is (= {"tenant_attr" "tenant_value"}
               (:attributes result)))))))

(deftest add-attributes-handles-nil-tenant-attributes-test
  (testing "add-attributes should handle nil tenant attributes"
    (with-redefs [tenants/login-attributes (constantly nil)]
      (let [user {:login_attributes {"user_attr" "user_value"}
                  :email "test@example.com"}
            result (user/add-attributes user)]
        (is (= {"user_attr" "user_value"}
               (:attributes result)))))))

(deftest add-attributes-handles-both-nil-tenant-and-user-attributes-test
  (testing "add-attributes should handle both nil tenant and user attributes"
    (with-redefs [tenants/login-attributes (constantly nil)]
      (let [user {:email "test@example.com"}
            result (user/add-attributes user)]
        (is (= {}
               (:attributes result)))))))

(deftest add-attributes-user-overrides-tenant-test
  (testing "add-attributes: user attributes should override tenant attributes with same keys"
    (with-redefs [tenants/login-attributes (constantly {"shared_key" "tenant_value"
                                                        "tenant_only" "tenant_val"})]
      (let [user {:login_attributes {"shared_key" "user_value"
                                     "user_only" "user_val"}
                  :email "test@example.com"}
            result (user/add-attributes user)]
        (is (= {"shared_key" "user_value"
                "tenant_only" "tenant_val"
                "user_only" "user_val"}
               (:attributes result)))))))

(deftest add-attributes-tenant-preserves-user-fields-test
  (testing "add-attributes with tenant attributes should preserve all other user fields"
    (with-redefs [tenants/login-attributes (constantly {"tenant_attr" "tenant_value"})]
      (let [user {:id 123
                  :email "test@example.com"
                  :first_name "John"
                  :last_name "Doe"
                  :login_attributes {"user_attr" "user_value"}}
            result (user/add-attributes user)]
        (is (= 123 (:id result)))
        (is (= "test@example.com" (:email result)))
        (is (= "John" (:first_name result)))
        (is (= "Doe" (:last_name result)))
        (is (= {"user_attr" "user_value"} (:login_attributes result)))
        (is (= {"tenant_attr" "tenant_value"
                "user_attr" "user_value"}
               (:attributes result)))))))

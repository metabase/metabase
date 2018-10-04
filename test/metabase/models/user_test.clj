(ns metabase.models.user-test
  (:require [clojure.string :as str]
            [expectations :refer :all]
            [metabase
             [email-test :as email-test]
             [http-client :as http]]
            [metabase.models
             [collection :as collection :refer [Collection]]
             [collection-test :as collection-test]
             [permissions :as perms]
             [permissions-group :refer [PermissionsGroup]]
             [permissions-group-membership :refer [PermissionsGroupMembership]]
             [user :as user :refer [User]]]
            [metabase.test.data.users :as test-users :refer [user->id]]
            [metabase.test.util :as tu]
            [metabase.util.password :as upass]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;;; Tests for permissions-set

;; Make sure the test users have valid permissions sets
(expect (perms/is-permissions-set? (user/permissions-set (user->id :rasta))))
(expect (perms/is-permissions-set? (user/permissions-set (user->id :crowberto))))
(expect (perms/is-permissions-set? (user/permissions-set (user->id :lucky))))
(expect (perms/is-permissions-set? (user/permissions-set (user->id :trashbird))))

;; Ok, adding a group with *no* permissions shouldn't suddenly break all the permissions sets
;; (This was a bug @tom found where a group with no permissions would cause the permissions set to contain `nil`).
(expect
  (tt/with-temp* [PermissionsGroup           [{group-id :id}]
                  PermissionsGroupMembership [_              {:group_id group-id, :user_id (user->id :rasta)}]]
    (perms/is-permissions-set? (user/permissions-set (user->id :rasta)))))

;; Does permissions-set include permissions for my Personal Collection?
(defn- remove-non-collection-perms [perms-set]
  (set (for [perms-path perms-set
             :when      (str/starts-with? perms-path "/collection/")]
         perms-path)))
(expect
  #{(perms/collection-readwrite-path (collection/user->personal-collection (user->id :lucky)))}
  (tu/with-non-admin-groups-no-root-collection-perms
    (-> (user/permissions-set (user->id :lucky))
        remove-non-collection-perms)))

;; ...and for any descendant Collections of my Personal Collection?
(expect
  #{(perms/collection-readwrite-path (collection/user->personal-collection (user->id :lucky)))
    "/collection/child/"
    "/collection/grandchild/"}
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [child-collection      {:name     "child"
                                                       :location (collection/children-location
                                                                  (collection/user->personal-collection
                                                                   (user->id :lucky)))}]
                    Collection [grandchild-collection {:name     "grandchild"
                                                       :location (collection/children-location child-collection)}]]
      (->> (user/permissions-set (user->id :lucky))
           remove-non-collection-perms
           (collection-test/perms-path-ids->names [child-collection grandchild-collection])))))


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
             {address (for [{subject :subject} emails]
                        (str/replace subject (str new-user-first-name " " new-user-last-name) "<New User>"))})))


(defn- invite-user-accept-and-check-inboxes!
  "Create user by passing INVITE-USER-ARGS to `invite-user!` or `create-new-google-auth-user!`,
  and return a map of addresses emails were sent to to the email subjects."
  [& {:keys [google-auth? accept-invite? password invitor]
      :or   {accept-invite? true}}]
  (tu/with-temporary-setting-values [site-name "Metabase"]
    (email-test/with-fake-inbox
      (let [new-user-email      (tu/random-email)
            new-user-first-name (tu/random-name)
            new-user-last-name  (tu/random-name)
            new-user            {:first_name new-user-first-name
                                 :last_name  new-user-last-name
                                 :email      new-user-email
                                 :password   password}]
        (try
          (if google-auth?
            (user/create-new-google-auth-user! (dissoc new-user :password))
            (user/invite-user!                 new-user invitor))
          (when accept-invite?
            (maybe-accept-invite! new-user-email))
          (sent-emails new-user-email new-user-first-name new-user-last-name)
          ;; Clean up after ourselves
          (finally
            (db/delete! User :email new-user-email)))))))

(def ^:private default-invitor
  {:email "crowberto@metabase.com", :is_active true, :first_name "Crowberto"})

;; admin shouldn't get email saying user joined until they accept the invite (i.e., reset their password)
(expect
  {"<New User>"             ["You're invited to join Metabase's Metabase"]}
  (do
    (test-users/delete-temp-users!)
    (invite-user-accept-and-check-inboxes! :invitor default-invitor, :accept-invite? false)))

;; admin should get an email when a new user joins...
(expect
  {"<New User>"             ["You're invited to join Metabase's Metabase"]
   "crowberto@metabase.com" ["<New User> accepted their Metabase invite"]}
  (do
    (test-users/delete-temp-users!)
    (invite-user-accept-and-check-inboxes! :invitor default-invitor)))

;; ...including the site admin if it is set...
(expect
  {"<New User>"             ["You're invited to join Metabase's Metabase"]
   "crowberto@metabase.com" ["<New User> accepted their Metabase invite"]
   "cam@metabase.com"       ["<New User> accepted their Metabase invite"]}
  (tu/with-temporary-setting-values [admin-email "cam@metabase.com"]
    (test-users/delete-temp-users!)
    (invite-user-accept-and-check-inboxes! :invitor default-invitor)))

;; ... but if that admin is inactive they shouldn't get an email
(expect
  {"<New User>"             ["You're invited to join Metabase's Metabase"]
   "crowberto@metabase.com" ["<New User> accepted their Metabase invite"]}
  (do
    (test-users/delete-temp-users!)
    (tt/with-temp User [inactive-admin {:is_superuser true, :is_active false}]
      (invite-user-accept-and-check-inboxes! :invitor (assoc inactive-admin :is_active false)))))

;; for google auth, all admins should get an email...
(expect
  {"crowberto@metabase.com"        ["<New User> created a Metabase account"]
   "some_other_admin@metabase.com" ["<New User> created a Metabase account"]}
  (do
    (test-users/delete-temp-users!)
    (tt/with-temp User [_ {:is_superuser true, :email "some_other_admin@metabase.com"}]
      (invite-user-accept-and-check-inboxes! :google-auth? true))))

;; ...including the site admin if it is set...
(expect
  {"crowberto@metabase.com"        ["<New User> created a Metabase account"]
   "some_other_admin@metabase.com" ["<New User> created a Metabase account"]
   "cam@metabase.com"              ["<New User> created a Metabase account"]}
  (tu/with-temporary-setting-values [admin-email "cam@metabase.com"]
    (test-users/delete-temp-users!)
    (tt/with-temp User [_ {:is_superuser true, :email "some_other_admin@metabase.com"}]
      (invite-user-accept-and-check-inboxes! :google-auth? true))))

;; ...unless they are inactive
(expect
  {"crowberto@metabase.com" ["<New User> created a Metabase account"]}
  (do
    (test-users/delete-temp-users!)
    (tt/with-temp User [_ {:is_superuser true, :is_active false}]
      (invite-user-accept-and-check-inboxes! :google-auth? true))))

;; LDAP users should not persist their passwords. Check that if somehow we get passed an LDAP user password, it gets
;; swapped with something random
(expect
  false
  (try
    (user/create-new-ldap-auth-user! {:email      "ldaptest@metabase.com"
                                      :first_name "Test"
                                      :last_name  "SomeLdapStuff"
                                      :password   "should be removed"})
    (let [{:keys [password password_salt]} (db/select-one [User :password :password_salt] :email "ldaptest@metabase.com")]
      (upass/verify-password "should be removed" password_salt password))
    (finally
      (db/delete! User :email "ldaptest@metabase.com"))))

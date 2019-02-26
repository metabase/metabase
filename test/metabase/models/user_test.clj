(ns metabase.models.user-test
  (:require [clojure.string :as str]
            [expectations :refer :all]
            [metabase
             [email-test :as email-test]
             [http-client :as http]
             [util :as u]]
            [metabase.models
             [collection :as collection :refer [Collection]]
             [collection-test :as collection-test]
             [permissions :as perms]
             [permissions-group :as group :refer [PermissionsGroup]]
             [permissions-group-membership :refer [PermissionsGroupMembership]]
             [user :as user :refer [User]]]
            [metabase.test.data.users :as test-users :refer [user->id]]
            [metabase.test.util :as tu]
            [metabase.util.password :as upass]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
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
             [address (for [{subject :subject} emails]
                        (str/replace subject (str new-user-first-name " " new-user-last-name) "<New User>"))])))


(defn- invite-user-accept-and-check-inboxes!
  "Create user by passing INVITE-USER-ARGS to `create-and-invite-user!` or `create-new-google-auth-user!`,
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
            (user/create-and-invite-user!                 new-user invitor))
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
  {"<New User>" ["You're invited to join Metabase's Metabase"]}
  (invite-user-accept-and-check-inboxes! :invitor default-invitor, :accept-invite? false))

;; admin should get an email when a new user joins...
(expect
  {"<New User>"             ["You're invited to join Metabase's Metabase"]
   "crowberto@metabase.com" ["<New User> accepted their Metabase invite"]}
  (invite-user-accept-and-check-inboxes! :invitor default-invitor))

;; ...including the site admin if it is set...
(expect
  {"<New User>"             ["You're invited to join Metabase's Metabase"]
   "crowberto@metabase.com" ["<New User> accepted their Metabase invite"]
   "cam@metabase.com"       ["<New User> accepted their Metabase invite"]}
  (tu/with-temporary-setting-values [admin-email "cam@metabase.com"]
    (invite-user-accept-and-check-inboxes! :invitor default-invitor)))

;; ... but if that admin is inactive they shouldn't get an email
(expect
  {"<New User>"             ["You're invited to join Metabase's Metabase"]
   "crowberto@metabase.com" ["<New User> accepted their Metabase invite"]}
  (tt/with-temp User [inactive-admin {:is_superuser true, :is_active false}]
    (invite-user-accept-and-check-inboxes! :invitor (assoc inactive-admin :is_active false))))

;; for google auth, all admins should get an email...
(expect
  {"crowberto@metabase.com"        ["<New User> created a Metabase account"]
   "some_other_admin@metabase.com" ["<New User> created a Metabase account"]}
  (tt/with-temp User [_ {:is_superuser true, :email "some_other_admin@metabase.com"}]
    (invite-user-accept-and-check-inboxes! :google-auth? true)))

;; ...including the site admin if it is set...
(expect
  {"crowberto@metabase.com"        ["<New User> created a Metabase account"]
   "some_other_admin@metabase.com" ["<New User> created a Metabase account"]
   "cam@metabase.com"              ["<New User> created a Metabase account"]}
  (tu/with-temporary-setting-values [admin-email "cam@metabase.com"]
    (tt/with-temp User [_ {:is_superuser true, :email "some_other_admin@metabase.com"}]
      (invite-user-accept-and-check-inboxes! :google-auth? true))))

;; ...unless they are inactive
(expect
  {"crowberto@metabase.com" ["<New User> created a Metabase account"]}
  (tt/with-temp User [_ {:is_superuser true, :is_active false}]
    (invite-user-accept-and-check-inboxes! :google-auth? true)))

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

;; when you create a new user with `is_superuser` set to `true`, it should create a PermissionsGroupMembership object
(expect
  true
  (tt/with-temp User [user {:is_superuser true}]
    (db/exists? PermissionsGroupMembership :user_id (u/get-id user), :group_id (u/get-id (group/admin)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            New Group IDs Functions                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn group-names [groups-or-ids]
  (when (seq groups-or-ids)
    (db/select-field :name PermissionsGroup :id [:in (map u/get-id groups-or-ids)])))

(defn- do-with-group [group-properties group-members f]
  (tt/with-temp PermissionsGroup [group group-properties]
    (doseq [member group-members]
      (db/insert! PermissionsGroupMembership
        {:group_id (u/get-id group)
         :user_id  (if (keyword? member)
                     (test-users/user->id member)
                     (u/get-id member))}))
    (f group)))

(defmacro ^:private with-groups [[group-binding group-properties members & more-groups] & body]
  (if (seq more-groups)
    `(with-groups [~group-binding ~group-properties ~members]
       (with-groups ~more-groups
         ~@body))
    `(do-with-group ~group-properties ~members (fn [~group-binding] ~@body))))

;; make sure that the `group-ids` hydration function works as expected
(expect
  #{"All Users" "Group 2" "Group 1"}
  (with-groups [_ {:name "Group 1"} #{:lucky :rasta}
                _ {:name "Group 2"} #{:lucky}
                _ {:name "Group 3"} #{}]
    (group-names (user/group-ids (test-users/user->id :lucky)))))

;; `group-ids` should be a single DB call
(expect
  1
  (with-groups [_ {:name "Group 1"} #{:lucky}
                _ {:name "Group 2"} #{:lucky}
                _ {:name "Group 3"} #{}]
    (let [lucky-id (test-users/user->id :lucky)]
      (db/with-call-counting [call-count]
        (user/group-ids lucky-id)
        (call-count)))))

;; `group-ids` shouldn't barf if passed `nil`
(expect
  nil
  (user/group-ids nil))

;; check that the `add-group-ids` hydration function can do a batched hydrate
(expect
  {"Lucky" #{"All Users" "Group 1" "Group 2"}
   "Rasta" #{"All Users" "Group 1"}}
  (with-groups [_ {:name "Group 1"} #{:lucky :rasta}
                _ {:name "Group 2"} #{:lucky}
                _ {:name "Group 3"} #{}]
    (let [users (user/add-group-ids (map test-users/fetch-user [:lucky :rasta]))]
      (zipmap (map :first_name users)
              (map (comp group-names :group_ids) users)))))

;; `add-group-ids` should be the hydrate function for a `:group_ids` for a single User
(expect
  '(user/add-group-ids <users>)
  (with-redefs [user/group-ids     (constantly '(user/group-ids <user>))
                user/add-group-ids (fn [users]
                                     (for [user users]
                                       (assoc user :group_ids '(user/add-group-ids <users>))))]
    (-> (hydrate (User (test-users/user->id :lucky)) :group_ids)
        :group_ids)))

;; `add-group-ids` should be the batched hydrate function for a `:group_ids`
;; (Toucan can/will use batched hydrate functions to hydrate single objects)
(expect
  '[(user/add-group-ids <users>)
    (user/add-group-ids <users>)]
  (with-redefs [user/group-ids     (constantly '(user/group-ids <user>))
                user/add-group-ids (fn [users]
                                     (for [user users]
                                       (assoc user :group_ids '(user/add-group-ids <users>))))]
    (as-> (map test-users/fetch-user [:rasta :lucky]) users
      (hydrate users :group_ids)
      (mapv :group_ids users))))

;; ...it should do it in a single DB call
(expect
  1
  (with-groups [_ {:name "Group 1"} #{:lucky :rasta}
                _ {:name "Group 2"} #{:lucky}
                _ {:name "Group 3"} #{}]
    (let [users (mapv test-users/fetch-user [:lucky :rasta])]
      (db/with-call-counting [call-count]
        (dorun (user/add-group-ids users))
        (call-count)))))

;; `add-group-ids` shouldn't barf if passed an empty seq
(expect
  nil
  (user/add-group-ids []))

(defn user-group-names [user-or-id-or-kw]
  (group-names (user/group-ids (if (keyword? user-or-id-or-kw)
                                 (test-users/fetch-user user-or-id-or-kw)
                                 user-or-id-or-kw))))

;; check that we can use `set-permissions-groups!` to add a User to new groups
(expect
  #{"All Users" "Group 1" "Group 2"}
  (with-groups [group-1 {:name "Group 1"} #{}
                group-2 {:name "Group 2"} #{}]
    (user/set-permissions-groups! (test-users/user->id :lucky) #{(group/all-users) group-1 group-2})
    (user-group-names :lucky)))

;; check that we can use `set-permissions-groups!` to remove a User from groups
(expect
  #{"All Users"}
  (with-groups [group-1 {:name "Group 1"} #{:lucky}
                group-2 {:name "Group 2"} #{:lucky}]
    (user/set-permissions-groups! (test-users/user->id :lucky) #{(group/all-users)})
    (user-group-names :lucky)))

;; check that `set-permissions-groups!` can add & remove groups all at once! :wow:
(expect
  #{"All Users" "Group 2"}
  (with-groups [group-1 {:name "Group 1"} #{:lucky}
                group-2 {:name "Group 2"} #{}]
    (user/set-permissions-groups! (test-users/user->id :lucky) #{(group/all-users) group-2})
    (user-group-names :lucky)))

;; `set-permissions-groups!` should throw an Exception if you attempt to remove someone from All Users
(expect
  Exception
  (with-groups [group-1 {:name "Group 1"} #{}]
    (user/set-permissions-groups! (test-users/user->id :lucky) #{group-1})))

;; `set-permissions-groups!` should let someone be added to Admin group
(expect
  #{"Administrators" "All Users"}
  (tt/with-temp User [user]
    (user/set-permissions-groups! user #{(group/all-users) (group/admin)})
    (user-group-names user)))

;; is_superuser should get set when adding a user to admin via `set-permissions-groups!`
(expect
  {:is_superuser true}
  (tt/with-temp User [user]
    (user/set-permissions-groups! user #{(group/all-users) (group/admin)})
    (db/select-one [User :is_superuser] :id (u/get-id user))))

;; `set-permissions-groups!` should let someone be removed from Admin group
(expect
  #{"All Users"}
  (tt/with-temp User [user {:is_superuser true}]
    (user/set-permissions-groups! user #{(group/all-users)})
    (user-group-names user)))

(expect
  false
  (tt/with-temp User [user {:is_superuser true}]
    (user/set-permissions-groups! user #{(group/all-users)})
    (db/select-one-field :is_superuser User :id (u/get-id user))))

;; The entire set of changes should run in a transaction -- if one set of changes fails, others should not be persisted
;; [INVALID ADD]
(expect
  true
  ;; User should not be removed from the admin group because the attempt to add them to the Integer/MAX_VALUE group
  ;; should fail, causing the entire transaction to fail
  (tt/with-temp User [user {:is_superuser true}]
    (u/ignore-exceptions
      (user/set-permissions-groups! user #{(group/all-users) Integer/MAX_VALUE}))
    (db/select-one-field :is_superuser User :id (u/get-id user))))

;; If an INVALID REMOVE is attempted, valid adds should not be persisted
;; Attempt to remove someone from All Users + add to a valid group at the same time -- neither should persist
(expect
  #{"All Users"}
  (tt/with-temp User [user]
    (with-groups [group {:name "Group"} {}]
      (u/ignore-exceptions
        (user/set-permissions-groups! (test-users/fetch-user :lucky) #{group})))
    (user-group-names :lucky)))

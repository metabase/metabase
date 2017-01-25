(ns metabase.models.user-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.email-test :as email-test]
            (metabase.models [permissions :as perms]
                             [permissions-group :refer [PermissionsGroup]]
                             [permissions-group-membership :refer [PermissionsGroupMembership]]
                             [user :refer [User], :as user])
            [metabase.test.data.users :as test-users, :refer [user->id]]
            [metabase.test.util :as tu]
            [metabase.util :as u]))


;;; Tests for permissions-set

;; Make sure the test users have valid permissions sets
(expect (perms/is-permissions-set? (user/permissions-set (user->id :rasta))))
(expect (perms/is-permissions-set? (user/permissions-set (user->id :crowberto))))
(expect (perms/is-permissions-set? (user/permissions-set (user->id :lucky))))
(expect (perms/is-permissions-set? (user/permissions-set (user->id :trashbird))))

;; Ok, adding a group with *no* permissions shouldn't suddenly break all the permissions sets
;; (This was a bug @tom found where a group with no permissions would cause the permissions set to contain `nil`).
(expect (tu/with-temp* [PermissionsGroup           [{group-id :id}]
                        PermissionsGroupMembership [_              {:group_id group-id, :user_id (user->id :rasta)}]]
          (perms/is-permissions-set? (user/permissions-set (user->id :rasta)))))


;;; Tests for create-user!

(defn- create-user-and-check-inbox!
  "Create user by passing CREATE-USER-ARGS to `create-user!`, and return a set of addresses emails were sent to."
  [& create-user-args]
  (email-test/with-fake-inbox
    (let [email (tu/random-email)]
      (try
        (apply user/create-user! (tu/random-name) (tu/random-name) email create-user-args)
        (set (keys @email-test/inbox))
        (finally
          (db/cascade-delete! User :email email)))))) ; Clean up after ourselves

;; admin should get an email when a new user joins...
(expect
  #{"crowberto@metabase.com"}
  (do
    (test-users/delete-temp-users!)
    (create-user-and-check-inbox! :invitor {:email "crowberto@metabase.com", :is_active true})))

;; ... but if that admin is inactive they shouldn't get an email
(expect
  #{}
  (do
    (test-users/delete-temp-users!)
    (tu/with-temp User [inactive-admin {:is_superuser true, :is_active false}]
      (create-user-and-check-inbox! :invitor (assoc inactive-admin :is_active false)))))

;; for google auth, all admins should get an email...
(expect
  #{"crowberto@metabase.com" "some_other_admin@metabase.com"}
  (do
    (test-users/delete-temp-users!)
    (tu/with-temp User [_ {:is_superuser true, :email "some_other_admin@metabase.com"}]
      (create-user-and-check-inbox! :google-auth? true))))

;; ...including the site admin if it is set...
(expect
  #{"crowberto@metabase.com" "some_other_admin@metabase.com" "cam@metabase.com"}
  (tu/with-temporary-setting-values [admin-email "cam@metabase.com"]
    (test-users/delete-temp-users!)
    (tu/with-temp User [_ {:is_superuser true, :email "some_other_admin@metabase.com"}]
      (create-user-and-check-inbox! :google-auth? true))))

;; ...unless they are inactive
(expect
  #{"crowberto@metabase.com"}
  (do
    (test-users/delete-temp-users!)
    (tu/with-temp User [_ {:is_superuser true, :is_active false}]
      (create-user-and-check-inbox! :google-auth? true))))

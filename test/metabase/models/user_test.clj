(ns metabase.models.user-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            (metabase.models [permissions :as perms]
                             [permissions-group :refer [PermissionsGroup]]
                             [permissions-group-membership :refer [PermissionsGroupMembership]]
                             [user :as user])
            [metabase.test.data.users :refer [user->id]]
            [metabase.test.util :as tu]))


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

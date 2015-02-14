(ns metabase.models.common
  (:require [metabase.api.common :refer [*current-user-id* check org-perms-case]]
            [metabase.util :refer :all]))

(def perms-none 0)
(def perms-read 1)
(def perms-readwrite 2)

(def permissions
  [{:id perms-none :name "None"},
   {:id perms-read :name "Read Only"},
   {:id perms-readwrite :name "Read & Write"}])

(defn public-permissions
  "Return the set of public permissions for some object with key `:public_perms`. Possible permissions are `:read` and `:write`."
  [{:keys [public_perms]}]
  (check public_perms 500 "Can't check public permissions: object doesn't have :public_perms.")
  ({0 #{}
    1 #{:read}
    2 #{:read :write}} public_perms))

(defn user-permissions
  "Return the set of current user's permissions for some object with keys `:creator_id`, `:organization_id`, and `:public_perms`."
  [{:keys [creator_id organization_id public_perms] :as obj}]
  (check creator_id      500 "Can't check user permissions: object doesn't have :creator_id.")
  (check organization_id 500 "Can't check user permissions: object doesn't have :organization_id.")
  (check public_perms    500 "Can't check user permissions: object doesn't have :public_perms.")
  (if (= creator_id *current-user-id*) #{:read :write}              ; if user created OBJ they have all permissions
      (org-perms-case (if (delay? organization_id) @organization_id
                          organization_id)
        nil      #{}                                                ; if user has no permissions for OBJ's Org then they have none for OBJ
        :admin   #{:read :write}                                    ; if user is an admin they have all permissions
        :default (public-permissions obj))))

(defn user-can?
  "Check if *current-user* has a given PERMISSION for OBJ.
   PERMISSION should be either `:read` or `:write`."
  [permission obj]
  (contains? @(:user-permissions-set obj) permission))

(defn assoc-permissions-sets [{:keys [creator_id organization_id public_perms] :as obj}]
  (assoc* obj
          :public-permissions-set (delay (public-permissions <>))
          :user-permissions-set (delay (user-permissions <>))
          :can_read (delay (user-can? :read <>))
          :can_write (delay (user-can? :write <>))))

(def timezones
  ['GMT',
   'UTC',
   'US/Alaska',
   'US/Arizona',
   'US/Central',
   'US/Eastern',
   'US/Hawaii',
   'US/Mountain',
   'US/Pacific',
   'America/Costa_Rica'
   ])

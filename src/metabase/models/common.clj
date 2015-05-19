(ns metabase.models.common
  (:require [metabase.api.common :refer [*current-user* *current-user-id* check]]
            [metabase.util :as u]))

(def timezones
  ["GMT"
   "UTC"
   "US/Alaska"
   "US/Arizona"
   "US/Central"
   "US/Eastern"
   "US/Hawaii"
   "US/Mountain"
   "US/Pacific"
   "America/Costa_Rica"])

;;; ALLEN'S PERMISSIONS IMPLEMENTATION

(def perms-none 0)
(def perms-read 1)
(def perms-readwrite 2)

(def permissions
  [{:id perms-none :name "None"},
   {:id perms-read :name "Read Only"},
   {:id perms-readwrite :name "Read & Write"}])


;;; CAM'S PERMISSIONS IMPL
;; (TODO - need to use one or the other)

(defn public-permissions
  "Return the set of public permissions for some object with key `:public_perms`. Possible permissions are `:read` and `:write`."
  [{:keys [public_perms]}]
  (check public_perms 500 "Can't check public permissions: object doesn't have :public_perms.")
  ({0 #{}
    1 #{:read}
    2 #{:read :write}} public_perms))

(defn user-permissions
  "Return the set of current user's permissions for some object with keys `:creator_id` and `:public_perms`."
  [{:keys [creator_id public_perms] :as obj}]
  (check creator_id      500 "Can't check user permissions: object doesn't have :creator_id."
         public_perms    500 "Can't check user permissions: object doesn't have :public_perms.")
  (cond (:is_superuser *current-user*)   #{:read :write}    ; superusers have full access to everything
        (= creator_id *current-user-id*) #{:read :write}    ; if user created OBJ they have all permissions
        (>= perms-read public_perms)     #{:read}           ; if the object is public then everyone gets :read
        :else                            #{}))              ; default is user has no permissions a.k.a private

(defn user-can?
  "Check if *current-user* has a given PERMISSION for OBJ.
   PERMISSION should be either `:read` or `:write`."
  [permission obj]
  (contains? @(:user-permissions-set obj) permission))

(defn assoc-permissions-sets
  "Associates the following delays with OBJ:

   *  `:public-permissions-set`
   *  `:user-permissions-set`
   *  `:can_read`
   *  `:can_write`

  Note that these delays depend upon the presence of `creator_id`, and `public_perms` fields in OBJ."
  [obj]
  (u/assoc* obj
            :public-permissions-set (delay (public-permissions <>))
            :user-permissions-set (delay (user-permissions <>))
            :can_read (delay (user-can? :read <>))
            :can_write (delay (user-can? :write <>))))

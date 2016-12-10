(ns metabase.api.permissions-test
  "Tests for `/api/permissions` endpoints."
  (:require [expectations :refer :all]
            [metabase.models.permissions-group :refer [PermissionsGroup], :as group]
            [metabase.test.data.users :as test-users]
            [metabase.test.util :as tu]
            [metabase.util :as u]))


;; GET /permissions/group
;; Should *not* include inactive users in the counts.
;; It should also *not* include the MetaBot group because MetaBot should *not* be enabled
(defn- fetch-groups []
  (test-users/delete-temp-users!)
  (set ((test-users/user->client :crowberto) :get 200 "permissions/group")))

(expect
  #{{:id (u/get-id (group/all-users)), :name "All Users",      :members 3}
    {:id (u/get-id (group/admin)),     :name "Administrators", :members 1}}
  (fetch-groups))

;; The endpoint should however return empty groups!
(tu/expect-with-temp [PermissionsGroup [group]]
  #{{:id (u/get-id (group/all-users)), :name "All Users",      :members 3}
    {:id (u/get-id (group/admin)),     :name "Administrators", :members 1}
    (assoc (into {} group) :members 0)}
  (fetch-groups))


;; GET /permissions/group/:id
;; Should *not* include inactive users
(expect
  #{{:first_name "Crowberto", :last_name "Corv",   :email "crowberto@metabase.com", :user_id (test-users/user->id :crowberto), :membership_id true}
    {:first_name "Lucky",     :last_name "Pigeon", :email "lucky@metabase.com",     :user_id (test-users/user->id :lucky),     :membership_id true}
    {:first_name "Rasta",     :last_name "Toucan", :email "rasta@metabase.com",     :user_id (test-users/user->id :rasta),     :membership_id true}}
  (do
    (test-users/delete-temp-users!)
    (set (for [member (:members ((test-users/user->client :crowberto) :get 200 (str "permissions/group/" (u/get-id (group/all-users)))))]
           (update member :membership_id (complement nil?))))))

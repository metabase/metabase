(ns metabase.api.permissions-test
  "Tests for `/api/permissions` endpoints."
  (:require [expectations :refer :all]
            [metabase.models
             [permissions :as perms]
             [permissions-group :as group :refer [PermissionsGroup]]]
            [metabase.test.data :as data]
            [metabase.test.data.users :as test-users]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

;; GET /permissions/group
;; Should *not* include inactive users in the counts.
;; It should also *not* include the MetaBot group because MetaBot should *not* be enabled
(defn- fetch-groups []
  (set ((test-users/user->client :crowberto) :get 200 "permissions/group")))

(expect
  #{{:id (u/get-id (group/all-users)), :name "All Users",      :member_count 3}
    {:id (u/get-id (group/admin)),     :name "Administrators", :member_count 1}}
  ;; make sure test users are created first, otherwise we're possibly going to have some WEIRD results
  (do
    (test-users/create-users-if-needed!)
    (fetch-groups)))

;; The endpoint should however return empty groups!
(tt/expect-with-temp [PermissionsGroup [group]]
  #{{:id (u/get-id (group/all-users)), :name "All Users",      :member_count 3}
    {:id (u/get-id (group/admin)),     :name "Administrators", :member_count 1}
    (assoc (into {} group) :member_count 0)}
  (fetch-groups))


;; GET /permissions/group/:id
;; Should *not* include inactive users
(expect
  #{{:first_name "Crowberto", :last_name "Corv",   :email "crowberto@metabase.com", :user_id (test-users/user->id :crowberto), :membership_id true}
    {:first_name "Lucky",     :last_name "Pigeon", :email "lucky@metabase.com",     :user_id (test-users/user->id :lucky),     :membership_id true}
    {:first_name "Rasta",     :last_name "Toucan", :email "rasta@metabase.com",     :user_id (test-users/user->id :rasta),     :membership_id true}}
  (do
    (test-users/create-users-if-needed!)
    (set
     (for [member (:members ((test-users/user->client :crowberto) :get 200 (str "permissions/group/" (u/get-id (group/all-users)))))]
       (update member :membership_id some?)))))


;; make sure we can update the perms graph from the API
(expect
  {(data/id :categories) :none
   (data/id :checkins)   :none
   (data/id :users)      :none
   (data/id :venues)     :all}
  (tt/with-temp PermissionsGroup [group]
    ((test-users/user->client :crowberto) :put 200 "permissions/graph"
     (assoc-in (perms/graph)
               [:groups (u/get-id group) (data/id) :schemas]
               {"PUBLIC" {(data/id :venues) :all}}))
    (get-in (perms/graph) [:groups (u/get-id group) (data/id) :schemas "PUBLIC"])))

(expect
 {(data/id :categories) :none
  (data/id :checkins)   :none
  (data/id :users)      :none
  (data/id :venues)     {:read  :all
                         :query :segmented}}
 (tt/with-temp PermissionsGroup [group]
   (test-users/create-users-if-needed!)
   ((test-users/user->client :crowberto) :put 200 "permissions/graph"
    (assoc-in (perms/graph)
              [:groups (u/get-id group) (data/id) :schemas]
              {"PUBLIC" {(data/id :venues) {:read :all, :query :segmented}}}))
   (get-in (perms/graph) [:groups (u/get-id group) (data/id) :schemas "PUBLIC"])))

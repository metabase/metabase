(ns metabase.api.permissions-test
  "Tests for `api/permissions` endpoints."
  (:require [expectations :refer :all]
            [metabase.test.data.users :as tu]
            [metabase.models.permissions-group :as group]
            [metabase.util :as u]))


;; GET /group
;; Should *not* include inactive users in the counts.
;; It should also *not* include the MetaBot group because MetaBot should *not* be enabled
(expect
  #{{:id (u/get-id (group/all-users)), :name "All Users",      :members 3}
    {:id (u/get-id (group/admin)),     :name "Administrators", :members 1}}
  (do
    (tu/delete-temp-users!)
    (set ((tu/user->client :crowberto) :get 200 "permissions/group"))))

;; GET /group/:id
;; Should *not* include inactive users
(expect
  #{{:first_name "Crowberto", :last_name "Corv",   :email "crowberto@metabase.com", :user_id (tu/user->id :crowberto), :membership_id true}
    {:first_name "Lucky",     :last_name "Pigeon", :email "lucky@metabase.com",     :user_id (tu/user->id :lucky),     :membership_id true}
    {:first_name "Rasta",     :last_name "Toucan", :email "rasta@metabase.com",     :user_id (tu/user->id :rasta),     :membership_id true}}
  (do
    (tu/delete-temp-users!)
    (set (for [member (:members ((tu/user->client :crowberto) :get 200 (str "permissions/group/" (u/get-id (group/all-users)))))]
           (update member :membership_id (complement nil?))))))

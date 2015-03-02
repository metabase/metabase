(ns metabase.api.user-test
  "Tests for /api/user endpoints."
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            (metabase.models [org-perm :refer [OrgPerm]])
            (metabase [test-data :refer :all]
                      [test-utils :refer [deserialize-dates match-$]])))

(def rasta-org-perm-id (delay (sel :one :id OrgPerm :organization_id @org-id :user_id (user->id :rasta))))



;; ## GET /api/user/current
;; Check that fetching current user will return extra fields like `is_active` and will return OrgPerms
(expect (match-$ (fetch-user :rasta)
                 {:email "rasta@metabase.com"
                  :first_name "Rasta"
                  :last_name "Toucan"
                  :common_name "Rasta Toucan"
                  :date_joined $
                  :last_login $
                  :is_active true
                  :is_staff true
                  :is_superuser false
                  :id $
                  :org_perms [{:organization {:inherits true
                                              :logo_url nil
                                              :description nil
                                              :name "Test Organization"
                                              :slug "test"
                                              :id @org-id}
                               :organization_id @org-id
                               :user_id $id
                               :admin true
                               :id @rasta-org-perm-id}]})
  (-> ((user->client :rasta) :get 200 "user/current")
      (deserialize-dates :last_login :date_joined)))


;; ## GET /api/user/:id
;; Should return a smaller set of fields, and should *not* return OrgPerms
(expect (match-$ (fetch-user :rasta)
                 {:email "rasta@metabase.com"
                  :first_name "Rasta"
                  :last_login $
                  :is_superuser false
                  :id $
                  :last_name "Toucan"
                  :date_joined $
                  :common_name "Rasta Toucan"})
  (-> ((user->client :rasta) :get 200 (str "user/" (user->id :rasta)))
      (deserialize-dates :last_login :date_joined)))

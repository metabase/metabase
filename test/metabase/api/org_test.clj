(ns metabase.api.org-test
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            (metabase.models [org :refer [Org]]
                             [org-perm :refer [OrgPerm]])
            [metabase.test-data :refer :all]
            [metabase.test-data.create :refer [create-user]]
            [metabase.test.util :refer [match-$ random-name expect-eval-actual-first]]))

;; Helper Fns

(defn create-org [org-name]
  {:pre [(string? org-name)]}
  ((user->client :crowberto) :post 200 "org" {:name org-name
                                              :slug org-name}))

;; # GENERAL ORG ENDPOINTS

;; ## GET /api/org
;; Non-superusers should only be able to see Orgs they are members of
(expect
    [{:id (:id @test-org)
      :slug "test"
      :name "Test Organization"
      :description nil
      :logo_url nil
      :inherits true}]
  ((user->client :rasta) :get 200 "org"))

;; Superusers should be able to see all Orgs
(let [org-name (random-name)]
  (expect-eval-actual-first
      [{:id (:id @test-org)
        :slug "test"
        :name "Test Organization"
        :description nil
        :logo_url nil
        :inherits true}
       (match-$ (sel :one Org :name org-name)
         {:id $
          :slug $
          :name $
          :description nil
          :logo_url nil
          :inherits false})]
    (do
      ;; Delete all the random test Orgs we've created
      (cascade-delete Org :id [not= (:id @test-org)])
      ;; Create a random Org so we can check that we still get Orgs we're not members of
      (create-org org-name)
      ;; Now perform the API request
      ((user->client :crowberto) :get 200 "org"))))

;; ## GET /api/org/:id
(expect
    {:id (:id @test-org)
     :slug "test"
     :name "Test Organization"
     :description nil
     :logo_url nil
     :inherits true}
  ((user->client :rasta) :get 200 (format "org/%d" (:id @test-org))))

;; ## GET /api/org/slug/:slug
(expect
    {:id (:id @test-org)
     :slug "test"
     :name "Test Organization"
     :description nil
     :logo_url nil
     :inherits true}
  ((user->client :rasta) :get 200 (format "org/slug/%s" (:slug @test-org))))

;; ## POST /api/org
;; Check that non-superusers can't create Orgs
(expect "You don't have permissions to do that."
  (let [org-name (random-name)]
    ((user->client :rasta) :post 403 "org" {:name org-name
                                            :slug org-name})))

;; Check that superusers *can* create Orgs
(let [org-name (random-name)]
  (expect-eval-actual-first
      (match-$ (sel :one Org :name org-name)
        {:id $
         :slug org-name
         :name org-name
         :description nil
         :logo_url nil
         :inherits false})
    (create-org org-name)))


;; # MEMBERS ENDPOINTS

;; ## GET /api/org/:id/members
(expect
    #{(match-$ (user->org-perm :crowberto)
        {:id $
         :admin true
         :user_id (user->id :crowberto)
         :organization_id (:id @test-org)
         :user (match-$ (fetch-user :crowberto)
                 {:common_name "Crowberto Corv"
                  :date_joined $
                  :last_name "Corv"
                  :id $
                  :is_superuser true
                  :last_login $
                  :first_name "Crowberto"
                  :email "crowberto@metabase.com"})})
      (match-$ (user->org-perm :trashbird)
        {:id $
         :admin false
         :user_id (user->id :trashbird)
         :organization_id (:id @test-org)
         :user (match-$ (fetch-user :trashbird)
                 {:common_name "Trash Bird"
                  :date_joined $
                  :last_name "Bird"
                  :id $
                  :is_superuser false
                  :last_login $
                  :first_name "Trash"
                  :email "trashbird@metabase.com"})})
      (match-$ (user->org-perm :lucky)
        {:id $
         :admin false
         :user_id (user->id :lucky)
         :organization_id (:id @test-org)
         :user (match-$ (fetch-user :lucky)
                 {:common_name "Lucky Pigeon"
                  :date_joined $
                  :last_name "Pigeon"
                  :id $
                  :is_superuser false
                  :last_login $
                  :first_name "Lucky"
                  :email "lucky@metabase.com"})})
      (match-$ (user->org-perm :rasta)
        {:id $
         :admin true
         :user_id (user->id :rasta)
         :organization_id (:id @test-org)
         :user (match-$ (fetch-user :rasta)
                 {:common_name "Rasta Toucan"
                  :date_joined $
                  :last_name "Toucan"
                  :id $
                  :is_superuser false
                  :last_login $
                  :first_name "Rasta"
                  :email "rasta@metabase.com"})})}
  (set ((user->client :rasta) :get 200 (format "org/%d/members" (:id @test-org)))))

;; ## Helper Fns

(defn org-perm-exists? [org-id user-id]
  (exists? OrgPerm :organization_id org-id :user_id user-id))

(defn create-org-perm [org-id user-id]
  ((user->client :crowberto) :post 200 (format "org/%d/members/%d" org-id user-id) {:admin false}))

;; ## POST /api/org/:id/members/:user-id
;; Check that we can create an OrgPerm between existing User + Org
(expect [false
         true]
  (let [{org-id :id} (create-org (random-name))
        {user-id :id} (create-user)
        org-perm-exists? (partial org-perm-exists? org-id user-id)]
    [(org-perm-exists?)
     (do (create-org-perm org-id user-id)
         (org-perm-exists?))]))

;; ## DELETE /api/org/:id/members/:user-id
;; Check we can delete OrgPerms between a User + Org
(expect [false
         true
         false]
  (let [{org-id :id} (create-org (random-name))
        {user-id :id} (create-user)
        org-perm-exists? (partial org-perm-exists? org-id user-id)]
    [(org-perm-exists?)
     (do (create-org-perm org-id user-id)
         (org-perm-exists?))
     (do ((user->client :crowberto) :delete 204 (format "org/%d/members/%d" org-id user-id))
         (org-perm-exists?))]))

;; ## PUT /api/org/:id/members/:user-id
;; Check that we can edit an exisiting OrgPerm (i.e., toggle 'admin' status)
(expect
    [nil
     false
     true]
  (let [{org-id :id} (create-org (random-name))
        {user-id :id} (create-user)
        is-admin? (fn [] (sel :one :field [OrgPerm :admin] :user_id user-id :organization_id org-id))]
    [(is-admin?)
     (do (create-org-perm org-id user-id)
         (is-admin?))
     (do ((user->client :crowberto) :put 200 (format "org/%d/members/%d" org-id user-id) {:admin true})
         (is-admin?))]))

(ns metabase.api.org-test
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.http-client :as http]
            [metabase.middleware.auth :as auth]
            (metabase.models [org :refer [Org]]
                             [org-perm :refer [OrgPerm]]
                             [user :refer [User]])
            [metabase.test-data :refer :all]
            [metabase.test-data.create :refer [create-user]]
            [metabase.test.util :refer [match-$ random-name expect-eval-actual-first]]))

;; Helper Fns

(defn create-org [org-name]
  {:pre [(string? org-name)]}
  ((user->client :crowberto) :post 200 "org" {:name org-name
                                              :slug org-name}))

(defn org-perm-exists? [org-id user-id]
  (exists? OrgPerm :organization_id org-id :user_id user-id))

(defn create-org-perm [org-id user-id & {:keys [admin]
                                         :or {admin false}}]
  ((user->client :crowberto) :post 200 (format "org/%d/members/%d" org-id user-id) {:admin admin}))


;; ## /api/org/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get auth/response-unauthentic :body) (http/client :get 401 "org"))
(expect (get auth/response-unauthentic :body) (http/client :get 401 (format "org/%d" @org-id)))


;; # GENERAL ORG ENDPOINTS

;; ## GET /api/org
;; Non-superusers should only be able to see Orgs they are members of
(let [org-name (random-name)]
  (expect-eval-actual-first
    [{:id @org-id
      :slug "test"
      :name "Test Organization"
      :description nil
      :logo_url nil
      :inherits true}]
    (do
      ;; Delete all the random test Orgs we've created
      (cascade-delete Org :id [not= @org-id])
      ;; Create a random Org so we ensure there is an Org that should NOT show up in our list
      (create-org org-name)
      ;; Now perform the API request
      ((user->client :rasta) :get 200 "org"))))

;; Superusers should be able to see all Orgs
(let [org-name (random-name)]
  (expect-eval-actual-first
      [{:id @org-id
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
      (cascade-delete Org :id [not= @org-id])
      ;; Create a random Org so we can check that we still get Orgs we're not members of
      (create-org org-name)
      ;; Now perform the API request
      ((user->client :crowberto) :get 200 "org"))))


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
    (let [new-org (create-org org-name)
          org-perm (sel :one OrgPerm :organization_id (:id new-org))]
      ;; do a quick validation that the creator is now an admin of the new org
      (assert (= (:user_id org-perm) (user->id :crowberto)))
      (assert (:admin org-perm))
      ;; return the original api response, which should be the newly created org
      new-org)))

;; Test input validations on org create
(expect "'name' is a required param."
  ((user->client :crowberto) :post 400 "org" {}))

(expect "'slug' is a required param."
  ((user->client :crowberto) :post 400 "org" {:name "anything"}))


;; ## GET /api/org/:id
(expect
    {:id @org-id
     :slug "test"
     :name "Test Organization"
     :description nil
     :logo_url nil
     :inherits true}
  ((user->client :rasta) :get 200 (format "org/%d" @org-id)))

;; Check that non-superusers can't access orgs they don't have permissions to
(expect "You don't have permissions to do that."
  (let [org-name (random-name)
        my-org (create-org org-name)]
    ((user->client :rasta) :get 403 (format "org/%d" (:id my-org)))))

;; Test that invalid org id returns 404
(expect "Not found."
  ((user->client :rasta) :get 404 "org/1000"))

;; ## GET /api/org/slug/:slug
(expect
    {:id @org-id
     :slug "test"
     :name "Test Organization"
     :description nil
     :logo_url nil
     :inherits true}
  ((user->client :rasta) :get 200 (format "org/slug/%s" (:slug @test-org))))

;; Check that non-superusers can't access orgs they don't have permissions to
(expect "You don't have permissions to do that."
  (let [org-name (random-name)
        my-org (create-org org-name)]
    ((user->client :rasta) :get 403 (format "org/slug/%s" (:slug my-org)))))

;; Test that invalid org slug returns 404
(expect "Not found."
  ((user->client :rasta) :get 404 "org/slug/ksdlfkjdkfd"))


;; ## PUT /api/org/:id
;; Test that we can update an Org
(expect-let [orig-name (random-name)
             upd-name (random-name)
             {:keys [id slug inherits] :as org} (create-org orig-name)]
  {:id id
   :slug slug
   :name upd-name
   :description upd-name
   :logo_url upd-name
   :inherits false}
  ;; we try setting `slug` & `inherits` which should both remain unmodified
  ((user->client :crowberto) :put 200 (format "org/%d" id) {:slug upd-name
                                                            :name upd-name
                                                            :description upd-name
                                                            :logo_url upd-name
                                                            :inherits true}))

;; Check that non-superusers can't modify orgs they don't have permissions to
(expect "You don't have permissions to do that."
  (let [org-name (random-name)
        my-org (create-org org-name)]
    ((user->client :rasta) :put 403 (format "org/%d" (:id my-org)) {})))

;; Validate that write-perms are required to modify the org details (with user having read perms on org)
(expect "You don't have permissions to do that."
  (let [{user-id :id, email :email, password :first_name} (create-user)
        {org-id :id} (create-org (random-name))
        my-perm (create-org-perm org-id user-id :admin false)
        session-id (http/authenticate {:email email
                                       :password password})]
    (http/client session-id :put 403 (format "org/%d" org-id) {})))

;; Test that invalid org id returns 404
(expect "Not found."
  ((user->client :rasta) :put 404 "org/1000" {}))

;; ## DELETE /api/org/:id
(expect
    [true
     false]
    (let [org-name (random-name)
          {org-id :id} (ins Org :name org-name :slug org-name)]
      [(exists? Org :name org-name)
       (do ((user->client :crowberto) :delete 204 (format "org/%d" org-id))
           (exists? Org :name org-name))]))

;; Check that an admin for Org (non-superuser) can't delete it
(expect "You don't have permissions to do that."
  ((user->client :rasta) :delete 403 (format "org/%d" (:id @test-org))))


;; # MEMBERS ENDPOINTS

;; ## GET /api/org/:id/members
(expect
  #{(match-$ (user->org-perm :crowberto)
      {:id $
       :admin true
       :user_id (user->id :crowberto)
       :organization_id @org-id
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
       :organization_id @org-id
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
       :organization_id @org-id
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
       :organization_id @org-id
       :user (match-$ (fetch-user :rasta)
               {:common_name "Rasta Toucan"
                :date_joined $
                :last_name "Toucan"
                :id $
                :is_superuser false
                :last_login $
                :first_name "Rasta"
                :email "rasta@metabase.com"})})}
  (set ((user->client :rasta) :get 200 (format "org/%d/members" @org-id))))

;; Check that users without any org perms cannot list members
(expect "You don't have permissions to do that."
  (let [{:keys [id]} (create-org (random-name))]
    ((user->client :rasta) :get 403 (format "org/%d/members" id) {})))

;; Test that invalid org id returns 404
(expect "Not found."
  ((user->client :rasta) :get 404 "org/1000/members"))


;; ## POST /api/org/:id/members
;; Check that we can create a new User w/ OrgPerm
(let [test-org-name (random-name)
      user-to-create (random-name)]
  (expect-eval-actual-first
    (let [{my-user-id :id, :as my-user} (sel :one User :first_name user-to-create)
          {my-org-id :id} (sel :one Org :name test-org-name)]
      (match-$ (first (sel :many OrgPerm :user_id my-user-id))
        {:id $
         :admin false
         :user_id my-user-id
         :organization_id my-org-id
         :organization {:id my-org-id
                        :slug test-org-name
                        :name test-org-name
                        :description nil
                        :logo_url nil
                        :inherits false}
         :user {:common_name (:common_name my-user)
                :date_joined (:date_joined my-user)
                :last_name user-to-create
                :id my-user-id
                :is_superuser false
                :last_login (:last_login my-user)
                :first_name user-to-create
                :email (:email my-user)}}))
    (let [{user-id :id, email :email, password :first_name} (create-user)
          {org-id :id} (create-org test-org-name)
          my-perm (create-org-perm org-id user-id :admin true)
          session-id (http/authenticate {:email email
                                         :password password})]
      (http/client session-id :post 200 (format "org/%d/members" org-id) {:first_name user-to-create
                                                                          :last_name user-to-create
                                                                          :email (str user-to-create "@metabase.com")
                                                                          :admin false}))))

;; Check that we can add an Existing User to an Org (so we are NOT creating a new user account)
(let [test-org-name (random-name)]
  (expect-eval-actual-first
    (let [{my-org-id :id} (sel :one Org :name test-org-name)]
      (match-$ (sel :one OrgPerm :organization_id my-org-id :user_id [not= (user->id :crowberto)])
        {:id $
         :admin true
         :user_id $
         :organization_id my-org-id}))
    (let [{email :email} (create-user)
          {org-id :id} (create-org test-org-name)]
      (-> ((user->client :crowberto) :post 200 (format "org/%d/members" org-id) {:first_name "anything"
                                                                                 :last_name "anything"
                                                                                 :email email
                                                                                 :admin true})
        (select-keys [:id :admin :user_id :organization_id])))))

;; Test input validations on org member create
(expect "'first_name' is a required param."
  ((user->client :crowberto) :post 400 (format "org/%d/members" @org-id) {}))

(expect "'last_name' is a required param."
  ((user->client :crowberto) :post 400 (format "org/%d/members" @org-id) {:first_name "anything"}))

(expect "'email' is a required param."
  ((user->client :crowberto) :post 400 (format "org/%d/members" @org-id) {:first_name "anything"
                                                                          :last_name "anything"}))

;; this should fail due to invalid formatted email address
(expect "Invalid value 'anything' for 'email': Not a valid email address."
  ((user->client :crowberto) :post 400 (format "org/%d/members" @org-id) {:first_name "anything"
                                                                          :last_name "anything"
                                                                          :email "anything"}))

;; Check that users without any org perms cannot modify members
(expect "You don't have permissions to do that."
  (let [{:keys [id]} (create-org (random-name))]
    ((user->client :rasta) :post 403 (format "org/%d/members" id) {:first_name "anything"
                                                                   :last_name "anything"
                                                                   :email "anything@anything.com"})))

;; Check that users without WRITE org perms cannot modify members (test user with READ perms on org)
(expect "You don't have permissions to do that."
  (let [{user-id :id, email :email, password :first_name} (create-user)
        {org-id :id} (create-org (random-name))
        my-perm (create-org-perm org-id user-id :admin false)
        session-id (http/authenticate {:email email
                                       :password password})]
    (http/client session-id :post 403 (format "org/%d/members" org-id) {:first_name "anything"
                                                                        :last_name "anything"
                                                                        :email "anything@anything.com"})))

;; Test that invalid org id returns 404
(expect "Not found."
  ((user->client :rasta) :post 404 "org/1000/members" {:first_name "anything"
                                                       :last_name "anything"
                                                       :email "anything@anything.com"}))


;; ## GET /api/org/:id/members/:user-id
;; Check that we can get an OrgPerm between existing User + Org
(expect
  (match-$ (user->org-perm :lucky)
    {:id $
     :admin false
     :user_id (user->id :lucky)
     :organization_id @org-id
     :user (match-$ (fetch-user :lucky)
             {:common_name "Lucky Pigeon"
              :date_joined $
              :last_name "Pigeon"
              :id $
              :is_superuser false
              :last_login $
              :first_name "Lucky"
              :email "lucky@metabase.com"})
     :organization (match-$ (sel :one Org :id @org-id)
                     {:id $,
                      :slug "test",
                      :name "Test Organization",
                      :description nil,
                      :logo_url nil,
                      :inherits true})})
  ((user->client :crowberto) :get 200 (format "org/%d/members/%d" @org-id (user->id :lucky))))

;; Check that users without any org perms cannot get members
(expect "You don't have permissions to do that."
  (let [{:keys [id]} (create-org (random-name))]
    ((user->client :rasta) :get 403 (format "org/%d/members/1000" id) {})))

;; Test that invalid org id returns 404
(expect "Not found."
  ((user->client :rasta) :get 404 "org/1000/members/1000"))

;; Test that invalid user id returns 404
(expect "Not found."
  (let [{user-id :id, email :email, password :first_name} (create-user)
        {org-id :id} (create-org (random-name))
        my-perm (create-org-perm org-id user-id :admin true)
        session-id (http/authenticate {:email email
                                       :password password})]
    (http/client session-id :get 404 (format "org/%d/members/1000" org-id) {})))


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

;; Check that users without any org perms cannot modify members
(expect "You don't have permissions to do that."
  (let [{:keys [id]} (create-org (random-name))]
    ((user->client :rasta) :post 403 (format "org/%d/members/1000" id) {})))

;; Check that users without WRITE org perms cannot modify members (test user with READ perms on org)
(expect "You don't have permissions to do that."
  (let [{user-id :id, email :email, password :first_name} (create-user)
        {org-id :id} (create-org (random-name))
        my-perm (create-org-perm org-id user-id :admin false)
        session-id (http/authenticate {:email email
                                       :password password})]
    (http/client session-id :post 403 (format "org/%d/members/1000" org-id) {})))

;; Test that invalid org id returns 404
(expect "Not found."
  ((user->client :rasta) :post 404 "org/1000/members/1000"))

;; Test that invalid user id returns 404
(expect "Not found."
  (let [{user-id :id, email :email, password :first_name} (create-user)
        {org-id :id} (create-org (random-name))
        my-perm (create-org-perm org-id user-id :admin true)
        session-id (http/authenticate {:email email
                                       :password password})]
    (http/client session-id :post 404 (format "org/%d/members/1000" org-id) {})))


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

;; Check that users without any org perms cannot modify members
(expect "You don't have permissions to do that."
  (let [{:keys [id]} (create-org (random-name))]
    ((user->client :rasta) :delete 403 (format "org/%d/members/1000" id) {})))

;; Check that users without WRITE org perms cannot modify members (test user with READ perms on org)
(expect "You don't have permissions to do that."
  (let [{user-id :id, email :email, password :first_name} (create-user)
        {org-id :id} (create-org (random-name))
        my-perm (create-org-perm org-id user-id :admin false)
        session-id (http/authenticate {:email email
                                       :password password})]
    (http/client session-id :delete 403 (format "org/%d/members/1000" org-id) {})))

;; Test that invalid org id returns 404
(expect "Not found."
  ((user->client :rasta) :delete 404 "org/1000/members/1000"))

;; Test that invalid user id returns 404
(expect "Not found."
  (let [{user-id :id, email :email, password :first_name} (create-user)
        {org-id :id} (create-org (random-name))
        my-perm (create-org-perm org-id user-id :admin true)
        session-id (http/authenticate {:email email
                                       :password password})]
    (http/client session-id :delete 404 (format "org/%d/members/1000" org-id) {})))


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

;; Check that users without any org perms cannot modify members
(expect "You don't have permissions to do that."
  (let [{:keys [id]} (create-org (random-name))]
    ((user->client :rasta) :put 403 (format "org/%d/members/1000" id) {})))

;; Check that users without WRITE org perms cannot modify members (test user with READ perms on org)
(expect "You don't have permissions to do that."
  (let [{user-id :id, email :email, password :first_name} (create-user)
        {org-id :id} (create-org (random-name))
        my-perm (create-org-perm org-id user-id :admin false)
        session-id (http/authenticate {:email email
                                       :password password})]
    (http/client session-id :put 403 (format "org/%d/members/1000" org-id) {})))

;; Test that invalid org id returns 404
(expect "Not found."
  ((user->client :rasta) :put 404 "org/1000/members/1000"))

;; Test that invalid user id returns 404
(expect "Not found."
  (let [{user-id :id, email :email, password :first_name} (create-user)
        {org-id :id} (create-org (random-name))
        my-perm (create-org-perm org-id user-id :admin true)
        session-id (http/authenticate {:email email
                                       :password password})]
    (http/client session-id :put 404 (format "org/%d/members/1000" org-id) {})))

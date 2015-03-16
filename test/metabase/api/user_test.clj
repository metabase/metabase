(ns metabase.api.user-test
  "Tests for /api/user endpoints."
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.http-client :as http]
            [metabase.middleware.auth :as auth]
            (metabase.models [org-perm :refer [OrgPerm]]
                             [session :refer [Session]]
                             [user :refer [User]])
            [metabase.test.util :refer [match-$ random-name expect-eval-actual-first]]
            [metabase.test-data :refer :all]
            [metabase.test-data.create :refer [create-user]]))

(def rasta-org-perm-id (delay (sel :one :id OrgPerm :organization_id @org-id :user_id (user->id :rasta))))

;; ## /api/user/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get auth/response-unauthentic :body) (http/client :get 401 "user"))
(expect (get auth/response-unauthentic :body) (http/client :get 401 "user/current"))


;; ## GET /api/user
;; Check that superusers can get a list of all Users
(expect
    #{(match-$ (fetch-user :crowberto)
        {:common_name "Crowberto Corv"
         :date_joined $
         :last_name "Corv"
         :id $
         :is_superuser true
         :last_login $
         :first_name "Crowberto"
         :email "crowberto@metabase.com"})
      (match-$ (fetch-user :trashbird)
        {:common_name "Trash Bird"
         :date_joined $
         :last_name "Bird"
         :id $
         :is_superuser false
         :last_login $
         :first_name "Trash"
         :email "trashbird@metabase.com"})
      (match-$ (fetch-user :lucky)
        {:common_name "Lucky Pigeon"
         :date_joined $
         :last_name "Pigeon"
         :id $
         :is_superuser false
         :last_login $
         :first_name "Lucky"
         :email "lucky@metabase.com"})
      (match-$ (fetch-user :rasta)
        {:common_name "Rasta Toucan"
         :date_joined $
         :last_name "Toucan"
         :id $
         :is_superuser false
         :last_login $
         :first_name "Rasta"
         :email "rasta@metabase.com"})}
  (do
    ;; Delete all the other random Users we've created so far
    (let [user-ids (set (map user->id [:crowberto :rasta :lucky :trashbird]))]
      (cascade-delete User :id [not-in user-ids]))
    ;; Now do the request
    (set ((user->client :crowberto) :get 200 "user")))) ; as a set since we don't know what order the results will come back in

;; Check that non-superusers are denied access
(expect "You don't have permissions to do that."
  ((user->client :rasta) :get 403 "user"))

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
  ((user->client :rasta) :get 200 "user/current"))


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
  ((user->client :rasta) :get 200 (str "user/" (user->id :rasta))))

;; Check that a non-superuser CANNOT fetch someone else's user details
(expect "You don't have permissions to do that."
  ((user->client :rasta) :get 403 (str "user/" (user->id :trashbird))))

;; A superuser should be allowed to fetch another users data
(expect (match-$ (fetch-user :rasta)
          {:email "rasta@metabase.com"
           :first_name "Rasta"
           :last_login $
           :is_superuser false
           :id $
           :last_name "Toucan"
           :date_joined $
           :common_name "Rasta Toucan"})
  ((user->client :crowberto) :get 200 (str "user/" (user->id :rasta))))


;; ## PUT /api/user/:id
;; Test that we can edit a User
(expect-let [{old-first :first_name, last-name :last_name, old-email :email, id :id, :as user} (create-user)
             new-first (random-name)
             new-email (.toLowerCase ^String (str new-first "@metabase.com"))
             fetch-user (fn [] (sel :one :fields [User :first_name :last_name :is_superuser :email] :id id))]
  [{:email old-email
    :is_superuser false
    :last_name last-name
    :first_name old-first}
   {:email new-email
    :is_superuser false
    :last_name last-name
    :first_name new-first}]
  [(fetch-user)
   (do ((user->client :crowberto) :put 200 (format "user/%d" id) {:first_name new-first
                                                                  :email new-email})
       (fetch-user))])

;; Check that a non-superuser CANNOT update someone else's user details
(expect "You don't have permissions to do that."
  ((user->client :rasta) :put 403 (str "user/" (user->id :trashbird))))


;; ## PUT /api/user/:id/password
;; Test that a User can change their password
(let [user-last-name (random-name)]
  (expect-eval-actual-first
      (let [{user-id :id} (sel :one User :last_name user-last-name)]
        (sel :one :fields [Session :id] :user_id user-id (order :created_at :desc))) ; get the latest Session for this User
    (let [password {:old "password"
                    :new "whateverUP12!!"}
          {:keys [email id] :as user} (create-user :password (:old password) :last_name user-last-name)
          creds {:old {:password (:old password)
                       :email email}
                 :new {:password (:new password)
                       :email email}}]
      ;; Check that creds work
      (metabase.http-client/client :post 200 "session" (:old creds))
      ;; Change the PW
      (metabase.http-client/client (:old creds) :put 200 (format "user/%d/password" id) {:password (:new password)
                                                                                         :old_password (:old password)})
      ;; Old creds should no longer work
      (assert (= (metabase.http-client/client :post 400 "session" (:old creds))
                 "password mismatch"))
      ;; New creds *should* work
      (metabase.http-client/client :post 200 "session" (:new creds)))))

;; Check that a non-superuser CANNOT update someone else's password
(expect "You don't have permissions to do that."
  ((user->client :rasta) :put 403 (format "user/%d/password" (user->id :trashbird)) {:password "whateverUP12!!"
                                                                                     :old_password "whatever"}))

;; Test input validations on password change
(expect "'password' is a required param."
  ((user->client :rasta) :put 400 (format "user/%d/password" (user->id :rasta)) {}))

;; Make sure that if current password doesn't match we get a 400
(expect "password mismatch"
  ((user->client :rasta) :put 400 (format "user/%d/password" (user->id :rasta)) {:password "whateverUP12!!"
                                                                                 :old_password "mismatched"}))

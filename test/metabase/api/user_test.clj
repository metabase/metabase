(ns metabase.api.user-test
  "Tests for /api/user endpoints."
  (:require [expectations :refer :all]
            [korma.core :as k]
            [metabase.db :refer :all]
            (metabase [http-client :as http]
                      [middleware :as middleware])
            (metabase.models [session :refer [Session]]
                             [user :refer [User]])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :refer [match-$ random-name expect-eval-actual-first]]))

;; ## /api/user/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get middleware/response-unauthentic :body) (http/client :get 401 "user"))
(expect (get middleware/response-unauthentic :body) (http/client :get 401 "user/current"))


;; ## Helper Fns
(defn create-user-api [user-name]
  ((user->client :crowberto) :post 200 "user" {:first_name user-name
                                               :last_name  user-name
                                               :email      (str user-name "@metabase.com")}))

;; ## GET /api/user
;; Check that anyone can get a list of all active Users
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
    (set ((user->client :rasta) :get 200 "user")))) ; as a set since we don't know what order the results will come back in


;; ## POST /api/user
;; Test that we can create a new User
(let [rand-name (random-name)]
  (expect-eval-actual-first
    (match-$ (sel :one User :first_name rand-name)
      {:id $
       :email $
       :first_name rand-name
       :last_name rand-name
       :date_joined $
       :last_login $
       :common_name $
       :is_superuser false})
    (create-user-api rand-name)))

;; Test that reactivating a disabled account works
(let [rand-name (random-name)]
  (expect-eval-actual-first
    (match-$ (sel :one User :first_name rand-name :is_active true)
      {:id $
       :email $
       :first_name rand-name
       :last_name "whatever"
       :date_joined $
       :last_login $
       :common_name $
       :is_superuser false})
    (when-let [user (create-user-api rand-name)]
      ;; create a random user then set them to :inactive
      (upd User (:id user)
        :is_active false
        :is_superuser true)
      ;; then try creating the same user again
      ((user->client :crowberto) :post 200 "user" {:first_name (:first_name user)
                                                   :last_name "whatever"
                                                   :email (:email user)}))))

;; Check that non-superusers are denied access
(expect "You don't have permissions to do that."
  ((user->client :rasta) :post 403 "user" {:first_name "whatever"
                                           :last_name "whatever"
                                           :email "whatever@whatever.com"}))

;; Test input validations
(expect {:errors {:first_name "field is a required param."}}
  ((user->client :crowberto) :post 400 "user" {}))

(expect {:errors {:last_name "field is a required param."}}
  ((user->client :crowberto) :post 400 "user" {:first_name "whatever"}))

(expect {:errors {:email "field is a required param."}}
  ((user->client :crowberto) :post 400 "user" {:first_name "whatever"
                                               :last_name "whatever"}))

(expect {:errors {:email "Invalid value 'whatever' for 'email': Not a valid email address."}}
  ((user->client :crowberto) :post 400 "user" {:first_name "whatever"
                                               :last_name "whatever"
                                               :email "whatever"}))


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
           :id $})
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

;; We should get a 404 when trying to access a disabled account
(expect "Not found."
  ((user->client :crowberto) :get 404 (str "user/" (user->id :trashbird))))


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

;; Test that a normal user cannot change the :is_superuser flag for themselves
(expect-let [fetch-user (fn [] (sel :one :fields [User :first_name :last_name :is_superuser :email] :id (user->id :rasta)))]
  [(fetch-user)]
  [(do ((user->client :rasta) :put 200 (str "user/" (user->id :rasta)) (-> (fetch-user)
                                                                           (assoc :is_superuser true)))
       (fetch-user))])

;; Check that a non-superuser CANNOT update someone else's user details
(expect "You don't have permissions to do that."
  ((user->client :rasta) :put 403 (str "user/" (user->id :trashbird)) {:email "toucan@metabase.com"}))

;; We should get a 404 when trying to access a disabled account
(expect "Not found."
  ((user->client :crowberto) :put 404 (str "user/" (user->id :trashbird)) {:email "toucan@metabase.com"}))


;; ## PUT /api/user/:id/password
;; Test that a User can change their password
(expect-let [creds                 {:email    "abc@metabase.com"
                                    :password "def"}
             {:keys [id password]} (ins User
                                     :first_name "test"
                                     :last_name  "user"
                                     :email      "abc@metabase.com"
                                     :password   "def")]
  true
  (do
    ;; use API to reset the users password
    (metabase.http-client/client creds :put 200 (format "user/%d/password" id) {:password     "abc123!!DEF"
                                                                                :old_password (:password creds)})
    ;; now simply grab the lastest pass from the db and compare to the one we have from before reset
    (not= password (sel :one :field [User :password] :email (:email creds)))))

;; Check that a non-superuser CANNOT update someone else's password
(expect "You don't have permissions to do that."
  ((user->client :rasta) :put 403 (format "user/%d/password" (user->id :trashbird)) {:password "whateverUP12!!"
                                                                                     :old_password "whatever"}))

;; Test input validations on password change
(expect {:errors {:password "field is a required param."}}
  ((user->client :rasta) :put 400 (format "user/%d/password" (user->id :rasta)) {}))

;; Make sure that if current password doesn't match we get a 400
(expect {:errors {:old_password "Invalid password"}}
  ((user->client :rasta) :put 400 (format "user/%d/password" (user->id :rasta)) {:password "whateverUP12!!"
                                                                                 :old_password "mismatched"}))


;; ## DELETE /api/user/:id
;; Disable a user account
(let [rand-name (random-name)]
  (expect-eval-actual-first
    {:success true}
    (let [user (create-user-api rand-name)]
      ((user->client :crowberto) :delete 200 (format "user/%d" (:id user)) {}))))

;; Check that a non-superuser CANNOT update someone else's password
(expect "You don't have permissions to do that."
  ((user->client :rasta) :delete 403 (format "user/%d" (user->id :rasta)) {}))


;; ## POST /api/user/:id/send_invite
;; Check that non-superusers are denied access to resending invites
(expect "You don't have permissions to do that."
  ((user->client :rasta) :post 403 (format "user/%d/send_invite" (user->id :crowberto))))

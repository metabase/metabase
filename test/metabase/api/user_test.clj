(ns metabase.api.user-test
  "Tests for /api/user endpoints."
  (:require [expectations :refer :all]
            [metabase
             [http-client :as http]
             [middleware :as middleware]
             [util :as u]]
            [metabase.models.user :refer [User]]
            [metabase.test
             [data :refer :all]
             [util :as tu :refer [match-$ random-name]]]
            [metabase.test.data.users :refer :all]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; ## /api/user/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get middleware/response-unauthentic :body) (http/client :get 401 "user"))
(expect (get middleware/response-unauthentic :body) (http/client :get 401 "user/current"))


;; ## GET /api/user
;; Check that anyone can get a list of all active Users
(expect
  #{(match-$ (fetch-user :crowberto)
      {:common_name  "Crowberto Corv"
       :last_name    "Corv"
       :id           $
       :is_superuser true
       :last_login   $
       :first_name   "Crowberto"
       :email        "crowberto@metabase.com"
       :google_auth  false})
    (match-$ (fetch-user :lucky)
      {:common_name  "Lucky Pigeon"
       :last_name    "Pigeon"
       :id           $
       :is_superuser false
       :last_login   $
       :first_name   "Lucky"
       :email        "lucky@metabase.com"
       :google_auth  false})
    (match-$ (fetch-user :rasta)
      {:common_name  "Rasta Toucan"
       :last_name    "Toucan"
       :id           $
       :is_superuser false
       :last_login   $
       :first_name   "Rasta"
       :email        "rasta@metabase.com"
       :google_auth  false})}
  (do
    ;; Delete all the other random Users we've created so far
    (let [user-ids (set (map user->id [:crowberto :rasta :lucky :trashbird]))]
      (db/delete! User :id [:not-in user-ids]))
    ;; Now do the request
    (set ((user->client :rasta) :get 200 "user")))) ; as a set since we don't know what order the results will come back in


;; ## POST /api/user
;; Test that we can create a new User
(let [user-name (random-name)
      email     (str user-name "@metabase.com")]
  (expect
    {:email        email
     :first_name   user-name
     :last_name    user-name
     :common_name  (str user-name " " user-name)
     :is_superuser false
     :is_qbnewb    true}
    (do ((user->client :crowberto) :post 200 "user" {:first_name user-name
                                                     :last_name  user-name
                                                     :email      email})
        (u/prog1 (db/select-one [User :email :first_name :last_name :is_superuser :is_qbnewb]
                   :email email)
          ;; clean up after ourselves
          (db/delete! User :email email)))))


;; Test that reactivating a disabled account works
(expect
  ;; create a random inactive user
  (tt/with-temp User [user {:is_active false}]
    ;; now try creating the same user again, should re-activiate the original
    ((user->client :crowberto) :post 200 "user" {:first_name (:first_name user)
                                                 :last_name  "whatever"
                                                 :email      (:email user)})
    ;; the user should now be active
    (db/select-one-field :is_active User :id (:id user))))

;; Check that non-superusers are denied access
(expect
  "You don't have permissions to do that."
  ((user->client :rasta) :post 403 "user" {:first_name "whatever"
                                           :last_name  "whatever"
                                           :email      "whatever@whatever.com"}))

;; Test input validations
(expect
  {:errors {:first_name "value must be a non-blank string."}}
  ((user->client :crowberto) :post 400 "user" {}))

(expect
  {:errors {:last_name "value must be a non-blank string."}}
  ((user->client :crowberto) :post 400 "user" {:first_name "whatever"}))

(expect
  {:errors {:email "value must be a valid email address."}}
  ((user->client :crowberto) :post 400 "user" {:first_name "whatever"
                                               :last_name  "whatever"}))

(expect
  {:errors {:email "value must be a valid email address."}}
  ((user->client :crowberto) :post 400 "user" {:first_name "whatever"
                                               :last_name  "whatever"
                                               :email      "whatever"}))


;; ## GET /api/user/current
;; Check that fetching current user will return extra fields like `is_active` and will return OrgPerms
(expect
  (match-$ (fetch-user :rasta)
    {:email        "rasta@metabase.com"
     :first_name   "Rasta"
     :last_name    "Toucan"
     :common_name  "Rasta Toucan"
     :date_joined  $
     :last_login   $
     :is_active    true
     :is_superuser false
     :is_qbnewb    true
     :google_auth  false
     :id           $})
  ((user->client :rasta) :get 200 "user/current"))


;; ## GET /api/user/:id
;; Should return a smaller set of fields, and should *not* return OrgPerms
(expect
  (match-$ (fetch-user :rasta)
    {:email        "rasta@metabase.com"
     :first_name   "Rasta"
     :last_login   $
     :is_superuser false
     :is_qbnewb    true
     :id           $
     :last_name    "Toucan"
     :date_joined  $
     :common_name  "Rasta Toucan"})
  ((user->client :rasta) :get 200 (str "user/" (user->id :rasta))))

;; Check that a non-superuser CANNOT fetch someone else's user details
(expect "You don't have permissions to do that."
  ((user->client :rasta) :get 403 (str "user/" (user->id :trashbird))))

;; A superuser should be allowed to fetch another users data
(expect (match-$ (fetch-user :rasta)
          {:email        "rasta@metabase.com"
           :first_name   "Rasta"
           :last_login   $
           :is_superuser false
           :is_qbnewb    true
           :id           $
           :last_name    "Toucan"
           :date_joined  $
           :common_name  "Rasta Toucan"})
  ((user->client :crowberto) :get 200 (str "user/" (user->id :rasta))))

;; We should get a 404 when trying to access a disabled account
(expect "Not found."
  ((user->client :crowberto) :get 404 (str "user/" (user->id :trashbird))))


;; ## PUT /api/user/:id
;; Test that we can edit a User
(expect
  [{:first_name "Cam", :last_name "Era",  :is_superuser true, :email "cam.era@metabase.com"}
   {:first_name "Cam", :last_name "Eron", :is_superuser true, :email "cam.eron@metabase.com"}]
  (tt/with-temp User [{user-id :id} {:first_name "Cam", :last_name "Era", :email "cam.era@metabase.com", :is_superuser true}]
    (let [user (fn [] (into {} (dissoc (db/select-one [User :first_name :last_name :is_superuser :email], :id user-id)
                                       :common_name)))]
      [(user)
       (do ((user->client :crowberto) :put 200 (str "user/" user-id) {:last_name "Eron"
                                                                      :email     "cam.eron@metabase.com"})
           (user))])))

;; Test that a normal user cannot change the :is_superuser flag for themselves
(defn- fetch-rasta []
  (db/select-one [User :first_name :last_name :is_superuser :email], :id (user->id :rasta)))

(expect
  (fetch-rasta)
  (do ((user->client :rasta) :put 200 (str "user/" (user->id :rasta)) (assoc (fetch-rasta)
                                                                        :is_superuser true))
      (fetch-rasta)))

;; Check that a non-superuser CANNOT update someone else's user details
(expect "You don't have permissions to do that."
  ((user->client :rasta) :put 403 (str "user/" (user->id :trashbird)) {:email "toucan@metabase.com"}))

;; We should get a 404 when trying to access a disabled account
(expect "Not found."
  ((user->client :crowberto) :put 404 (str "user/" (user->id :trashbird)) {:email "toucan@metabase.com"}))


;; ## PUT /api/user/:id/password
;; Test that a User can change their password (superuser and non-superuser)
(defn- user-can-reset-password? [superuser?]
  (tt/with-temp User [user {:password "def", :is_superuser (boolean superuser?)}]
    (let [creds           {:email (:email user), :password "def"}
          hashed-password (db/select-one-field :password User, :email (:email user))]
      ;; use API to reset the users password
      (http/client creds :put 200 (format "user/%d/password" (:id user)) {:password     "abc123!!DEF"
                                                                          :old_password "def"})
      ;; now simply grab the lastest pass from the db and compare to the one we have from before reset
      (not= hashed-password (db/select-one-field :password User, :email (:email user))))))

(expect (user-can-reset-password? :superuser))
(expect (user-can-reset-password? (not :superuser)))


;; Check that a non-superuser CANNOT update someone else's password
(expect
  "You don't have permissions to do that."
  ((user->client :rasta) :put 403 (format "user/%d/password" (user->id :trashbird)) {:password     "whateverUP12!!"
                                                                                     :old_password "whatever"}))

;; Test input validations on password change
(expect
  {:errors {:password "Insufficient password strength"}}
  ((user->client :rasta) :put 400 (format "user/%d/password" (user->id :rasta)) {}))

;; Make sure that if current password doesn't match we get a 400
(expect {:errors {:old_password "Invalid password"}}
  ((user->client :rasta) :put 400 (format "user/%d/password" (user->id :rasta)) {:password "whateverUP12!!"
                                                                                 :old_password "mismatched"}))


;; ## PUT /api/user/:id/qbnewb
;; Test that we can set the qbnewb status on a user
(expect
  [{:success true}
   false]
  (tt/with-temp User [{:keys [id]} {:first_name (random-name)
                                 :last_name  (random-name)
                                 :email      "def@metabase.com"
                                 :password   "def123"}]
    (let [creds {:email    "def@metabase.com"
                 :password "def123"}]
      [(metabase.http-client/client creds :put 200 (format "user/%d/qbnewb" id))
       (db/select-one-field :is_qbnewb User, :id id)])))


;; Check that a non-superuser CANNOT update someone else's password
(expect "You don't have permissions to do that."
  ((user->client :rasta) :put 403 (format "user/%d/qbnewb" (user->id :trashbird))))


;; ## DELETE /api/user/:id
;; Disable a user account
(expect
  {:success true}
  (tt/with-temp User [user]
    ((user->client :crowberto) :delete 200 (format "user/%d" (:id user)) {})))

;; Check that a non-superuser CANNOT update someone else's password
(expect "You don't have permissions to do that."
  ((user->client :rasta) :delete 403 (format "user/%d" (user->id :rasta)) {}))


;; ## POST /api/user/:id/send_invite
;; Check that non-superusers are denied access to resending invites
(expect "You don't have permissions to do that."
  ((user->client :rasta) :post 403 (format "user/%d/send_invite" (user->id :crowberto))))


;; test that when disabling Google auth if a user gets disabled and reënabled they are no longer Google Auth (Bug #3323)
(expect
  {:is_active true, :google_auth false}
  (tu/with-temporary-setting-values [google-auth-client-id "ABCDEFG"]
    (tt/with-temp User [user {:google_auth true}]
      (db/update! User (u/get-id user)
        :is_active false)
      (tu/with-temporary-setting-values [google-auth-client-id nil]
        ((user->client :crowberto) :post 200 "user"
         {:first_name "Cam"
          :last_name  "Era"
          :email      (:email user)})
        (db/select-one [User :is_active :google_auth] :id (u/get-id user))))))

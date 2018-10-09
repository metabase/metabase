(ns metabase.api.user-test
  "Tests for /api/user endpoints."
  (:require [expectations :refer :all]
            [metabase
             [email-test :as et]
             [http-client :as http]
             [middleware :as middleware]
             [util :as u]]
            [metabase.models.user :refer [User]]
            [metabase.test
             [data :refer :all]
             [util :as tu :refer [random-name]]]
            [metabase.test.data.users :as test-users]
            [metabase.models.collection-test :as collection-test]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; ## /api/user/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get middleware/response-unauthentic :body) (http/client :get 401 "user"))
(expect (get middleware/response-unauthentic :body) (http/client :get 401 "user/current"))

(def ^:private user-defaults
  {:date_joined      true
   :google_auth      false
   :id               true
   :is_active        true
   :is_qbnewb        true
   :is_superuser     false
   :last_login       false
   :ldap_auth        false
   :login_attributes nil
   :updated_at       true})

;; ## GET /api/user
;; Check that anyone can get a list of all active Users
(expect
  [{:id (test-users/user->id :crowberto), :email "crowberto@metabase.com", :first_name "Crowberto", :last_name "Corv",   :common_name "Crowberto Corv"}
   {:id (test-users/user->id :lucky),     :email "lucky@metabase.com",     :first_name "Lucky",     :last_name "Pigeon", :common_name "Lucky Pigeon"}
   {:id (test-users/user->id :rasta),     :email "rasta@metabase.com",     :first_name "Rasta",     :last_name "Toucan", :common_name "Rasta Toucan"}]
  (tu/with-non-admin-groups-no-root-collection-perms
    ;; Delete all the other random Users we've created so far
    (test-users/delete-temp-users!)
    ;; Make sure personal Collections have been created
    (collection-test/force-create-personal-collections!)
    ;; Now do the request
    ((test-users/user->client :rasta) :get 200 "user")))

;; Check that admins can get a list of active Users. Should include additional admin Fields
(expect
  [(merge
    user-defaults
    {:email                  "crowberto@metabase.com"
     :first_name             "Crowberto"
     :is_superuser           true
     :last_name              "Corv"
     :personal_collection_id true
     :common_name            "Crowberto Corv"})
   (merge
    user-defaults
    {:email                  "lucky@metabase.com"
     :first_name             "Lucky"
     :last_name              "Pigeon"
     :personal_collection_id true
     :common_name            "Lucky Pigeon"})
   (merge
    user-defaults
    {:email                  "rasta@metabase.com"
     :first_name             "Rasta"
     :last_name              "Toucan"
     :personal_collection_id true
     :common_name            "Rasta Toucan"})]
  (do
    (test-users/delete-temp-users!)
    (collection-test/force-create-personal-collections!)
    (-> ((test-users/user->client :crowberto) :get 200 "user")
        tu/boolean-ids-and-timestamps)))

;; Non-admins should *not* be allowed to pass in include_deactivated
(expect
  "You don't have permissions to do that."
  ((test-users/user->client :rasta) :get 403 "user", :include_deactivated true))

;; ...but for admins, it should include those inactive users as we'd expect
(expect
  [(merge
    user-defaults
    {:email                  "trashbird@metabase.com"
     :first_name             "Trash"
     :is_active              false
     :last_name              "Bird"
     :personal_collection_id true
     :common_name            "Trash Bird"})
   (merge
    user-defaults
    {:email                  "crowberto@metabase.com"
     :first_name             "Crowberto"
     :is_superuser           true
     :last_name              "Corv"
     :personal_collection_id true
     :common_name            "Crowberto Corv"})
   (merge
    user-defaults
    {:email                  "lucky@metabase.com"
     :first_name             "Lucky"
     :last_name              "Pigeon"
     :personal_collection_id true
     :common_name            "Lucky Pigeon"})
   (merge
    user-defaults
    {:email                  "rasta@metabase.com"
     :first_name             "Rasta"
     :last_name              "Toucan"
     :personal_collection_id true
     :common_name            "Rasta Toucan"})]
  (do
    (test-users/delete-temp-users!)
    (collection-test/force-create-personal-collections!)
    (-> ((test-users/user->client :crowberto) :get 200 "user", :include_deactivated true)
        tu/boolean-ids-and-timestamps)))


;; ## POST /api/user
;; Test that we can create a new User
(let [user-name (random-name)
      email     (str user-name "@metabase.com")]
  (expect
    (merge user-defaults
           (merge
            user-defaults
            {:email            email
             :first_name       user-name
             :last_name        user-name
             :common_name      (str user-name " " user-name)
             :login_attributes {:test "value"}}))
    (et/with-fake-inbox
      (try
        (tu/boolean-ids-and-timestamps
         ((test-users/user->client :crowberto) :post 200 "user" {:first_name       user-name
                                                                 :last_name        user-name
                                                                 :email            email
                                                                 :login_attributes {:test "value"}}))
        (finally
          ;; clean up after ourselves
          (db/delete! User :email email))))))

;; Test that reactivating a disabled account works
(expect
  ;; create a random inactive user
  (tt/with-temp User [user {:is_active false}]
    ;; now try creating the same user again, should re-activiate the original
    ((test-users/user->client :crowberto) :put 200 (format "user/%s/reactivate" (u/get-id user))
     {:first_name (:first_name user)
      :last_name  "whatever"
      :email      (:email user)})
    ;; the user should now be active
    (db/select-one-field :is_active User :id (:id user))))

;; Check that non-superusers are denied access
(expect
  "You don't have permissions to do that."
  ((test-users/user->client :rasta) :post 403 "user" {:first_name "whatever"
                                                      :last_name  "whatever"
                                                      :email      "whatever@whatever.com"}))

;; Attempting to reactivate a non-existant user should return a 404
(expect
  "Not found."
  ((test-users/user->client :crowberto) :put 404 (format "user/%s/reactivate" Integer/MAX_VALUE)))

;; Attempting to reactivate an already active user should fail
(expect
  {:message "Not able to reactivate an active user"}
  ((test-users/user->client :crowberto) :put 400 (format "user/%s/reactivate" (test-users/user->id :rasta))))

;; Attempting to create a new user with the same email as an existing user should fail
(expect
  {:errors {:email "Email address already in use."}}
  ((test-users/user->client :crowberto) :post 400 "user" {:first_name "Something"
                                                          :last_name  "Random"
                                                          :email      (:email (test-users/fetch-user :rasta))}))

;; Test input validations
(expect
  {:errors {:first_name "value must be a non-blank string."}}
  ((test-users/user->client :crowberto) :post 400 "user" {}))

(expect
  {:errors {:last_name "value must be a non-blank string."}}
  ((test-users/user->client :crowberto) :post 400 "user" {:first_name "whatever"}))

(expect
  {:errors {:email "value must be a valid email address."}}
  ((test-users/user->client :crowberto) :post 400 "user" {:first_name "whatever"
                                                          :last_name  "whatever"}))

(expect
  {:errors {:email "value must be a valid email address."}}
  ((test-users/user->client :crowberto) :post 400 "user" {:first_name "whatever"
                                                          :last_name  "whatever"
                                                          :email      "whatever"}))


;; ## GET /api/user/current
;; Check that fetching current user will return extra fields like `is_active` and will return OrgPerms
(expect
  (merge user-defaults
         {:email                  "rasta@metabase.com"
          :first_name             "Rasta"
          :last_name              "Toucan"
          :common_name            "Rasta Toucan"
          :personal_collection_id true})
  (do
    ;; Make sure personal Collections have been created so this endpoint won't randomly return `false` for
    ;; personal_collection_id
    (collection-test/force-create-personal-collections!)
    ;; now FETCH
    (tu/boolean-ids-and-timestamps ((test-users/user->client :rasta) :get 200 "user/current"))))


;; ## GET /api/user/:id
;; Should return a smaller set of fields, and should *not* return OrgPerms
(expect
  (merge user-defaults
         {:email       "rasta@metabase.com"
          :first_name  "Rasta"
          :last_name   "Toucan"
          :common_name "Rasta Toucan"})
  (tu/boolean-ids-and-timestamps ((test-users/user->client :rasta) :get 200 (str "user/" (test-users/user->id :rasta)))))

;; Check that a non-superuser CANNOT fetch someone else's user details
(expect "You don't have permissions to do that."
        ((test-users/user->client :rasta) :get 403 (str "user/" (test-users/user->id :trashbird))))

;; A superuser should be allowed to fetch another users data
(expect
  (merge user-defaults
         {:email       "rasta@metabase.com"
          :first_name  "Rasta"
          :last_name   "Toucan"
          :common_name "Rasta Toucan"})
  (tu/boolean-ids-and-timestamps ((test-users/user->client :crowberto) :get 200 (str "user/" (test-users/user->id :rasta)))))

;; We should get a 404 when trying to access a disabled account
(expect "Not found."
        ((test-users/user->client :crowberto) :get 404 (str "user/" (test-users/user->id :trashbird))))


;; ## PUT /api/user/:id
;; Test that we can edit a User
(expect
  {:before   {:first_name "Cam", :last_name "Era", :is_superuser true, :email "cam.era@metabase.com"}
   :response (merge
              user-defaults
              {:common_name  "Cam Eron"
               :email        "cam.eron@metabase.com"
               :first_name   "Cam"
               :is_superuser true
               :last_name    "Eron"})
   :after    {:first_name "Cam", :last_name "Eron", :is_superuser true, :email "cam.eron@metabase.com"}}
  (tt/with-temp User [{user-id :id} {:first_name   "Cam"
                                     :last_name    "Era"
                                     :email        "cam.era@metabase.com"
                                     :is_superuser true}]
    (let [user (fn [] (into {} (dissoc (db/select-one [User :first_name :last_name :is_superuser :email], :id user-id)
                                       :common_name)))]
      (array-map
       :before   (user)
       :response (tu/boolean-ids-and-timestamps
                  ((test-users/user->client :crowberto) :put 200 (str "user/" user-id)
                   {:last_name "Eron"
                    :email     "cam.eron@metabase.com"}))
       :after    (user)))))

;; Test that we can update login attributes after a user has been created
(expect
  (merge
   user-defaults
   {:is_superuser     true
    :email            "testuser@metabase.com"
    :first_name       "Test"
    :login_attributes {:test "value"}
    :common_name      "Test User"
    :last_name        "User"})
  (tt/with-temp User [{user-id :id} {:first_name   "Test"
                                     :last_name    "User"
                                     :email        "testuser@metabase.com"
                                     :is_superuser true}]
    (tu/boolean-ids-and-timestamps
     ((test-users/user->client :crowberto) :put 200 (str "user/" user-id) {:email            "testuser@metabase.com"
                                                                           :login_attributes {:test "value"}}))))

;; ## PUT /api/user/:id
;; Test that updating a user's email to an existing inactive user's email fails
(expect
  {:errors {:email "Email address already associated to another user."}}
  (let [trashbird (test-users/fetch-user :trashbird)
        rasta     (test-users/fetch-user :rasta)]
    ((test-users/user->client :crowberto) :put 400 (str "user/" (u/get-id rasta)) (select-keys trashbird [:email]))))

;; Test that a normal user cannot change the :is_superuser flag for themselves
(defn- fetch-rasta []
  (db/select-one [User :first_name :last_name :is_superuser :email], :id (test-users/user->id :rasta)))

(expect
  (fetch-rasta)
  (do ((test-users/user->client :rasta) :put 200 (str "user/" (test-users/user->id :rasta)) (assoc (fetch-rasta)
                                                                                              :is_superuser true))
      (fetch-rasta)))

;; Check that a non-superuser CANNOT update someone else's user details
(expect
  "You don't have permissions to do that."
  ((test-users/user->client :rasta) :put 403 (str "user/" (test-users/user->id :trashbird))
   {:email "toucan@metabase.com"}))

;; We should get a 404 when trying to access a disabled account
(expect
  "Not found."
  ((test-users/user->client :crowberto) :put 404 (str "user/" (test-users/user->id :trashbird))
   {:email "toucan@metabase.com"}))

;; Google auth users shouldn't be able to change their own password as we get that from Google
(expect
  "You don't have permissions to do that."
  (tt/with-temp User [user {:email       "anemail@metabase.com"
                            :password    "def123"
                            :google_auth true}]
    (let [creds {:username "anemail@metabase.com"
                 :password "def123"}]
      (http/client creds :put 403 (format "user/%d" (u/get-id user))
                   {:email "adifferentemail@metabase.com"}))))

;; Similar to Google auth accounts, we should not allow LDAP users to change their own email address as we get that
;; from the LDAP server
(expect
  "You don't have permissions to do that."
  (tt/with-temp User [user {:email       "anemail@metabase.com"
                            :password    "def123"
                            :ldap_auth true}]
    (let [creds {:username "anemail@metabase.com"
                 :password "def123"}]
      (http/client creds :put 403 (format "user/%d" (u/get-id user))
                   {:email "adifferentemail@metabase.com"}))))

;; ## PUT /api/user/:id/password
;; Test that a User can change their password (superuser and non-superuser)
(defn- user-can-reset-password? [superuser?]
  (tt/with-temp User [user {:password "def", :is_superuser (boolean superuser?)}]
    (let [creds           {:username (:email user), :password "def"}
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
  ((test-users/user->client :rasta) :put 403 (format "user/%d/password" (test-users/user->id :trashbird))
   {:password     "whateverUP12!!"
    :old_password "whatever"}))

;; Test input validations on password change
(expect
  {:errors {:password "Insufficient password strength"}}
  ((test-users/user->client :rasta) :put 400 (format "user/%d/password" (test-users/user->id :rasta)) {}))

;; Make sure that if current password doesn't match we get a 400
(expect
  {:errors {:old_password "Invalid password"}}
  ((test-users/user->client :rasta) :put 400 (format "user/%d/password" (test-users/user->id :rasta))
   {:password "whateverUP12!!"
    :old_password "mismatched"}))


;; ## PUT /api/user/:id/qbnewb
;; Test that we can set the qbnewb status on a user
(expect
  {:response {:success true}
   :is-newb? false}
  (tt/with-temp User [{:keys [id]} {:first_name (random-name)
                                    :last_name  (random-name)
                                    :email      "def@metabase.com"
                                    :password   "def123"}]
    (let [creds {:username "def@metabase.com"
                 :password "def123"}]
      (array-map
       :response (metabase.http-client/client creds :put 200 (format "user/%d/qbnewb" id))
       :is-newb? (db/select-one-field :is_qbnewb User, :id id)))))


;; Check that a non-superuser CANNOT update someone else's password
(expect "You don't have permissions to do that."
        ((test-users/user->client :rasta) :put 403 (format "user/%d/qbnewb" (test-users/user->id :trashbird))))


;; ## DELETE /api/user/:id
;; Disable a user account
(expect
  {:success true}
  (tt/with-temp User [user]
    ((test-users/user->client :crowberto) :delete 200 (format "user/%d" (:id user)) {})))

;; Check that a non-superuser CANNOT update someone else's password
(expect
  "You don't have permissions to do that."
  ((test-users/user->client :rasta) :delete 403 (format "user/%d" (test-users/user->id :rasta)) {}))


;; ## POST /api/user/:id/send_invite
;; Check that non-superusers are denied access to resending invites
(expect
  "You don't have permissions to do that."
  ((test-users/user->client :rasta) :post 403 (format "user/%d/send_invite" (test-users/user->id :crowberto))))


;; test that when disabling Google auth if a user gets disabled and reënabled they are no longer Google Auth (Bug #3323)
(expect
  {:is_active true, :google_auth false}
  (tu/with-temporary-setting-values [google-auth-client-id "ABCDEFG"]
    (tt/with-temp User [user {:google_auth true}]
      (db/update! User (u/get-id user)
        :is_active false)
      (tu/with-temporary-setting-values [google-auth-client-id nil]
        ((test-users/user->client :crowberto) :put 200 (format "user/%s/reactivate" (u/get-id user)))
        (db/select-one [User :is_active :google_auth] :id (u/get-id user))))))

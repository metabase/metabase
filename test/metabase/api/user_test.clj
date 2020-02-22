(ns metabase.api.user-test
  "Tests for /api/user endpoints."
  (:require [clojure.test :refer :all]
            [expectations :refer [expect]]
            [metabase
             [email-test :as et]
             [http-client :as http]
             [util :as u]]
            [metabase.middleware.util :as middleware.u]
            [metabase.models
             [collection :as collection :refer [Collection]]
             [permissions-group :as group :refer [PermissionsGroup]]
             [permissions-group-membership :refer [PermissionsGroupMembership]]
             [user :refer [User]]
             [user-test :as user-test]]
            [metabase.test
             [data :refer :all]
             [fixtures :as fixtures]
             [util :as tu :refer [random-name]]]
            [metabase.test.data.users :as test-users]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

(use-fixtures :once (fixtures/initialize :test-users-personal-collections))

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

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                   Fetching Users -- GET /api/user, GET /api/user/current, GET /api/user/:id                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;; ## /api/user/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint
(expect (get middleware.u/response-unauthentic :body) (http/client :get 401 "user"))
(expect (get middleware.u/response-unauthentic :body) (http/client :get 401 "user/current"))

;; ## GET /api/user
;; Check that anyone can get a list of all active Users
(expect
  [{:id (test-users/user->id :crowberto), :email "crowberto@metabase.com", :first_name "Crowberto", :last_name "Corv",   :common_name "Crowberto Corv"}
   {:id (test-users/user->id :lucky),     :email "lucky@metabase.com",     :first_name "Lucky",     :last_name "Pigeon", :common_name "Lucky Pigeon"}
   {:id (test-users/user->id :rasta),     :email "rasta@metabase.com",     :first_name "Rasta",     :last_name "Toucan", :common_name "Rasta Toucan"}]
  (tu/with-non-admin-groups-no-root-collection-perms
    ;; Delete all the other random Users we've created so far
    ;; Make sure personal Collections have been created

    ;; Now do the request
    ((test-users/user->client :rasta) :get 200 "user")))

(defn- group-ids->sets [users]
  (for [user users]
    (update user :group_ids set)))

;; Check that admins can get a list of active Users. Should include additional admin Fields
(expect
  [(merge
    user-defaults
    {:email                  "crowberto@metabase.com"
     :first_name             "Crowberto"
     :last_name              "Corv"
     :is_superuser           true
     :group_ids              #{(u/get-id (group/all-users))
                               (u/get-id (group/admin))}
     :personal_collection_id true
     :common_name            "Crowberto Corv"})
   (merge
    user-defaults
    {:email                  "lucky@metabase.com"
     :first_name             "Lucky"
     :last_name              "Pigeon"
     :group_ids              #{(u/get-id (group/all-users))}
     :personal_collection_id true
     :common_name            "Lucky Pigeon"})
   (merge
    user-defaults
    {:email                  "rasta@metabase.com"
     :first_name             "Rasta"
     :last_name              "Toucan"
     :group_ids              #{(u/get-id (group/all-users))}
     :personal_collection_id true
     :common_name            "Rasta Toucan"})]
  (-> ((test-users/user->client :crowberto) :get 200 "user")
      group-ids->sets
      tu/boolean-ids-and-timestamps))

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
     :last_name              "Bird"
     :is_active              false
     :group_ids              #{(u/get-id (group/all-users))}
     :personal_collection_id true
     :common_name            "Trash Bird"})
   (merge
    user-defaults
    {:email                  "crowberto@metabase.com"
     :first_name             "Crowberto"
     :last_name              "Corv"
     :is_superuser           true
     :group_ids              #{(u/get-id (group/all-users))
                               (u/get-id (group/admin))}
     :personal_collection_id true
     :common_name            "Crowberto Corv"})
   (merge
    user-defaults
    {:email                  "lucky@metabase.com"
     :first_name             "Lucky"
     :last_name              "Pigeon"
     :group_ids              #{(u/get-id (group/all-users))}
     :personal_collection_id true
     :common_name            "Lucky Pigeon"})
   (merge
    user-defaults
    {:email                  "rasta@metabase.com"
     :first_name             "Rasta"
     :last_name              "Toucan"
     :group_ids              #{(u/get-id (group/all-users))}
     :personal_collection_id true
     :common_name            "Rasta Toucan"})]
  (-> ((test-users/user->client :crowberto) :get 200 "user", :include_deactivated true)
      group-ids->sets
      tu/boolean-ids-and-timestamps))

;; ## GET /api/user/current
;; Check that fetching current user will return extra fields like `is_active` and will return OrgPerms
(expect
  (merge
   user-defaults
   {:email                  "rasta@metabase.com"
    :first_name             "Rasta"
    :last_name              "Toucan"
    :common_name            "Rasta Toucan"
    :group_ids              [(u/get-id (group/all-users))]
    :personal_collection_id true})
  (tu/boolean-ids-and-timestamps ((test-users/user->client :rasta) :get 200 "user/current")))


;; ## GET /api/user/:id
;; Should return a smaller set of fields, and should *not* return OrgPerms
(expect
  (merge
   user-defaults
   {:email       "rasta@metabase.com"
    :first_name  "Rasta"
    :last_name   "Toucan"
    :common_name "Rasta Toucan"
    :group_ids   [(u/get-id (group/all-users))]})
  (tu/boolean-ids-and-timestamps ((test-users/user->client :rasta) :get 200 (str "user/" (test-users/user->id :rasta)))))

;; Check that a non-superuser CANNOT fetch someone else's user details
(expect "You don't have permissions to do that."
        ((test-users/user->client :rasta) :get 403 (str "user/" (test-users/user->id :trashbird))))

;; A superuser should be allowed to fetch another users data
(expect
  (merge
   user-defaults
   {:email       "rasta@metabase.com"
    :first_name  "Rasta"
    :last_name   "Toucan"
    :common_name "Rasta Toucan"
    :group_ids   [(u/get-id (group/all-users))]})
  (tu/boolean-ids-and-timestamps ((test-users/user->client :crowberto) :get 200 (str "user/" (test-users/user->id :rasta)))))

;; We should get a 404 when trying to access a disabled account
(expect
  "Not found."
  ((test-users/user->client :crowberto) :get 404 (str "user/" (test-users/user->id :trashbird))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Creating a new User -- POST /api/user                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

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
             :group_ids        [(u/get-id (group/all-users))]
             :login_attributes {:test "value"}}))
    (et/with-fake-inbox
      (try
        (tu/boolean-ids-and-timestamps
         ((test-users/user->client :crowberto) :post 200 "user"
          {:first_name       user-name
           :last_name        user-name
           :email            email
           :login_attributes {:test "value"}}))
        (finally
          ;; clean up after ourselves
          (db/delete! User :email email))))))

;; Check that non-superusers are denied access
(expect
  "You don't have permissions to do that."
  ((test-users/user->client :rasta) :post 403 "user"
   {:first_name "whatever"
    :last_name  "whatever"
    :email      "whatever@whatever.com"}))

;; Attempting to create a new user with the same email as an existing user should fail
(expect
  {:errors {:email "Email address already in use."}}
  ((test-users/user->client :crowberto) :post 400 "user"
   {:first_name "Something"
    :last_name  "Random"
    :email      (:email (test-users/fetch-user :rasta))}))

;; Test input validations
(expect
  {:errors {:first_name "value must be a non-blank string."}}
  ((test-users/user->client :crowberto) :post 400 "user"
   {}))

(expect
  {:errors {:last_name "value must be a non-blank string."}}
  ((test-users/user->client :crowberto) :post 400 "user"
   {:first_name "whatever"}))

(expect
  {:errors {:email "value must be a valid email address."}}
  ((test-users/user->client :crowberto) :post 400 "user"
   {:first_name "whatever"
    :last_name  "whatever"}))

(expect
  {:errors {:email "value must be a valid email address."}}
  ((test-users/user->client :crowberto) :post 400 "user"
   {:first_name "whatever"
    :last_name  "whatever"
    :email      "whatever"}))

(defn- do-with-temp-user-email [f]
  (let [email (tu/random-email)]
    (try
      (f email)
      (finally (db/delete! User :email email)))))

(defmacro ^:private with-temp-user-email [[email-binding] & body]
  `(do-with-temp-user-email (fn [~email-binding] ~@body)))

;; we should be able to put a User in groups the same time we create them
(expect
  #{"All Users" "Group 1" "Group 2"}
  (tt/with-temp* [PermissionsGroup [group-1 {:name "Group 1"}]
                  PermissionsGroup [group-2 {:name "Group 2"}]]
    (with-temp-user-email [email]
      ((test-users/user->client :crowberto) :post 200 "user"
       {:first_name "Cam"
        :last_name  "Era"
        :email      email
        :group_ids  (map u/get-id [(group/all-users) group-1 group-2])})
      (user-test/user-group-names (User :email email)))))

;; If you forget the All Users group it should fail, because you cannot have a User that's not in the All Users group.
;; The whole API call should fail and no user should be created, even though the permissions groups get set after the
;; User is created
(expect
  false
  (tt/with-temp PermissionsGroup [group {:name "Group"}]
    (with-temp-user-email [email]
      ((test-users/user->client :crowberto) :post 400 "user"
       {:first_name "Cam"
        :last_name  "Era"
        :email      email
        :group_ids  [(u/get-id group)]})
      (db/exists? User :email email))))

(defn- superuser-and-admin-pgm-info [email]
  {:is-superuser? (db/select-one-field :is_superuser User :email email)
   :pgm-exists?   (db/exists? PermissionsGroupMembership
                    :user_id  (db/select-one-id User :email email)
                    :group_id (u/get-id (group/admin)))})

;; We should be able to put someone in the Admin group when we create them by including the admin group in group_ids
(expect
  {:is-superuser? true, :pgm-exists? true}
  (with-temp-user-email [email]
    ((test-users/user->client :crowberto) :post 200 "user"
     {:first_name   "Cam"
      :last_name    "Era"
      :email        email
      :group_ids    (map u/get-id [(group/all-users) (group/admin)])})
    (superuser-and-admin-pgm-info email)))

;; for whatever reason we don't let you set is_superuser in the POST endpoint so if someone tries to pass that it
;; should get ignored
(expect
  {:is-superuser? false, :pgm-exists? false}
  (with-temp-user-email [email]
    ((test-users/user->client :crowberto) :post 200 "user"
     {:first_name   "Cam"
      :last_name    "Era"
      :email        email
      :is_superuser true})
    (superuser-and-admin-pgm-info email)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Updating a User -- PUT /api/user/:id                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn include-personal-collection-name
  {:hydrate :personal_collection_name}
  [user]
  (db/select-one-field :name Collection :id (:personal_collection_id user)))

;; Test that admins can edit other Users
(expect
  {:before   {:first_name "Cam",
              :last_name "Era",
              :is_superuser true,
              :email "cam.era@metabase.com"
              :personal_collection_name "Cam Era's Personal Collection"}
   :response (merge
              user-defaults
              {:common_name  "Cam Eron"
               :email        "cam.eron@metabase.com"
               :first_name   "Cam"
               :last_name    "Eron"
               :is_superuser true
               :group_ids    #{(u/get-id (group/all-users))
                               (u/get-id (group/admin))}})
   :after    {:first_name "Cam"
              :last_name "Eron"
              :is_superuser true
              :email "cam.eron@metabase.com"
              :personal_collection_name "Cam Eron's Personal Collection"}}
  (tt/with-temp* [User [{user-id :id} {:first_name   "Cam"
                                       :last_name    "Era"
                                       :email        "cam.era@metabase.com"
                                       :is_superuser true}]
                  Collection [coll]]
    (let [user (fn [] (into {} (-> (db/select-one [User :id :first_name :last_name :is_superuser :email], :id user-id)
                                   (hydrate :personal_collection_id :personal_collection_name)
                                   (dissoc :id :personal_collection_id :common_name))))]
      (array-map
       :before   (user)
       :response (-> ((test-users/user->client :crowberto) :put 200 (str "user/" user-id)
                      {:last_name "Eron"
                       :email     "cam.eron@metabase.com"})
                     (update :group_ids set)
                     tu/boolean-ids-and-timestamps)
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
    :last_name        "User"
    :group_ids        #{(u/get-id (group/all-users))
                        (u/get-id (group/admin))}})
  (tt/with-temp User [{user-id :id} {:first_name   "Test"
                                     :last_name    "User"
                                     :email        "testuser@metabase.com"
                                     :is_superuser true}]
    (->
     ((test-users/user->client :crowberto) :put 200 (str "user/" user-id) {:email            "testuser@metabase.com"
                                                                           :login_attributes {:test "value"}})
     (update :group_ids set)
     tu/boolean-ids-and-timestamps)))

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

;; Check that we can update the groups a User belongs to -- if we are a superuser
(expect
  #{"All Users" "Blue Man Group"}
  (tt/with-temp* [User             [user]
                  PermissionsGroup [group {:name "Blue Man Group"}]]
    (do
      ((test-users/user->client :crowberto) :put 200 (str "user/" (u/get-id user))
       {:group_ids (map u/get-id [(group/all-users) group])})
      (user-test/user-group-names user))))

(defn- do-with-preserved-rasta-personal-collection-name [thunk]
  (let [{collection-name :name, collection-id :id} (collection/user->personal-collection (test-users/user->id :rasta))]
    (tu/with-temp-vals-in-db Collection collection-id {:name collection-name}
      (thunk))))

(defmacro ^:private with-preserved-rasta-personal-collection-name
  "Preserve the name of Rasta's personal collection inside a body that might cause it to change (e.g. changing user name
  via the API.)"
  [& body]
  `(do-with-preserved-rasta-personal-collection-name (fn [] ~@body)))

;; if we pass group_ids, and are updating ourselves as a non-superuser, the entire call should fail
(expect
  {:groups     #{"All Users"}
   :first-name "Rasta"}
  ;; By wrapping the test in this macro even if the test fails it will restore the original values
  (tu/with-temp-vals-in-db User (test-users/user->id :rasta) {:first_name "Rasta"}
    (with-preserved-rasta-personal-collection-name
      (tt/with-temp PermissionsGroup [group {:name "Blue Man Group"}]
        ((test-users/user->client :rasta) :put 403 (str "user/" (test-users/user->id :rasta))
         {:group_ids  (map u/get-id [(group/all-users) group])
          :first_name "Reggae"})))
    {:groups     (user-test/user-group-names (test-users/user->id :rasta))
     :first-name (db/select-one-field :first_name User :id (test-users/user->id :rasta))}))

;; if we pass group_ids as a non-superuser the call should succeed, so long as the value doesn't change
(expect
  {:groups     #{"All Users"}
   :first-name "Reggae"}
  (tu/with-temp-vals-in-db User (test-users/user->id :rasta) {:first_name "Rasta"}
    (with-preserved-rasta-personal-collection-name
      ((test-users/user->client :rasta) :put 200 (str "user/" (test-users/user->id :rasta))
       {:group_ids  [(u/get-id (group/all-users))]
        :first_name "Reggae"}))
    {:groups     (user-test/user-group-names (test-users/user->id :rasta))
     :first-name (db/select-one-field :first_name User :id (test-users/user->id :rasta))}))

;; We should be able to put someone in the Admin group when we update them them (is_superuser = TRUE and group_ids
;; including admin group ID)
(expect
  {:is-superuser? true, :pgm-exists? true}
  (tt/with-temp User [{:keys [email id]}]
    ((test-users/user->client :crowberto) :put 200 (str "user/" id)
     {:is_superuser true
      :group_ids    (map u/get-id [(group/all-users) (group/admin)])})
    (superuser-and-admin-pgm-info email)))

;; if we try to create a new user with is_superuser FALSE but group_ids that includes the Admin group ID, the entire
;; call should fail
(expect
  {:is-superuser? false, :pgm-exists? false, :first-name "Old First Name"}
  (tt/with-temp User [{:keys [email id]} {:first_name "Old First Name"}]
    ((test-users/user->client :crowberto) :put 400 (str "user/" id)
     {:is_superuser false
      :group_ids    (map u/get-id [(group/all-users) (group/admin)])
      :first_name   "Cool New First Name"})
    (assoc (superuser-and-admin-pgm-info email)
      :first-name (db/select-one-field :first_name User :id id))))

;; if we try to create a new user with is_superuser TRUE but group_ids that does not include the Admin group ID,
;; things should fail
(expect
  {:is-superuser? false, :pgm-exists? false}
  (tt/with-temp User [{:keys [email id]}]
    ((test-users/user->client :crowberto) :put 400 (str "user/" id)
     {:is_superuser true
      :group_ids    [(u/get-id (group/all-users))]})
    (superuser-and-admin-pgm-info email)))

;; if we PUT a user with is_superuser TRUE but don't specify group_ids, we should be ok
(expect
  {:is-superuser? true, :pgm-exists? true}
  (tt/with-temp User [{:keys [email id]}]
    ((test-users/user->client :crowberto) :put 200 (str "user/" id)
     {:is_superuser true})
    (superuser-and-admin-pgm-info email)))

;; if we include Admin in group_ids but don't specify is_superuser we should be ok
(expect
  {:is-superuser? true, :pgm-exists? true}
  (tt/with-temp User [{:keys [email id]}]
    ((test-users/user->client :crowberto) :put 200 (str "user/" id)
     {:group_ids [(u/get-id (group/all-users))
                  (u/get-id (group/admin))]})
    (superuser-and-admin-pgm-info email)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                              Reactivating a User -- PUT /api/user/:id/reactivate                               |
;;; +----------------------------------------------------------------------------------------------------------------+

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

;; Attempting to reactivate a non-existant user should return a 404
(expect
  "Not found."
  ((test-users/user->client :crowberto) :put 404 (format "user/%s/reactivate" Integer/MAX_VALUE)))

;; Attempting to reactivate an already active user should fail
(expect
  {:message "Not able to reactivate an active user"}
  ((test-users/user->client :crowberto) :put 400 (format "user/%s/reactivate" (test-users/user->id :rasta))))

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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                               Updating a Password -- PUT /api/user/:id/password                                |
;;; +----------------------------------------------------------------------------------------------------------------+

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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                             Deleting (Deactivating) a User -- DELETE /api/user/:id                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; ## DELETE /api/user/:id
;; Disable a user account
(expect
  {:success true}
  (tt/with-temp User [user]
    ((test-users/user->client :crowberto) :delete 200 (format "user/%d" (:id user)) {})))

;; Check that a non-superuser CANNOT update delete themselves
(expect
  "You don't have permissions to do that."
  ((test-users/user->client :rasta) :delete 403 (format "user/%d" (test-users/user->id :rasta)) {}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                  Other Endpoints -- PUT /api/user/:id/qpnewb, POST /api/user/:id/send_invite                   |
;;; +----------------------------------------------------------------------------------------------------------------+

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


;; ## POST /api/user/:id/send_invite
;; Check that non-superusers are denied access to resending invites
(expect
  "You don't have permissions to do that."
  ((test-users/user->client :rasta) :post 403 (format "user/%d/send_invite" (test-users/user->id :crowberto))))

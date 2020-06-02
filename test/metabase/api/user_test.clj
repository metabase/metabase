(ns metabase.api.user-test
  "Tests for /api/user endpoints."
  (:require [clojure.test :refer :all]
            [expectations :refer [expect]]
            [metabase
             [email-test :as et]
             [http-client :as http]
             [test :as mt]
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
            [metabase.util.i18n :as i18n]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(use-fixtures
  :once
  (fixtures/initialize :test-users-personal-collections)
  ;; reset Toucan hydrate keys because we define some custom ones in this namespace, need to make sure they get loaded
  (fn [thunk]
    (toucan.hydrate/flush-hydration-key-caches!)
    (thunk)))

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
   :updated_at       true
   :locale           nil})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                   Fetching Users -- GET /api/user, GET /api/user/current, GET /api/user/:id                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;; ## /api/user/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint
(deftest user-list-authentication-test
  (testing "authentication"
    (testing "GET /api/user"
      (is (= (get middleware.u/response-unauthentic :body)
             (http/client :get 401 "user"))))
    (testing "GET /api/user/current"
      (is (= (get middleware.u/response-unauthentic :body)
             (http/client :get 401 "user/current"))))))

(deftest user-list-test
  (testing "GET /api/user"
    (testing "Check that anyone can get a list of all active Users"
      (tu/with-non-admin-groups-no-root-collection-perms
        (is (= [{:id          (mt/user->id :crowberto)
                 :email       "crowberto@metabase.com"
                 :first_name  "Crowberto"
                 :last_name   "Corv"
                 :common_name "Crowberto Corv"}
                {:id          (mt/user->id :lucky)
                 :email       "lucky@metabase.com"
                 :first_name  "Lucky"
                 :last_name   "Pigeon"
                 :common_name "Lucky Pigeon"}
                {:id          (mt/user->id :rasta)
                 :email       "rasta@metabase.com"
                 :first_name  "Rasta"
                 :last_name   "Toucan"
                 :common_name "Rasta Toucan"}]
               (->> ((mt/user->client :rasta) :get 200 "user")
                    (filter mt/test-user?))))))))

(defn- group-ids->sets [users]
  (for [user users]
    (update user :group_ids set)))

(deftest admin-user-list-test
  (testing "GET /api/user"
    (testing "Check that admins can get a list of active Users. Should include additional admin Fields"
      (is (= (->> [{:email                  "crowberto@metabase.com"
                    :first_name             "Crowberto"
                    :last_name              "Corv"
                    :is_superuser           true
                    :group_ids              #{(u/get-id (group/all-users))
                                              (u/get-id (group/admin))}
                    :personal_collection_id true
                    :common_name            "Crowberto Corv"}
                   {:email                  "lucky@metabase.com"
                    :first_name             "Lucky"
                    :last_name              "Pigeon"
                    :group_ids              #{(u/get-id (group/all-users))}
                    :personal_collection_id true
                    :common_name            "Lucky Pigeon"}
                   {:email                  "rasta@metabase.com"
                    :first_name             "Rasta"
                    :last_name              "Toucan"
                    :group_ids              #{(u/get-id (group/all-users))}
                    :personal_collection_id true
                    :common_name            "Rasta Toucan"}]
                  (map (partial merge user-defaults))
                  (map #(dissoc % :is_qbnewb :last_login)))
             (->> ((mt/user->client :crowberto) :get 200 "user")
                  (filter mt/test-user?)
                  group-ids->sets
                  tu/boolean-ids-and-timestamps
                  (map #(dissoc % :is_qbnewb :last_login))))))))

(deftest user-list-include-inactive-test
  (testing "GET /api/user?include_deactivated=true"
    (testing "Non-admins should *not* be allowed to pass in include_deactivated"
      (is (= "You don't have permissions to do that."
             ((mt/user->client :rasta) :get 403 "user", :include_deactivated true))))

    (testing "for admins, it should include those inactive users as we'd expect"
      (is (= (->> [{:email                  "trashbird@metabase.com"
                    :first_name             "Trash"
                    :last_name              "Bird"
                    :is_active              false
                    :group_ids              #{(u/get-id (group/all-users))}
                    :personal_collection_id true
                    :common_name            "Trash Bird"}
                   {:email                  "crowberto@metabase.com"
                    :first_name             "Crowberto"
                    :last_name              "Corv"
                    :is_superuser           true
                    :group_ids              #{(u/get-id (group/all-users))
                                              (u/get-id (group/admin))}
                    :personal_collection_id true
                    :common_name            "Crowberto Corv"}
                   {:email                  "lucky@metabase.com"
                    :first_name             "Lucky"
                    :last_name              "Pigeon"
                    :group_ids              #{(u/get-id (group/all-users))}
                    :personal_collection_id true
                    :common_name            "Lucky Pigeon"}
                   {:email                  "rasta@metabase.com"
                    :first_name             "Rasta"
                    :last_name              "Toucan"
                    :group_ids              #{(u/get-id (group/all-users))}
                    :personal_collection_id true
                    :common_name            "Rasta Toucan"}]
                  (map (partial merge user-defaults))
                  (map #(dissoc % :is_qbnewb :last_login)))
             (->> ((mt/user->client :crowberto) :get 200 "user", :include_deactivated true)
                  (filter mt/test-user?)
                  group-ids->sets
                  tu/boolean-ids-and-timestamps
                  (map #(dissoc % :is_qbnewb :last_login))))))))

(deftest get-current-user-test
  (testing "GET /api/user/current"
    (testing "check that fetching current user will return extra fields like `is_active`"
      (is (= (-> (merge
                  user-defaults
                  {:email                  "rasta@metabase.com"
                   :first_name             "Rasta"
                   :last_name              "Toucan"
                   :common_name            "Rasta Toucan"
                   :group_ids              [(u/get-id (group/all-users))]
                   :personal_collection_id true})
                 (dissoc :is_qbnewb :last_login))
             (-> ((mt/user->client :rasta) :get 200 "user/current")
                 tu/boolean-ids-and-timestamps
                 (dissoc :is_qbnewb :last_login)))))))

(deftest get-user-test
  (testing "GET /api/user/:id"
    (testing "should return a smaller set of fields"
      (is (= (-> (merge
                  user-defaults
                  {:email       "rasta@metabase.com"
                   :first_name  "Rasta"
                   :last_name   "Toucan"
                   :common_name "Rasta Toucan"
                   :group_ids   [(u/get-id (group/all-users))]})
                 (dissoc :is_qbnewb :last_login))
             (-> ((mt/user->client :rasta) :get 200 (str "user/" (mt/user->id :rasta)))
                 tu/boolean-ids-and-timestamps
                 (dissoc :is_qbnewb :last_login)))))

    (testing "Check that a non-superuser CANNOT fetch someone else's user details"
      (is (= "You don't have permissions to do that."
             ((mt/user->client :rasta) :get 403 (str "user/" (mt/user->id :trashbird))))))

    (testing "A superuser should be allowed to fetch another users data"
      (is (= (-> (merge
                  user-defaults
                  {:email       "rasta@metabase.com"
                   :first_name  "Rasta"
                   :last_name   "Toucan"
                   :common_name "Rasta Toucan"
                   :group_ids   [(u/get-id (group/all-users))]})
                 (dissoc :is_qbnewb :last_login))
             (-> ((mt/user->client :crowberto) :get 200 (str "user/" (mt/user->id :rasta)))
                 tu/boolean-ids-and-timestamps
                 (dissoc :is_qbnewb :last_login)))))

    (testing "We should get a 404 when trying to access a disabled account"
      (is (= "Not found."
             ((mt/user->client :crowberto) :get 404 (str "user/" (mt/user->id :trashbird))))))))


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
        ((mt/user->client :crowberto) :post 200 "user"
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
  ((mt/user->client :rasta) :post 403 "user"
   {:first_name "whatever"
    :last_name  "whatever"
    :email      "whatever@whatever.com"}))

;; Attempting to create a new user with the same email as an existing user should fail
(expect
  {:errors {:email "Email address already in use."}}
  ((mt/user->client :crowberto) :post 400 "user"
   {:first_name "Something"
    :last_name  "Random"
    :email      (:email (mt/fetch-user :rasta))}))

;; Test input validations
(expect
  {:errors {:first_name "value must be a non-blank string."}}
  ((mt/user->client :crowberto) :post 400 "user"
   {}))

(expect
  {:errors {:last_name "value must be a non-blank string."}}
  ((mt/user->client :crowberto) :post 400 "user"
   {:first_name "whatever"}))

(expect
  {:errors {:email "value must be a valid email address."}}
  ((mt/user->client :crowberto) :post 400 "user"
   {:first_name "whatever"
    :last_name  "whatever"}))

(expect
  {:errors {:email "value must be a valid email address."}}
  ((mt/user->client :crowberto) :post 400 "user"
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
  (mt/with-temp* [PermissionsGroup [group-1 {:name "Group 1"}]
                  PermissionsGroup [group-2 {:name "Group 2"}]]
    (with-temp-user-email [email]
      ((mt/user->client :crowberto) :post 200 "user"
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
  (mt/with-temp PermissionsGroup [group {:name "Group"}]
    (with-temp-user-email [email]
      ((mt/user->client :crowberto) :post 400 "user"
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
    ((mt/user->client :crowberto) :post 200 "user"
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
    ((mt/user->client :crowberto) :post 200 "user"
     {:first_name   "Cam"
      :last_name    "Era"
      :email        email
      :is_superuser true})
    (superuser-and-admin-pgm-info email)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Updating a User -- PUT /api/user/:id                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- include-personal-collection-name
  {:hydrate :personal_collection_name}
  [user]
  (db/select-one-field :name Collection :id (:personal_collection_id user)))

(deftest admin-update-other-user-test
  (testing "PUT /api/user/:id"
    (testing "test that admins can edit other Users\n"
      (mt/with-temp* [User [{user-id :id} {:first_name   "Cam"
                                           :last_name    "Era"
                                           :email        "cam.era@metabase.com"
                                           :is_superuser true}]
                      Collection [coll]]
        (letfn [(user [] (into {} (-> (db/select-one [User :id :first_name :last_name :is_superuser :email], :id user-id)
                                      (hydrate :personal_collection_id :personal_collection_name)
                                      (dissoc :id :personal_collection_id :common_name))))]
          (testing "before API call"
            (is (= {:first_name               "Cam"
                    :last_name                "Era"
                    :is_superuser             true
                    :email                    "cam.era@metabase.com"
                    :personal_collection_name "Cam Era's Personal Collection"}
                   (user))))
          (testing "response"
            (is (= (merge
                    user-defaults
                    {:common_name  "Cam Eron"
                     :email        "cam.eron@metabase.com"
                     :first_name   "Cam"
                     :last_name    "Eron"
                     :is_superuser true
                     :group_ids    #{(u/get-id (group/all-users))
                                     (u/get-id (group/admin))}})
                   (-> ((mt/user->client :crowberto) :put 200 (str "user/" user-id)
                        {:last_name "Eron"
                         :email     "cam.eron@metabase.com"})
                       (update :group_ids set)
                       tu/boolean-ids-and-timestamps))))
          (testing "after API call"
            (is (= {:first_name               "Cam"
                    :last_name                "Eron"
                    :is_superuser             true
                    :email                    "cam.eron@metabase.com"
                    :personal_collection_name "Cam Eron's Personal Collection"}
                   (user)))))))))

;;
(deftest update-login-attributes-test
  (testing "PUT /api/user/:id"
    (testing "Test that we can update login attributes after a user has been created"
      (mt/with-temp User [{user-id :id} {:first_name   "Test"
                                         :last_name    "User"
                                         :email        "testuser@metabase.com"
                                         :is_superuser true}]
        (is (= (merge
                user-defaults
                {:is_superuser     true
                 :email            "testuser@metabase.com"
                 :first_name       "Test"
                 :login_attributes {:test "value"}
                 :common_name      "Test User"
                 :last_name        "User"
                 :group_ids        #{(u/get-id (group/all-users))
                                     (u/get-id (group/admin))}})
               (-> ((mt/user->client :crowberto) :put 200 (str "user/" user-id) {:email            "testuser@metabase.com"
                                                                                 :login_attributes {:test "value"}})
                   (update :group_ids set)
                   tu/boolean-ids-and-timestamps)))))))

(deftest update-email-check-if-already-used-test
  (testing "PUT /api/user/:id"
    (testing "test that updating a user's email to an existing inactive user's email fails"
      (let [trashbird (mt/fetch-user :trashbird)
            rasta     (mt/fetch-user :rasta)]
        (is (= {:errors {:email "Email address already associated to another user."}}
               ((mt/user->client :crowberto) :put 400 (str "user/" (u/get-id rasta)) (select-keys trashbird [:email]))))))))

(deftest update-superuser-status-test
  (testing "PUT /api/user/:id"
    (testing "Test that a normal user cannot change the :is_superuser flag for themselves"
      (letfn [(fetch-rasta []
                (db/select-one [User :first_name :last_name :is_superuser :email], :id (mt/user->id :rasta)))]
        (let [before (fetch-rasta)]
          ((mt/user->client :rasta) :put 200 (str "user/" (mt/user->id :rasta)) (assoc (fetch-rasta) :is_superuser true))
          (is (= before
                 (fetch-rasta))))))))

;; Check that a non-superuser CANNOT update someone else's user details
(expect
  "You don't have permissions to do that."
  ((mt/user->client :rasta) :put 403 (str "user/" (mt/user->id :trashbird))
   {:email "toucan@metabase.com"}))

;; We should get a 404 when trying to access a disabled account
(expect
  "Not found."
  ((mt/user->client :crowberto) :put 404 (str "user/" (mt/user->id :trashbird))
   {:email "toucan@metabase.com"}))

;; Google auth users shouldn't be able to change their own password as we get that from Google
(expect
  "You don't have permissions to do that."
  (mt/with-temp User [user {:email       "anemail@metabase.com"
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
  (mt/with-temp User [user {:email       "anemail@metabase.com"
                            :password    "def123"
                            :ldap_auth true}]
    (let [creds {:username "anemail@metabase.com"
                 :password "def123"}]
      (http/client creds :put 403 (format "user/%d" (u/get-id user))
                   {:email "adifferentemail@metabase.com"}))))

;; Check that we can update the groups a User belongs to -- if we are a superuser
(expect
  #{"All Users" "Blue Man Group"}
  (mt/with-temp* [User             [user]
                  PermissionsGroup [group {:name "Blue Man Group"}]]
    (do
      ((mt/user->client :crowberto) :put 200 (str "user/" (u/get-id user))
       {:group_ids (map u/get-id [(group/all-users) group])})
      (user-test/user-group-names user))))

(defn- do-with-preserved-rasta-personal-collection-name [thunk]
  (let [{collection-name :name, collection-id :id} (collection/user->personal-collection (mt/user->id :rasta))]
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
  (tu/with-temp-vals-in-db User (mt/user->id :rasta) {:first_name "Rasta"}
    (with-preserved-rasta-personal-collection-name
      (mt/with-temp PermissionsGroup [group {:name "Blue Man Group"}]
        ((mt/user->client :rasta) :put 403 (str "user/" (mt/user->id :rasta))
         {:group_ids  (map u/get-id [(group/all-users) group])
          :first_name "Reggae"})))
    {:groups     (user-test/user-group-names (mt/user->id :rasta))
     :first-name (db/select-one-field :first_name User :id (mt/user->id :rasta))}))

;; if we pass group_ids as a non-superuser the call should succeed, so long as the value doesn't change
(expect
  {:groups     #{"All Users"}
   :first-name "Reggae"}
  (tu/with-temp-vals-in-db User (mt/user->id :rasta) {:first_name "Rasta"}
    (with-preserved-rasta-personal-collection-name
      ((mt/user->client :rasta) :put 200 (str "user/" (mt/user->id :rasta))
       {:group_ids  [(u/get-id (group/all-users))]
        :first_name "Reggae"}))
    {:groups     (user-test/user-group-names (mt/user->id :rasta))
     :first-name (db/select-one-field :first_name User :id (mt/user->id :rasta))}))

;; We should be able to put someone in the Admin group when we update them them (is_superuser = TRUE and group_ids
;; including admin group ID)
(expect
  {:is-superuser? true, :pgm-exists? true}
  (mt/with-temp User [{:keys [email id]}]
    ((mt/user->client :crowberto) :put 200 (str "user/" id)
     {:is_superuser true
      :group_ids    (map u/get-id [(group/all-users) (group/admin)])})
    (superuser-and-admin-pgm-info email)))

;; if we try to create a new user with is_superuser FALSE but group_ids that includes the Admin group ID, the entire
;; call should fail
(expect
  {:is-superuser? false, :pgm-exists? false, :first-name "Old First Name"}
  (mt/with-temp User [{:keys [email id]} {:first_name "Old First Name"}]
    ((mt/user->client :crowberto) :put 400 (str "user/" id)
     {:is_superuser false
      :group_ids    (map u/get-id [(group/all-users) (group/admin)])
      :first_name   "Cool New First Name"})
    (assoc (superuser-and-admin-pgm-info email)
      :first-name (db/select-one-field :first_name User :id id))))

;; if we try to create a new user with is_superuser TRUE but group_ids that does not include the Admin group ID,
;; things should fail
(expect
  {:is-superuser? false, :pgm-exists? false}
  (mt/with-temp User [{:keys [email id]}]
    ((mt/user->client :crowberto) :put 400 (str "user/" id)
     {:is_superuser true
      :group_ids    [(u/get-id (group/all-users))]})
    (superuser-and-admin-pgm-info email)))

;; if we PUT a user with is_superuser TRUE but don't specify group_ids, we should be ok
(expect
  {:is-superuser? true, :pgm-exists? true}
  (mt/with-temp User [{:keys [email id]}]
    ((mt/user->client :crowberto) :put 200 (str "user/" id)
     {:is_superuser true})
    (superuser-and-admin-pgm-info email)))

;; if we include Admin in group_ids but don't specify is_superuser we should be ok
(expect
  {:is-superuser? true, :pgm-exists? true}
  (mt/with-temp User [{:keys [email id]}]
    ((mt/user->client :crowberto) :put 200 (str "user/" id)
     {:group_ids [(u/get-id (group/all-users))
                  (u/get-id (group/admin))]})
    (superuser-and-admin-pgm-info email)))

(deftest update-locale-test
  (testing "PUT /api/user/:id\n"
    (mt/with-temp User [{user-id :id, email :email} {:password "p@ssw0rd"}]
      (letfn [(set-locale! [expected-status-code new-locale]
                (mt/client {:username email, :password "p@ssw0rd"}
                           :put expected-status-code (str "user/" user-id)
                           {:locale new-locale}))
              (locale-from-db []
                (db/select-one-field :locale User :id user-id))]
        (let [url (str "user/" user-id)]
          (testing "normal Users should be able to update their own locale"
            (doseq [[message locale] {"to a language-country locale (with dash)"       "es-MX"
                                      "to a language-country locale (with underscore)" "es_MX"
                                      "to a language-only locale"                      "es"
                                      "to `nil` (use system default)"                  nil}]
              (testing message
                (testing "response"
                  (is (= (i18n/normalized-locale-string locale)
                         (:locale (set-locale! 200 locale)))))
                (testing "value in DB should be updated to new locale"
                  (is (= (i18n/normalized-locale-string locale)
                         (locale-from-db)))))))

          (testing "admins should be able to update someone else's locale"
            (testing "response"
              (is (= "en_US"
                     (:locale ((mt/user->client :crowberto) :put 200 url {:locale "en-US"})))))
            (testing "value in DB should be updated and normalized"
              (is (= "en_US"
                     (locale-from-db)))))

          (testing "normal Users should not be able to update someone else's locale"
            (testing "response"
              (is (= "You don't have permissions to do that."
                     ((mt/user->client :lucky) :put 403 url {:locale "en-GB"}))))
            (testing "value in DB should be unchanged"
              (is (= "en_US"
                     (locale-from-db)))))

          (testing "attempting to set an invalid locales should result in an error"
            (doseq [[group locales] {"invalid input"              [nil "" 100 "ab/cd" "USA!"]
                                     "3-letter codes"             ["eng" "eng-USA"]
                                     "languages that don't exist" ["zz" "xx" "xx-yy"]}
                    new-locale      locales]
              (testing group
                (testing (format "attempt to set locale to %s" new-locale)
                  (testing "response"
                    (is (schema= {:errors {:locale #".*String must be a valid two-letter ISO language or language-country code.*"}}
                                 (set-locale! 400 {:locale new-locale}))))
                  (testing "value in DB should be unchanged"
                    (is (= "en_US"
                           (locale-from-db)))))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                              Reactivating a User -- PUT /api/user/:id/reactivate                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest reactivate-user-test
  (testing "PUT /api/user/:id/reactivate"
    (testing "Test that reactivating a disabled account works"
      (mt/with-temp User [user {:is_active false}]
        ;; now try creating the same user again, should re-activiate the original
        ((mt/user->client :crowberto) :put 200 (format "user/%s/reactivate" (u/get-id user))
         {:first_name (:first_name user)
          :last_name  "whatever"
          :email      (:email user)})
        (is (= true
               (db/select-one-field :is_active User :id (:id user)))
            "the user should now be active")))

    (testing "error conditions"
      (testing "Attempting to reactivate a non-existant user should return a 404"
        (is (= "Not found."
               ((mt/user->client :crowberto) :put 404 (format "user/%s/reactivate" Integer/MAX_VALUE)))))

      (testing " Attempting to reactivate an already active user should fail"
        (is (= {:message "Not able to reactivate an active user"}
               ((mt/user->client :crowberto) :put 400 (format "user/%s/reactivate" (mt/user->id :rasta)))))))

    (testing (str "test that when disabling Google auth if a user gets disabled and re-enabled they are no longer "
                  "Google Auth (#3323)")
      (tu/with-temporary-setting-values [google-auth-client-id "ABCDEFG"]
        (mt/with-temp User [user {:google_auth true}]
          (db/update! User (u/get-id user)
            :is_active false)
          (tu/with-temporary-setting-values [google-auth-client-id nil]
            ((mt/user->client :crowberto) :put 200 (format "user/%s/reactivate" (u/get-id user)))
            (is (= {:is_active true, :google_auth false}
                   (mt/derecordize (db/select-one [User :is_active :google_auth] :id (u/get-id user)))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                               Updating a Password -- PUT /api/user/:id/password                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- user-can-reset-password? [superuser?]
  (mt/with-temp User [user {:password "def", :is_superuser (boolean superuser?)}]
    (let [creds           {:username (:email user), :password "def"}
          hashed-password (db/select-one-field :password User, :email (:email user))]
      ;; use API to reset the users password
      (mt/client creds :put 200 (format "user/%d/password" (:id user)) {:password     "abc123!!DEF"
                                                                        :old_password "def"})
      ;; now simply grab the lastest pass from the db and compare to the one we have from before reset
      (not= hashed-password (db/select-one-field :password User, :email (:email user))))))

(deftest can-reset-password-test
  (testing "PUT /api/user/:id/password"
    (testing "Test that we can reset our own password. If user is a"
      (testing "superuser"
        (is (= true
               (user-can-reset-password? :superuser))))
      (testing "non-superuser"
        (is (= true
               (user-can-reset-password? (not :superuser))))))))

(deftest reset-password-permissions-test
  (testing "PUT /api/user/:id/password"
    (testing "Check that a non-superuser CANNOT update someone else's password"
      (is (= "You don't have permissions to do that."
             ((mt/user->client :rasta) :put 403 (format "user/%d/password" (mt/user->id :trashbird))
              {:password     "whateverUP12!!"
               :old_password "whatever"}))))))

(deftest reset-password-input-validation-test
  (testing "PUT /api/user/:id/password"
    (testing "Test input validations on password change"
      (is (= {:errors {:password "Insufficient password strength"}}
             ((mt/user->client :rasta) :put 400 (format "user/%d/password" (mt/user->id :rasta)) {}))))

    (testing "Make sure that if current password doesn't match we get a 400"
      (is (= {:errors {:old_password "Invalid password"}}
             ((mt/user->client :rasta) :put 400 (format "user/%d/password" (mt/user->id :rasta))
              {:password     "whateverUP12!!"
               :old_password "mismatched"}))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                             Deleting (Deactivating) a User -- DELETE /api/user/:id                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest deactivate-user-test
  (testing "DELETE /api/user/:id"
    (mt/with-temp User [user]
      (is (= {:success true}
             ((mt/user->client :crowberto) :delete 200 (format "user/%d" (:id user)) {})))

      (testing "User should still exist, but be inactive"
        (is (= {:is_active false}
               (mt/derecordize (db/select-one [User :is_active] :id (:id user)))))))

    (testing "Check that a non-superuser CANNOT update deactivate themselves"
      (is (= "You don't have permissions to do that."
             ((mt/user->client :rasta) :delete 403 (format "user/%d" (mt/user->id :rasta)) {}))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                  Other Endpoints -- PUT /api/user/:id/qpnewb, POST /api/user/:id/send_invite                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-qbnewb-test
  (testing "PUT /api/user/:id/qbnewb"
    (testing "Test that we can set the QB newb status of ourselves"
      (mt/with-temp User [{:keys [id]} {:first_name (random-name)
                                        :last_name  (random-name)
                                        :email      "def@metabase.com"
                                        :password   "def123"}]
        (let [creds {:username "def@metabase.com"
                     :password "def123"}]
          (testing "response"
            (is (= {:success true}
                   (mt/client creds :put 200 (format "user/%d/qbnewb" id)))))
          (testing "newb?"
            (is (= false
                   (db/select-one-field :is_qbnewb User, :id id)))))))

    (testing "shouldn't be allowed to set someone else's QB newb status"
      (is (= "You don't have permissions to do that."
             ((mt/user->client :rasta) :put 403 (format "user/%d/qbnewb" (mt/user->id :trashbird))))))))

(deftest send-invite-test
  (testing "POST /api/user/:id/send_invite"
    (testing "Check that non-superusers are denied access to resending invites"
      (is (= "You don't have permissions to do that."
             ((mt/user->client :rasta) :post 403 (format "user/%d/send_invite" (mt/user->id :crowberto))))))))

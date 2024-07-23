(ns metabase-enterprise.scim.v2.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.scim.api :as scim]
   [metabase-enterprise.scim.v2.api :as scim-api]
   [metabase.http-client :as client]
   [metabase.test :as mt]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(def ^:dynamic *scim-api-key* nil)

(defn with-scim-setup-impl!
  "Implementation of the `with-scim-setup!` macro. Enables SCIM and ensures that a SCIM key has been created and bound
  to the `*scim-api-key*` dynamic var to use in test requests. Also restores the previous SCIM API key after the test
  run."
  [thunk]
  (mt/with-additional-premium-features #{:scim}
    (mt/with-temporary-setting-values [scim-enabled true]
      (let [current-masked-key (-> (t2/select-one :model/ApiKey :scope :scim)
                                   (dissoc :masked_key))
            temp-unmasked-key  (-> (#'scim/refresh-scim-api-key! (mt/user->id :crowberto))
                                   :unmasked_key)]
        (try
          (#'scim/backfill-required-entity-ids!)
          (binding [*scim-api-key* temp-unmasked-key]
            (thunk))
          (finally
            (t2/delete! :model/ApiKey :scope :scim)
            (when current-masked-key
              (t2/insert! :model/ApiKey current-masked-key))))))))

(defmacro with-scim-setup! [& body]
  `(with-scim-setup-impl! (fn [] ~@body)))

(defn- scim-client
  "Wrapper for `metabase.http-client/client` which includes the SCIM key in the Authorization header"
  ([method expected-status-code endpoint]
   (scim-client method expected-status-code endpoint {}))
  ([method expected-status-code endpoint body]
   (client/client method
                  expected-status-code
                  endpoint
                  {:request-options
                   {:headers {"authorization" (format "Bearer %s" *scim-api-key*)}}}
                  body)))

(deftest scim-authentication-test
  (with-scim-setup!
    (testing "SCIM endpoints require a valid SCIM API key passed in the authorization header"
      (scim-client :get 200 "ee/scim/v2/Users"))

    (testing "SCIM endpoints cannot be used if SCIM is not enabled"
      (mt/with-temporary-setting-values [scim-enabled false]
        (scim-client :get 401 "ee/scim/v2/Users")))

    (testing "The SCIM API key cannot be used for non-SCIM endpoints"
      (scim-client :get 401 "user"))

    (testing "SCIM endpoints do not allow normal auth"
      (mt/user-http-request :crowberto :get 401 "ee/scim/v2/Users"))

    (testing "A SCIM API key cannot be passed via the x-api-key header"
      (client/client :get 401 "ee/scim/v2/Users" {:request-options {:headers {"x-api-key" *scim-api-key*}}}))))

(deftest fetch-user-test
  (with-scim-setup!
    (testing "A single user can be fetched in the SCIM format by entity ID"
      (let [entity-id (t2/select-one-fn :entity_id :model/User :id (mt/user->id :rasta))]
        (is (= {:schemas  ["urn:ietf:params:scim:schemas:core:2.0:User"]
                :id       (t2/select-one-fn :entity_id :model/User :id (mt/user->id :rasta))
                :userName "rasta@metabase.com"
                :name     {:givenName "Rasta" :familyName "Toucan"}
                :emails   [{:value "rasta@metabase.com"}]
                :active   true
                :locale   nil
                :meta     {:resourceType "User"}}
               (scim-client :get 200 (format "ee/scim/v2/Users/%s" entity-id))))))

    (testing "404 is returned when fetching a non-existant user"
      (scim-client :get 404 (format "ee/scim/v2/Users/%s" (random-uuid))))))

(deftest list-users-test
  (with-scim-setup!
    (testing "Fetch users with default pagination"
      (let [response (scim-client :get 200 "ee/scim/v2/Users")]
        (is (malli= scim-api/SCIMUserList response))))

    (testing "Fetch users with custom pagination"
      (let [response (scim-client :get 200 (format "ee/scim/v2/Users?startIndex=%d&count=%d" 1 2))]
        (is (= ["urn:ietf:params:scim:api:messages:2.0:ListResponse"] (get response :schemas)))
        (is (integer? (get response :totalResults)))
        (is (= 1 (get response :startIndex)))
        (is (= 2 (get response :itemsPerPage)))
        (is (= 2 (count (get response :Resources))))))

    (testing "Fetch user by email"
      (let [response (scim-client :get 200 (format "ee/scim/v2/Users?filter=%s"
                                                   (codec/url-encode "userName eq \"rasta@metabase.com\"")))]
        (is (malli= scim-api/SCIMUserList response))
        (is (= 1 (get response :totalResults)))
        (is (= 1 (count (get response :Resources))))))

    (testing "Fetch non-existant user by email"
      (let [response (scim-client :get 200 (format "ee/scim/v2/Users?filter=%s"
                                                   (codec/url-encode "userName eq \"newuser@metabase.com\"")))]
        (is (malli= scim-api/SCIMUserList response))
        (is (= 0 (get response :totalResults)))
        (is (= 0 (count (get response :Resources))))))

    (testing "Error if unsupported filter operation is provided"
      (scim-client :get 400 (format "ee/scim/v2/Users?filter=%s"
                                    (codec/url-encode "id ne \"newuser@metabase.com\""))))))

(deftest create-user-test
  (with-scim-setup!
    (testing "Create a new user successfully"
      ;; Generate random user details via with-temp then delete the user so that we can recreate it with SCIM
      (mt/with-temp [:model/User user {}]
        (t2/delete! :model/User :id (:id user))
        (let [new-user {:schemas ["urn:ietf:params:scim:schemas:core:2.0:User"]
                        :userName (:email user)
                        :name {:givenName (:first_name user) :familyName (:last_name user)}
                        :emails [{:value (:email user)}]
                        :active true}
              response (scim-client :post 201 "ee/scim/v2/Users" new-user)]
          (is (malli= scim-api/SCIMUser response))
          (is (=? (select-keys user [:email :first_name :last_name :is_active])
                  (t2/select-one [:model/User :email :first_name :last_name :is_active]
                                 :entity_id (:id response)))))))

    (testing "Error when creating a user with an existing email"
      (let [existing-user {:schemas ["urn:ietf:params:scim:schemas:core:2.0:User"]
                           :userName "rasta@metabase.com"
                           :name {:givenName "Rasta" :familyName "Toucan"}
                           :emails [{:value "rasta@metabase.com"}]
                           :active true}
            response      (scim-client :post 409 "ee/scim/v2/Users" existing-user)]
        (is (= (get response :schemas) ["urn:ietf:params:scim:api:messages:2.0:Error"]))
        (is (= (get response :detail) "Email address is already in use"))))))

(deftest update-user-test
  (with-scim-setup!
    (mt/with-temp [:model/User user {:email "testuser@metabase.com"
                                     :first_name "Test"
                                     :last_name "User"
                                     :is_active true}]
      (let [entity-id (t2/select-one-fn :entity_id :model/User :id (:id user))]
        (testing "Update an existing user successfully"
          (let [update-user {:schemas ["urn:ietf:params:scim:schemas:core:2.0:User"]
                             :id entity-id
                             :userName "testuser@metabase.com"
                             :name {:givenName "UpdatedTest" :familyName "UpdatedUser"}
                             :emails [{:value "testuser@metabase.com"}]
                             :active true}
                response    (scim-client :put 200 (format "ee/scim/v2/Users/%s" entity-id) update-user)]
            (is (malli= scim-api/SCIMUser response))
            (is (= "UpdatedTest" (get-in response [:name :givenName])))
            (is (= "UpdatedUser" (get-in response [:name :familyName]))))

          (testing "Error when trying to update the email of an existing user"
            (let [update-user {:schemas ["urn:ietf:params:scim:schemas:core:2.0:User"]
                               :id entity-id
                               :userName "updatedtestuser@metabase.com"
                               :name {:givenName "Test" :familyName "User"}
                               :emails [{:value "updatedtestuser@metabase.com"}]
                               :active true}
                  response    (scim-client :put 400 (format "ee/scim/v2/Users/%s" entity-id) update-user)]
              (is (= ["urn:ietf:params:scim:api:messages:2.0:Error"] (get response :schemas)))
              (is (= "You may not update the email of an existing user." (get response :detail)))))

          (testing "Error when trying to update a non-existent user"
            (let [update-user {:schemas ["urn:ietf:params:scim:schemas:core:2.0:User"]
                               :id (str (random-uuid))
                               :userName "nonexistent@metabase.com"
                               :name {:givenName "Nonexistent" :familyName "User"}
                               :emails [{:value "nonexistent@metabase.com"}]
                               :active true}
                  response    (scim-client :put 404 (format "ee/scim/v2/Users/%s" (random-uuid)) update-user)]
              (is (= ["urn:ietf:params:scim:api:messages:2.0:Error"] (get response :schemas)))
              (is (= "User not found" (get response :detail))))))))))

(deftest patch-user-test
  (with-scim-setup!
    (mt/with-temp [:model/User user {:email "testuser@metabase.com"
                                     :first_name "Test"
                                     :last_name "User"
                                     :is_active true
                                     :locale "en-US"}]
      (let [entity-id (t2/select-one-fn :entity_id :model/User :id (:id user))]
        (testing "Deactivate an existing user"
          (let [patch-body {:schemas ["urn:ietf:params:scim:api:messages:2.0:PatchOp"]
                            :Operations [{:op "Replace"
                                          :path "active"
                                          :value false}]}
                response   (scim-client :patch 200 (format "ee/scim/v2/Users/%s" entity-id) patch-body)]
            (is (malli= scim-api/SCIMUser response))
            (is (= false (:active response)))))

        (testing "Update family name of an existing user"
          (let [patch-body {:schemas ["urn:ietf:params:scim:api:messages:2.0:PatchOp"]
                            :Operations [{:op "Replace"
                                          :path "name.familyName"
                                          :value "UpdatedUser"}]}
                response   (scim-client :patch 200 (format "ee/scim/v2/Users/%s" entity-id) patch-body)]
            (is (malli= scim-api/SCIMUser response))
            (is (= "UpdatedUser" (get-in response [:name :familyName])))))

        (testing "Update multiple attributes of an existing user"
          (let [patch-body {:schemas ["urn:ietf:params:scim:api:messages:2.0:PatchOp"]
                            :Operations [{:op "Replace"
                                          :path "name.givenName"
                                          :value "UpdatedTest"}
                                         {:op "Replace"
                                          :path "locale"
                                          :value "fr_FR"}]}
                response   (scim-client :patch 200 (format "ee/scim/v2/Users/%s" entity-id) patch-body)]
            (def response response)
            (is (malli= scim-api/SCIMUser response))
            (is (= "UpdatedTest" (get-in response [:name :givenName])))
            (is (= "fr_FR" (:locale response)))))

        (testing "Error when using unsupported operation"
          (let [patch-body {:schemas ["urn:ietf:params:scim:api:messages:2.0:PatchOp"]
                            :Operations [{:op "add"
                                          :path "name.familyName"
                                          :value "UnsupportedOperation"}]}
                response   (scim-client :patch 400 (format "ee/scim/v2/Users/%s" entity-id) patch-body)]
            (def response response)
            (is (= ["urn:ietf:params:scim:api:messages:2.0:Error"] (get response :schemas)))
            (is (= "Unsupported operation: add" (get response :detail)))))

        (testing "Error when trying to update a non-existent user"
          (let [patch-body {:schemas ["urn:ietf:params:scim:api:messages:2.0:PatchOp"]
                            :Operations [{:op "Replace"
                                          :path "name.familyName"
                                          :value "NonexistentUser"}]}
                response   (scim-client :patch 404 (format "ee/scim/v2/Users/%s" (random-uuid)) patch-body)]
            (is (= ["urn:ietf:params:scim:api:messages:2.0:Error"] (get response :schemas)))
            (is (= "User not found" (get response :detail)))))))))

(deftest list-groups-test
  (with-scim-setup!
    (mt/with-temp [:model/PermissionsGroup _group1 {:name "Group 1"}]
      (testing "Fetch groups with default pagination"
        (let [response (scim-client :get 200 "ee/scim/v2/Groups")]
          (is (malli= scim-api/SCIMGroupList response))))

      (testing "Fetch groups with custom pagination"
        (let [response (scim-client :get 200 (format "ee/scim/v2/Groups?startIndex=%d&count=%d" 1 2))]
          (is (= ["urn:ietf:params:scim:api:messages:2.0:ListResponse"] (get response :schemas)))
          (is (integer? (get response :totalResults)))
          (is (= 1 (get response :startIndex)))
          (is (= 2 (get response :itemsPerPage)))
          (is (= 2 (count (get response :Resources))))))

      (testing "Fetch group by name"
        (let [response (scim-client :get 200 (format "ee/scim/v2/Groups?filter=%s"
                                                     (codec/url-encode "displayName eq \"Group 1\"")))]
          (is (malli= scim-api/SCIMGroupList response))
          (is (= 1 (get response :totalResults)))
          (is (= 1 (count (get response :Resources))))))

      (testing "Fetch non-existant group by name"
        (let [response (scim-client :get 200 (format "ee/scim/v2/Groups?filter=%s"
                                                     (codec/url-encode "displayName eq \"Fake Group\"")))]
          (is (malli= scim-api/SCIMUserList response))
          (is (= 0 (get response :totalResults)))
          (is (= 0 (count (get response :Resources))))))

      (testing "Error if unsupported filter operation is provided"
        (scim-client :get 400 (format "ee/scim/v2/Users?filter=%s"
                                      (codec/url-encode "displayName ne \"Group 1\"")))))))

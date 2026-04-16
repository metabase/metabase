(ns metabase-enterprise.sandbox.api.user-test
  "Tests that would logically be included in [[metabase.users-rest.api-test]] but are separate as they are enterprise only."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.api.user]
   [metabase-enterprise.test :as met]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users-personal-collections))

;; Non-segmented users are allowed to ask for a list of all of the users in the Metabase instance. Pulse email lists
;; are an example usage of this. Segmented users should not have that ability. Instead they should only see
;; themselves. This test checks that GET /api/user/recipients for a segmented user only returns themselves, including
;; for Permissions Group Managers.
(deftest segmented-user-list-test
  (testing "GET /api/user/recipients"
    (testing "sanity check: normally returns more than just me"
      (is (seq (disj (->> (mt/user-http-request :rasta :get 200 "user/recipients")
                          :data
                          (map :email)
                          set)
                     "rasta@metabase.com"))))
    (testing "a sandboxed user will see only themselves"
      (met/with-gtaps! {:gtaps {:venues {}}}
        (is (= ["rasta@metabase.com"]
               (->> (mt/user-http-request :rasta :get 200 "user/recipients")
                    :data
                    (map :email))))
        (testing "... even if they are a group manager"
          (mt/with-premium-features #{:advanced-permissions :sandboxes}
            (let [membership (t2/select-one :model/PermissionsGroupMembership
                                            :group_id (u/the-id &group)
                                            :user_id (mt/user->id :rasta))]
              (t2/update! :model/PermissionsGroupMembership :id (:id membership)
                          {:is_group_manager true}))
            (let [result (mt/user-http-request :rasta :get 200 "user/recipients")]
              (is (= ["rasta@metabase.com"]
                     (map :email (:data result))))
              (is (= 1 (count (:data result))))
              (is (= 1 (:total result))))))))))

(deftest get-user-attributes-test
  (mt/with-premium-features #{}
    (testing "requires sandbox enabled"
      (mt/assert-has-premium-feature-error "Sandboxes" (mt/user-http-request :crowberto :get 402 "mt/user/attributes"))))

  (mt/with-premium-features #{:sandboxes}
    (testing "requires admin"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "mt/user/attributes"))))

    (testing "returns set of user attributes"
      (mt/with-temp
        [:model/User _ {:login_attributes {:foo "bar"}}
         :model/User _ {:login_attributes {:foo "baz"
                                           :miz "bar"}}]
        (is (set/subset? #{"foo" "miz"}
                         (set (mt/user-http-request :crowberto :get 200 "mt/user/attributes"))))))
    (testing "returns maximum number of login attributes"
      (with-redefs [metabase-enterprise.sandbox.api.user/max-login-attributes 2]
        (mt/with-temp
          [:model/User _ {:login_attributes {:foo "bar"
                                             :woo "hoo"}}
           :model/User _ {:login_attributes {:foo "biz"
                                             :woo "haa"}} ; codespell:ignore haa
           :model/User _ {:login_attributes {:third-one "nope"}}]
          (is (= 2
                 (count (mt/user-http-request :crowberto :get 200 "mt/user/attributes")))))))))

(deftest get-user-attributes-with-tenants-test
  (mt/with-premium-features #{:tenants :sandboxes}
    (mt/with-temporary-setting-values [use-tenants true]
      (testing "includes tenant attributes from tenant models"
        (mt/with-temp
          [:model/Tenant _ {:name "Test Tenant"
                            :slug "test-tenant"
                            :attributes {"tenant-key-1" "value1"
                                         "tenant-key-2" "value2"}}
           :model/Tenant _ {:name "Another Tenant"
                            :slug "another-tenant"
                            :attributes {"tenant-key-3" "value3"
                                         "tenant-key-1" "different-value"}}
           :model/User _ {:login_attributes {:user-key "user-value"}}]

          (let [attributes (set (mt/user-http-request :crowberto :get 200 "mt/user/attributes"))]
            (is (set/subset? #{"tenant-key-1" "tenant-key-2" "tenant-key-3" "user-key"}
                             attributes))))))))

(deftest update-user-attributes-test
  (mt/with-premium-features #{}
    (testing "requires sandbox enabled"
      (mt/assert-has-premium-feature-error "Sandboxes" (mt/user-http-request :crowberto :put 402 (format "mt/user/%d/attributes" (mt/user->id :crowberto)) {}))))

  (mt/with-premium-features #{:sandboxes}
    (testing "requires admin"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (format "mt/user/%d/attributes" (mt/user->id :rasta)) {}))))

    (testing "404 if user does not exist"
      (is (= "Not found."
             (mt/user-http-request :crowberto :put 404 (format "mt/user/%d/attributes" Integer/MAX_VALUE) {}))))

    (testing "Admin can update user attributes"
      (mt/with-temp
        [:model/User {id :id} {}]
        (mt/user-http-request :crowberto :put 200 (format "mt/user/%d/attributes" id) {:login_attributes {"foo" "bar"}})
        (is (= {"foo" "bar"}
               (t2/select-one-fn :login_attributes :model/User :id id)))))))

(deftest attributes-endpoint-includes-jwt-attributes-test
  (testing "GET /api/mt/user/attributes includes keys from jwt_attributes"
    (mt/with-premium-features #{:sandboxes}
      (mt/with-temp [:model/User _ {:login_attributes {"department" "engineering"
                                                       "role" "developer"}}
                     :model/User _ {:jwt_attributes {"session_id" "abc123"
                                                     "scope" "read-write"}}
                     :model/User _ {:login_attributes {"team" "backend"}
                                    :jwt_attributes {"auth_level" "admin"
                                                     "region" "us-east"}}]
        (let [response (mt/user-http-request :crowberto :get 200 "mt/user/attributes")]
          (testing "includes keys from login_attributes"
            (is (contains? (set response) "department"))
            (is (contains? (set response) "role"))
            (is (contains? (set response) "team")))

          (testing "includes keys from jwt_attributes"
            (is (contains? (set response) "session_id"))
            (is (contains? (set response) "scope"))
            (is (contains? (set response) "auth_level"))
            (is (contains? (set response) "region")))

          (testing "does not include duplicate keys"
            (let [response-counts (frequencies response)]
              (is (every? #(= 1 %) (vals response-counts))))))))))

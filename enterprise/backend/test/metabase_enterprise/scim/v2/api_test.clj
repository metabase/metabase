(ns metabase-enterprise.scim.v2.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.scim.api :as scim]
   [metabase-enterprise.scim.v2.api :as scim-api]
   [metabase.http-client :as client]
   [metabase.test :as mt]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(def ^:private scim-api-key
  (-> (#'scim/refresh-scim-api-key! (mt/user->id :crowberto)) :unmasked_key))

(defn- scim-client
  "Wrapper for `metabase.http-client/client` which includes the SCIM key in the Authorization header"
  [method expected-status-code endpoint]
  (client/client method
                 expected-status-code
                 endpoint
                 {:request-options
                  {:headers {"authorization" (format "Bearer %s" scim-api-key)}}}))

(deftest scim-authentication-test
  (mt/with-premium-features #{:scim}
    (testing "SCIM endpoints require a valid SCIM API key passed in the authorization header"
      (scim-client :get 200 "ee/scim/v2/Users"))

    (testing "The SCIM API key cannot be used for non-SCIM endpoints"
      (scim-client :get 401 "user"))

    (testing "SCIM endpoints do not allow normal auth"
      (mt/user-http-request :crowberto :get 401 "ee/scim/v2/Users"))

    (testing "A SCIM API key cannot be passed via the x-api-key header"
      (client/client :get 401 "ee/scim/v2/Users" {:request-options {:headers {"x-api-key" scim-api-key}}}))))

(deftest fetch-user-test
  (mt/with-premium-features #{:scim}
    (testing "A single user can be fetched in the SCIM format"
      (is (= {:schemas  ["urn:ietf:params:scim:schemas:core:2.0:User"]
              :id       (t2/select-one-fn :entity_id :model/User :id (mt/user->id :rasta))
              :userName "rasta@metabase.com"
              :name     {:givenName "Rasta" :familyName "Toucan"}
              :emails   [{:value "rasta@metabase.com"}]
              :active   true}
             (scim-client :get 200 (format "ee/scim/v2/Users/%d" (mt/user->id :rasta))))))))

(deftest list-users-test
  (mt/with-premium-features #{:scim}
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
        (is (= 1 (count (get response :Resources))))))

    (testing "Fetch non-existant user by email"
      (let [response (scim-client :get 200 (format "ee/scim/v2/Users?filter=%s"
                                                   (codec/url-encode "userName eq \"newuser@metabase.com\"")))]
        (is (malli= scim-api/SCIMUserList response))
        (is (= 0 (count (get response :Resources))))))

    (testing "Error if unsupported filter operation is provided"
      (scim-client :get 400 (format "ee/scim/v2/Users?filter=%s"
                                    (codec/url-encode "id ne \"newuser@metabase.com\""))))))

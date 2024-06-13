(ns metabase-enterprise.scim.v2.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.scim.api :as scim]
   [metabase.http-client :as client]
   [metabase.test :as mt]
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

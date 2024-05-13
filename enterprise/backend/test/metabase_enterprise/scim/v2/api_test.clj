(ns metabase-enterprise.scim.v2.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.scim.api :as scim]
   [metabase.http-client :as client]
   [metabase.test :as mt]))

(deftest scim-authentication-test
  (mt/with-premium-features #{:scim}
    (let [scim-api-key (-> (#'scim/refresh-scim-api-key! (mt/user->id :crowberto)) :unmasked_key)]
      (testing "SCIM endpoints require a valid SCIM API key passed in the authorization header"
        (client/client :get 200 "ee/scim/v2/Users"
                       {:request-options
                        {:headers {"authorization" (format "Bearer %s" scim-api-key)}}}))

      (testing "The SCIM API key cannot be used for non-SCIM endpoints"
        (client/client :get 401 "user"
                       {:request-options
                        {:headers {"authorization" (format "Bearer %s" scim-api-key)}}}))

      (testing "SCIM endpoints do not allow normal auth"
        (mt/user-http-request :crowberto :get 401 "ee/scim/v2/Users"))

      (testing "A SCIM API key cannot be passed via the x-api-key header"
        (client/client :get 401 "ee/scim/v2/Users" {:request-options {:headers {"x-api-key" scim-api-key}}})))))

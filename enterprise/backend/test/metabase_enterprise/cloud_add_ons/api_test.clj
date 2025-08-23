(ns metabase-enterprise.cloud-add-ons.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]))

(deftest post-product-type-test
  (testing "POST /api/ee/cloud-add-ons/metabase-ai"
    (testing "requires superuser"
      (mt/with-premium-features #{}
        (is (=? "You don't have permissions to do that."
                (mt/user-http-request :rasta :post 403 "ee/cloud-add-ons/metabase-ai"
                                      {:terms_of_service true})))))
    (testing "requires accepting terms of service"
      (mt/with-premium-features #{}
        (is (=? {:errors {:terms_of_service "Need to accept terms of service."}}
                (mt/user-http-request :crowberto :post 400 "ee/cloud-add-ons/metabase-ai"
                                      {:terms_of_service false})))))
    (testing "requires token feature 'hosting'"
      (mt/with-premium-features #{}
        (is (=? "Can only purchase add-ons for Metabase Cloud instances."
                (mt/user-http-request :crowberto :post 400 "ee/cloud-add-ons/metabase-ai"
                                      {:terms_of_service true})))))
    (testing "requires token feature 'offer-metabase-ai'"
      (mt/with-premium-features #{:hosting}
        (is (=? "Can only purchase add-ons for eligible subscriptions."
                (mt/user-http-request :crowberto :post 400 "ee/cloud-add-ons/metabase-ai"
                                      {:terms_of_service true})))))
    (testing "requires current user being a store user"
      (mt/with-premium-features #{:hosting :offer-metabase-ai}
        (is (=? "Only Metabase Store users can purchase add-ons."
                (mt/user-http-request :crowberto :post 403 "ee/cloud-add-ons/metabase-ai"
                                      {:terms_of_service true})))))
    (testing "when all conditions are met"
      (mt/with-temp [:model/User user {:is_superuser true}]
        (mt/with-premium-features #{:hosting :offer-metabase-ai}
          ;; FIXME: With `(mt/with-temporary-setting-values [token-status {:store-users [{:email (:email user)}]}])`,
          ;;  `(premium-features/token-status)` still returns `nil`; thus resort to `with-redefs`:
          (with-redefs [premium-features/token-status (constantly {:store-users [{:email (:email user)}]})]
            (testing "passes through HTTP status 404 from Store API"
              (with-redefs [hm.client/call (fn [& _] (throw (ex-info "TEST" {:status 404})))]
                (is (=? "Could not establish a connection to Metabase Cloud."
                        (mt/user-http-request user :post 404 "ee/cloud-add-ons/metabase-ai"
                                              {:terms_of_service true})))))
            (testing "passes through HTTP status 403 from Store API"
              (with-redefs [hm.client/call (fn [& _] (throw (ex-info "TEST" {:status 403})))]
                (is (=? "Could not establish a connection to Metabase Cloud."
                        (mt/user-http-request user :post 403 "ee/cloud-add-ons/metabase-ai"
                                              {:terms_of_service true})))))
            (testing "passes through HTTP status 401 from Store API"
              (with-redefs [hm.client/call (fn [& _] (throw (ex-info "TEST" {:status 401})))]
                (is (=? "Could not establish a connection to Metabase Cloud."
                        (mt/user-http-request user :post 401 "ee/cloud-add-ons/metabase-ai"
                                              {:terms_of_service true})))))
            (testing "passes through HTTP status 400 from Store API"
              (with-redefs [hm.client/call (fn [& _] (throw (ex-info "TEST" {:status 400})))]
                (is (=? "Could not purchase this add-on."
                        (mt/user-http-request user :post 400 "ee/cloud-add-ons/metabase-ai"
                                              {:terms_of_service true})))))
            (testing "responds with HTTP status 500 for other errors from Store API"
              (with-redefs [hm.client/call (fn [& _] (throw (ex-info "TEST" {})))]
                (is (=? "Unexpected error"
                        (mt/user-http-request user :post 500 "ee/cloud-add-ons/metabase-ai"
                                              {:terms_of_service true})))))
            (testing "succeeds"
              (let [{store-api-proxy :proxy store-api-calls :calls} (semantic.tu/spy (constantly nil))
                    {clear-token-cache-proxy :proxy clear-token-cache-calls :calls} (semantic.tu/spy premium-features/clear-cache)]
                (with-redefs [hm.client/call               store-api-proxy
                              premium-features/clear-cache clear-token-cache-proxy]
                  (is (=? {}
                          (mt/user-http-request user :post 200 "ee/cloud-add-ons/metabase-ai"
                                                {:terms_of_service true})))
                  (is (not-empty @store-api-calls)
                      "Store API was called")
                  (is (not-empty @clear-token-cache-calls)
                      "Token cache was cleared"))))))))))

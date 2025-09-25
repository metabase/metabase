(ns metabase-enterprise.cloud-add-ons.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.cloud-add-ons.api :as cloud-add-ons.api]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]))

(deftest ^:sequential post-product-type-test
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
        (mt/with-premium-features #{:hosting :offer-metabase-ai :audit-app}
          ;; FIXME: With `(mt/with-temporary-setting-values [token-status {:store-users [{:email (:email user)}]}])`,
          ;;  `(premium-features/token-status)` still returns `nil`; thus resort to `with-redefs`:
          (with-redefs [premium-features/token-status (constantly {:store-users [{:email (:email user)}]})]
            (doseq [[status-code error-message] {404 "Could not establish a connection to Metabase Cloud."
                                                 403 "Could not establish a connection to Metabase Cloud."
                                                 401 "Could not establish a connection to Metabase Cloud."
                                                 400 "Could not purchase this add-on."}]
              (testing (format "passes through HTTP status %d from Store API" status-code)
                (with-redefs [hm.client/call (fn [& _] (throw (ex-info "TEST" {:status status-code})))]
                  (is (=? error-message
                          (mt/user-http-request user :post status-code "ee/cloud-add-ons/metabase-ai"
                                                {:terms_of_service true}))))))
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
                      "Token cache was cleared")
                  (testing "audit log entry generated"
                    (let [{:keys [details user_id]} (mt/latest-audit-log-entry "cloud-add-on-purchase")]
                      (is (= (:id user) user_id))
                      (is (= {:add-on {:product-type "metabase-ai"}} details)))))))))))))

(deftest version-supports-semantic-search?-test
  (testing "version-supports-semantic-search?"
    (testing "returns true for version 56.5"
      (with-redefs [config/current-major-version (constantly 56)
                    config/current-minor-version (constantly 5)]
        (is (#'cloud-add-ons.api/version-supports-semantic-search?))))

    (testing "returns true for version 56.6"
      (with-redefs [config/current-major-version (constantly 56)
                    config/current-minor-version (constantly 6)]
        (is (#'cloud-add-ons.api/version-supports-semantic-search?))))

    (testing "returns true for version 57.0"
      (with-redefs [config/current-major-version (constantly 57)
                    config/current-minor-version (constantly 0)]
        (is (#'cloud-add-ons.api/version-supports-semantic-search?))))

    (testing "returns false for version 56.4"
      (with-redefs [config/current-major-version (constantly 56)
                    config/current-minor-version (constantly 4)]
        (is (not (#'cloud-add-ons.api/version-supports-semantic-search?)))))

    (testing "returns false for version 55.9"
      (with-redefs [config/current-major-version (constantly 55)
                    config/current-minor-version (constantly 9)]
        (is (not (#'cloud-add-ons.api/version-supports-semantic-search?)))))

    (testing "returns false when major version is nil"
      (with-redefs [config/current-major-version (constantly nil)
                    config/current-minor-version (constantly 5)]
        (is (not (#'cloud-add-ons.api/version-supports-semantic-search?)))))

    (testing "returns false when minor version is nil"
      (with-redefs [config/current-major-version (constantly 56)
                    config/current-minor-version (constantly nil)]
        (is (not (#'cloud-add-ons.api/version-supports-semantic-search?)))))))

(deftest build-addons-for-product-test
  (testing "build-addons-for-product"
    (testing "returns only base addon for non-metabase-ai product"
      (is (= [{:product-type "other-product"}]
             (#'cloud-add-ons.api/build-addons-for-product "other-product"))))

    (testing "returns only base addon for metabase-ai when version doesn't support semantic search"
      (with-redefs [cloud-add-ons.api/version-supports-semantic-search? (constantly false)]
        (is (= [{:product-type "metabase-ai"}]
               (#'cloud-add-ons.api/build-addons-for-product "metabase-ai")))))

    (testing "returns base addon and semantic-search addon for metabase-ai when version supports semantic search"
      (with-redefs [cloud-add-ons.api/version-supports-semantic-search? (constantly true)]
        (is (= [{:product-type "metabase-ai"} {:product-type "semantic-search"}]
               (#'cloud-add-ons.api/build-addons-for-product "metabase-ai")))))))

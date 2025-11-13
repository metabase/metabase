(ns metabase-enterprise.cloud-add-ons.api-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase-enterprise.harbormaster.client :as hm.client]
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
      (mt/with-premium-features #{:hosting}
        (is (=? {:errors {:terms_of_service "Need to accept terms of service."}}
                (mt/user-http-request :crowberto :post 400 "ee/cloud-add-ons/metabase-ai"
                                      {:terms_of_service false})))))
    (testing "requires token feature 'hosting'"
      (mt/with-premium-features #{}
        (is (=? "Can only access Store API for Metabase Cloud instances."
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
              (let [store-api-calls         (atom [])
                    clear-token-cache-calls (atom [])]
                (with-redefs [hm.client/call               (fn [& args]
                                                             (swap! store-api-calls conj args)
                                                             nil)
                              premium-features/clear-cache! (fn [& args]
                                                              (swap! clear-token-cache-calls conj args)
                                                              nil)]
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

(deftest ^:sequential get-plans-test
  (testing "GET /api/ee/cloud-add-ons/plans"
    (testing "requires superuser"
      (mt/with-premium-features #{}
        (is (=? "You don't have permissions to do that."
                (mt/user-http-request :rasta :get 403 "ee/cloud-add-ons/plans")))))
    (testing "requires token feature 'hosting'"
      (mt/with-premium-features #{}
        (is (=? "Can only access Store API for Metabase Cloud instances."
                (mt/user-http-request :crowberto :get 400 "ee/cloud-add-ons/plans")))))
    (testing "when conditions are met"
      (mt/with-premium-features #{:hosting}
        (testing "passes through HTTP status from Store API"
          (doseq [[status-code error-message] {404 "Could not establish a connection to Metabase Cloud."
                                               403 "Could not establish a connection to Metabase Cloud."
                                               401 "Could not establish a connection to Metabase Cloud."}]
            (testing (format "error status %d" status-code)
              (with-redefs [http/get (fn [& _] (throw (ex-info "TEST" {:status status-code})))]
                (is (=? error-message
                        (mt/user-http-request :crowberto :get status-code "ee/cloud-add-ons/plans")))))))
        (testing "responds with HTTP status 500 for other errors"
          (with-redefs [http/get (fn [& _] (throw (ex-info "TEST" {:status 500})))]
            (is (=? "Unexpected error"
                    (mt/user-http-request :crowberto :get 500 "ee/cloud-add-ons/plans")))))
        (testing "succeeds"
          (let [plan-data {:body {:plan-name "Pro" :tier "premium"}}]
            (with-redefs [http/get (fn [& _] plan-data)]
              (is (=? (:body plan-data)
                      (mt/user-http-request :crowberto :get 200 "ee/cloud-add-ons/plans"))))))))))

(deftest ^:sequential get-addons-test
  (testing "GET /api/ee/cloud-add-ons/addons"
    (testing "requires superuser"
      (mt/with-premium-features #{}
        (is (=? "You don't have permissions to do that."
                (mt/user-http-request :rasta :get 403 "ee/cloud-add-ons/addons")))))
    (testing "requires token feature 'hosting'"
      (mt/with-premium-features #{}
        (is (=? "Can only access Store API for Metabase Cloud instances."
                (mt/user-http-request :crowberto :get 400 "ee/cloud-add-ons/addons")))))
    (testing "when conditions are met"
      (mt/with-premium-features #{:hosting}
        (testing "passes through HTTP status from Store API"
          (doseq [[status-code error-message] {404 "Could not establish a connection to Metabase Cloud."
                                               403 "Could not establish a connection to Metabase Cloud."
                                               401 "Could not establish a connection to Metabase Cloud."}]
            (testing (format "error status %d" status-code)
              (with-redefs [http/get (fn [& _] (throw (ex-info "TEST" {:status status-code})))]
                (is (=? error-message
                        (mt/user-http-request :crowberto :get status-code "ee/cloud-add-ons/addons")))))))
        (testing "responds with HTTP status 500 for other errors"
          (with-redefs [http/get (fn [& _] (throw (ex-info "TEST" {:status 500})))]
            (is (=? "Unexpected error"
                    (mt/user-http-request :crowberto :get 500 "ee/cloud-add-ons/addons")))))
        (testing "succeeds"
          (let [addons-data {:body [{:addon-id "metabase-ai" :status "active"}]}]
            (with-redefs [http/get (fn [& _] addons-data)]
              (is (=? (:body addons-data)
                      (mt/user-http-request :crowberto :get 200 "ee/cloud-add-ons/addons"))))))))))

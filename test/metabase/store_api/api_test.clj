(ns metabase.store-api.api-test
  "Tests for /api/store-api endpoints."
  (:require
   [clj-http.fake :as fake]
   [clojure.test :refer :all]
   [metabase.store-api.core :as store-api]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private mock-plans-response
  [{:id                    1
    :name                  "Open Source"
    :description           "The open source plan"
    :alias                 "open-source"
    :product               "metabase-os"
    :can_purchase          false
    :billing_period_months 1
    :trial_days            14
    :users_included        1
    :per_user_price        "$0"
    :price                 "$0"
    :hosting_features      []
    :token_features        []}
   {:id                    2
    :name                  "Pro"
    :description           "The pro plan"
    :alias                 "pro"
    :product               "metabase-pro"
    :can_purchase          true
    :billing_period_months 12
    :trial_days            14
    :users_included        1
    :per_user_price        "$99"
    :price                 "$99"
    :hosting_features      ["feature1"]
    :token_features        ["token_feature1"]}])

(def ^:private mock-addons-response
  [{:id                            1
    :name                          "Add-on 1"
    :short_name                    "addon-1"
    :description                   "Description of add-on 1"
    :alias                         "addon-1"
    :product_type                  "addon"
    :deployment                    "on-prem"
    :billing_period_months         1
    :active                        true
    :self_service                  true
    :hosting_features              []
    :token_features                []
    :trialup_to_product_id         nil
    :invoiceable_counterpart       nil
    :trial_days                    nil
    :is_metered                    false
    :default_total_units           100.0
    :default_included_units        0.0
    :default_prepaid_units         0.0
    :default_price_per_unit        10.0
    :default_base_fee              0.0}
   {:id                            2
    :name                          "Add-on 2"
    :short_name                    "addon-2"
    :description                   "Description of add-on 2"
    :alias                         "addon-2"
    :product_type                  "addon"
    :deployment                    "cloud"
    :billing_period_months         12
    :active                        true
    :self_service                  false
    :hosting_features              ["feature1"]
    :token_features                ["token_feature1"]
    :trialup_to_product_id         "some-product"
    :invoiceable_counterpart       "counterpart"
    :trial_days                    30
    :is_metered                    true
    :default_total_units           500.0
    :default_included_units        100.0
    :default_prepaid_units         200.0
    :default_price_per_unit        5.0
    :default_base_fee              50.0}])

(defn- make-fake-routes
  "Create fake routes for the store API."
  [store-api-url]
  {(str store-api-url "/api/v2/plan")   (constantly {:status  200
                                                     :headers {"content-type" "application/json"}
                                                     :body    (json/encode mock-plans-response)})
   (str store-api-url "/api/v2/addons") (constantly {:status  200
                                                     :headers {"content-type" "application/json"}
                                                     :body    (json/encode mock-addons-response)})})

(defmacro with-store-api-mocks [& body]
  `(let [store-url# (store-api/store-api-url)
         routes#    (make-fake-routes store-url#)]
     (fake/with-fake-routes routes#
       ~@body)))

(deftest ^:parallel plans-endpoint-test
  (with-store-api-mocks
    (testing "GET /api/store-api/plans"
      (testing "should return a list of plans"
        (let [response (mt/user-http-request :rasta :get 200 "store-api/plans")]
          (is (sequential? response))
          (is (= 2 (count response)))
          (is (= "Open Source" (-> response first :name)))
          (is (= "Pro" (-> response second :name))))))
    (testing "accessible without authentication"
      (let [response (mt/client :get 200 "store-api/plans")]
        (is (sequential? response))
        (is (pos? (count response)))))))

(deftest ^:parallel addons-endpoint-test
  (testing "GET /api/store-api/addons"
    (with-store-api-mocks
      (testing "should return a list of add-ons"
        (let [response (mt/user-http-request :rasta :get 200 "store-api/addons")]
          (is (sequential? response))
          (is (= 2 (count response)))
          (is (= "Add-on 1" (-> response first :name)))
          (is (= "Add-on 2" (-> response second :name)))))))
  (testing "accessible without authentication"
    (with-store-api-mocks
      (let [response (mt/client :get 200 "store-api/addons")]
        (is (sequential? response))
        (is (pos? (count response)))))))

(deftest ^:parallel error-if-store-api-url-is-not-configured
  (testing "GET /api/store-api/ without store-api-url configured will throw an error with nice message"
    (mt/with-dynamic-fn-redefs [store-api/store-api-url (constantly nil)]
      (is (= "Please configure store-api-url"
             (mt/user-http-request :rasta :get 400 "store-api/plans")))

      (is (= "Please configure store-api-url"
             (mt/user-http-request :rasta :get 400 "store-api/addons"))))))

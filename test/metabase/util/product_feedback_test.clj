(ns metabase.util.product-feedback-test
  "Tests for product_feedback.clj"
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clj-http.fake :as http-fake]
   [clojure.test :refer :all]
   [metabase.util.product-feedback :as product-feedback :refer [product-feeback-url]]))

(deftest send-product-feedback-test
  (with-redefs [product-feeback-url "http://test.example.org/api/v1/crm/product-feedback"]
    (testing "Should return an error if the request fails"
      (binding [http/request (fn [& _]
                               (throw (Exception. "network issues")))]
        (is (= {:status            "failed"
                :error_code        "connection-error",
                :error_details     "network issues",
                :feedback_endpoint "http://test.example.org/api/v1/crm/product-feedback"}
               (#'product-feedback/send-product-feedback "some feedback" "some-source" "some-email@example.org")))))
    (testing "Should forward the data to the cloud endpoint"
      (http-fake/with-fake-routes
        {"http://test.example.org/api/v1/crm/product-feedback"
         (fn [request]
           (let [body (json/parse-string (slurp (:body request)) true)]
             ;; hacky way to make sure the correct content is being sent to the endpoint
             (if (= body {:comments "some feedback"
                          :source   "some-source"
                          :email    "some-email@example.org"})
               {:status  200
                :headers {}
                :body    "Success"}
               (throw (Exception. "Not proxying the data correctly")))))}
         (is (= {:status "success"}
               (#'product-feedback/send-product-feedback "some feedback" "some-source" "some-email@example.org")))))))

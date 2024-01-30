(ns metabase-enterprise.store.billing-test
  (:require [clj-http.client :as http]
            [clojure.test :refer :all]
            [metabase.test :as mt]))

(deftest fetch-billing-status-test
  (testing "Errors out when the server throws an error"
    (binding [http/request (fn [& _]
                             {:valid false
                              :status "network issues"})]
      (is (= "network issues"
             (mt/user-http-request :rasta :get 400 "/ee/billing"))))))

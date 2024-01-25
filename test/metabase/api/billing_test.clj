(ns metabase.api.billing-test
  (:require [clj-http.client :as http]
            [clojure.test :refer :all]
            [metabase.test :as mt]))


(deftest fetch-billing-status-test
  (testing "Errors out when the server throws an error"
    (binding [http/request (fn [& _]
                             (throw (Exception. "network issues")))]
      (is (= "Unable to fetch billing status: network issues"
             (mt/user-http-request :rasta :get 400 "/billing"))))))

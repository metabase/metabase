(ns metabase-enterprise.billing.billing-test
  (:require [clj-http.client :as http]
            [clojure.test :refer :all]
            [metabase.test :as mt]))

(deftest fetch-billing-status-test
  (testing "Passes through billing status fetched from server"
    (binding [http/request (fn [& _]
                             {:status 200
                              :body   "{\"version\":\"v1\",\"content\":null}"})]
      (is (= {:version "v1"
              :content nil}
             (mt/user-http-request :rasta :get 200 "/ee/billing"))))))

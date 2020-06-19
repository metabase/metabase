(ns metabase.middleware.misc-test
  (:require [clojure.test :refer :all]
            [medley.core :as m]
            [metabase
             [public-settings :as public-settings]
             [test :as mt]]
            [metabase.middleware.misc :as mw.misc]
            [ring.mock.request :as ring.mock]))

(deftest maybe-set-site-url-test
  (testing "Make sure `maybe-set-site-url` middleware looks at the correct headers in the correct order (#12528)"
    (let [handler            (fn [request respond _]
                               (respond request))
          maybe-set-site-url (fn [request]
                               ((mw.misc/maybe-set-site-url handler) request identity (fn [e] (throw e))))]
      (doseq [origin-header           ["https://mb1.example.com" nil]
              x-forwarded-host-header ["https://mb2.example.com" nil]
              host-header             ["https://mb3.example.com" nil]
              :let                    [request (cond-> (m/dissoc-in (ring.mock/request :get "/") [:headers "host"])
                                                 origin-header           (ring.mock/header "Origin" origin-header)
                                                 x-forwarded-host-header (ring.mock/header "X-Forwarded-Host" x-forwarded-host-header)
                                                 host-header             (ring.mock/header "Host" host-header))]]
        (testing (format "headers = %s" (pr-str (:headers request)))
          (mt/with-temporary-setting-values [site-url nil]
            (maybe-set-site-url request)
            (is (= (or origin-header x-forwarded-host-header host-header)
                   (public-settings/site-url)))))))))

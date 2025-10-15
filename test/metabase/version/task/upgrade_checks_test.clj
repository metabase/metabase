(ns metabase.version.task.upgrade-checks-test
  (:require
   [clj-http.fake :as http-fake]
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.version.settings :as version.settings]
   [metabase.version.task.upgrade-checks :as upgrade-checks]))

(deftest query-params-test
  (testing "The expected query params are provided"
    (with-redefs [config/is-prod? true]
      (http-fake/with-fake-routes-in-isolation
        {{:address #"https://static.metabase.com/version-info(-ee)?.json.*"
          :query-params {;; 2 query parameters are sent in prod:
                         ;; - A unique and stable instance UUID, and
                         ;; - The current version
                         :instance (version.settings/site-uuid-for-version-info-fetching)
                         :current-version (:tag config/mb-version-info)}}
         (constantly {:status 200 :body "{}"})}
        (is (= {} (@#'upgrade-checks/get-version-info))))))

  (testing "Empty values are omitted from the query params"
    (with-redefs [config/is-prod? true
                  version.settings/site-uuid-for-version-info-fetching (constantly "")
                  config/mb-version-info (constantly {:tag ""})]
      (http-fake/with-fake-routes-in-isolation
        {{:address #"https://static.metabase.com/version-info(-ee)?.json.*"
          :query-params {}}
         (constantly {:status 200 :body "{}"})}
        (is (= {} (@#'upgrade-checks/get-version-info))))))

  (testing "No query parameters are sent outside of prod"
    (with-redefs [config/is-prod? false]
      (http-fake/with-fake-routes-in-isolation
        {{:address #"https://static.metabase.com/version-info(-ee)?.json.*"
          :query-params {}}
         (constantly {:status 200 :body "{}"})}
        (is (= {} (@#'upgrade-checks/get-version-info)))))))

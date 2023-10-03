(ns ^:mb/once metabase.task.upgrade-checks-test
  (:require
   [clj-http.fake :as http-fake]
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.public-settings :as public-settings]
   [metabase.task.upgrade-checks :as upgrade-checks]))

(deftest site-uuid-test
  (testing "A unique and stable instance UUID is included in version info requests in prod"
    (with-redefs [config/is-prod? true]
      (http-fake/with-fake-routes-in-isolation
        {{:address #"https://static.metabase.com/version-info(-ee)?.json.*"
          :query-params {:instance (public-settings/site-uuid-for-version-info-fetching)}}
         (constantly {:status 200 :body "{}"})}
        (is (= {} (@#'upgrade-checks/get-version-info))))))

  (testing "Instance UUID is not included when not running in prod"
    (with-redefs [config/is-prod? false]
      (http-fake/with-fake-routes-in-isolation
        {{:address #"https://static.metabase.com/version-info(-ee)?.json.*"
          :query-params {}}
         (constantly {:status 200 :body "{}"})}
        (is (= {} (@#'upgrade-checks/get-version-info)))))))

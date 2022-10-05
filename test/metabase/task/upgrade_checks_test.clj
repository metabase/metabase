(ns metabase.task.upgrade-checks-test
  (:require [clj-http.fake :as http-fake]
            [clojure.test :refer :all]
            [metabase.public-settings :as public-settings]
            [metabase.task.upgrade-checks :as upgrade-checks]))

(deftest site-uuid-test
  (testing "A unique and stable site UUID is included in version info requests"
    (http-fake/with-fake-routes-in-isolation
      {{:address #"http://static.metabase.com/version-info(-ee)?.json"
        :query-params {:instance (public-settings/site-uuid-for-version-info-fetching)}}
       (constantly {:status 200 :body ""})}
      (@#'upgrade-checks/get-version-info))))

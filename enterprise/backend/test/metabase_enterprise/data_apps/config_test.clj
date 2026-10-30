(ns metabase-enterprise.data-apps.config-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.config :as data-app.config]))

(set! *warn-on-reflection* true)

(deftest outdated-test
  (testing "an app below the supported version is outdated; one at it is not"
    (with-redefs [data-app.config/supported-app-version 2]
      (is (data-app.config/outdated? {:version 1}))
      (is (not (data-app.config/outdated? {:version 2}))))))

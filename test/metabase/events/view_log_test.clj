(ns metabase.events.view-log-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.view-log :as view-log]
   [metabase.models.setting :as setting]))

(deftest user-dismissed-toasts-setting-test
  (testing "user-dismissed-toasts! updates user-dismissed-toasts"
    (binding [setting/*user-local-values* (delay (atom {}))]
      (view-log/dismissed-custom-dashboard-toast! false)
      (is (false? (view-log/dismissed-custom-dashboard-toast)))
      (view-log/dismissed-custom-dashboard-toast! true)
      (is (true? (view-log/dismissed-custom-dashboard-toast)))
      (view-log/dismissed-custom-dashboard-toast! false)
      (is (false? (view-log/dismissed-custom-dashboard-toast))))))

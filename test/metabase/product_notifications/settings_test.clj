(ns metabase.product-notifications.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.premium-features.core :as premium-features]
   [metabase.product-notifications.settings :as pn.settings]))

(def ^:private feed
  {:notifications
   [{:id "admin-only" :schemaVersion 1
     :title "A" :content "a" :conditions {:admin true}}
    {:id "everyone" :schemaVersion 1
     :title "B" :content "b" :conditions {:admin false}}
    {:id "cloud-only" :schemaVersion 1
     :title "C" :content "c" :conditions {:admin false :cloud true}}]})

(deftest notifications-getter-filters-for-current-user-test
  (with-redefs [pn.settings/product-notifications-info    (constantly feed)
                pn.settings/dismissed-notification-ids    (constantly [])
                premium-features/is-hosted?               (constantly false)]
    (testing "a non-admin on a self-hosted instance sees only the open, non-cloud notification"
      (binding [api/*is-superuser?* false]
        (is (= [{:id "everyone" :title "B" :content "b"}]
               (pn.settings/notifications)))))
    (testing "an admin still does not see the cloud-only one on a self-hosted instance"
      (binding [api/*is-superuser?* true]
        (is (= #{"admin-only" "everyone"}
               (set (map :id (pn.settings/notifications))))))))
  (testing "dismissed ids are removed and cloud notifications show on hosted instances"
    (with-redefs [pn.settings/product-notifications-info (constantly feed)
                  pn.settings/dismissed-notification-ids (constantly ["everyone"])
                  premium-features/is-hosted?            (constantly true)]
      (binding [api/*is-superuser?* true]
        (is (= #{"admin-only" "cloud-only"}
               (set (map :id (pn.settings/notifications)))))))))

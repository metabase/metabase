(ns metabase.product-notifications.task-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.premium-features.core :as premium-features]
   [metabase.product-notifications.settings :as settings]
   [metabase.product-notifications.sync :as sync]
   [metabase.product-notifications.task :as task]
   [metabase.test :as mt]
   [metabase.version.settings :as version.settings]))

(set! *warn-on-reflection* true)

(deftest sync-gating-test
  (mt/with-dynamic-fn-redefs [premium-features/airgap-enabled (constantly false)]
    (mt/with-temporary-setting-values [version.settings/check-for-updates true]
      (is (true? (task/sync-enabled?))))
    (mt/with-temporary-setting-values [version.settings/check-for-updates false]
      (is (false? (task/sync-enabled?)))))
  (mt/with-dynamic-fn-redefs [premium-features/airgap-enabled (constantly true)]
    (mt/with-temporary-setting-values [version.settings/check-for-updates true]
      (is (false? (task/sync-enabled?))))))

(deftest run-sync-test
  (let [calls (atom 0)]
    (mt/with-dynamic-fn-redefs [premium-features/airgap-enabled (constantly false)
                                sync/sync-from-source!          #(swap! calls inc)]
      (mt/with-temporary-setting-values [version.settings/check-for-updates true]
        (task/run-sync!)
        (is (= 1 @calls)))
      (mt/with-temporary-setting-values [version.settings/check-for-updates false]
        (task/run-sync!)
        (is (= 1 @calls))))))

(deftest stale-test
  (mt/with-temporary-setting-values [settings/product-notifications-last-synced-at nil]
    (is (true? (task/stale?))))
  (mt/with-temporary-setting-values
    [settings/product-notifications-last-synced-at (t/minus (t/offset-date-time) (t/hours 13))]
    (is (true? (task/stale?))))
  (mt/with-temporary-setting-values
    [settings/product-notifications-last-synced-at (t/minus (t/offset-date-time) (t/hours 1))]
    (is (false? (task/stale?)))))

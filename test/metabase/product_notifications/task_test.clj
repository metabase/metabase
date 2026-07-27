(ns metabase.product-notifications.task-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.product-notifications.settings :as settings]
   [metabase.product-notifications.sync :as sync]
   [metabase.product-notifications.task :as task]
   [metabase.task.core :as task.core]
   [metabase.test :as mt])
  (:import
   (org.quartz CronTrigger DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(deftest sync-gating-test
  (mt/with-dynamic-fn-redefs [premium-features/airgap-enabled (constantly false)]
    (is (true? (#'task/sync-enabled?))))
  (mt/with-dynamic-fn-redefs [premium-features/airgap-enabled (constantly true)]
    (is (false? (#'task/sync-enabled?))))
  (with-redefs [config/is-dev? true]
    (mt/with-dynamic-fn-redefs [premium-features/airgap-enabled (constantly false)]
      (is (false? (#'task/sync-enabled?))))))

(deftest run-sync-test
  (let [calls (atom 0)]
    (mt/with-dynamic-fn-redefs [premium-features/airgap-enabled (constantly false)
                                sync/sync-from-source!          #(swap! calls inc)]
      (#'task/run-sync!)
      (is (= 1 @calls)))))

(deftest stale-test
  (mt/with-temporary-setting-values [settings/product-notifications-last-synced-at nil]
    (is (true? (#'task/stale?))))
  (mt/with-temporary-setting-values
    [settings/product-notifications-last-synced-at (t/minus (t/offset-date-time) (t/hours 13))]
    (is (true? (#'task/stale?))))
  (mt/with-temporary-setting-values
    [settings/product-notifications-last-synced-at (t/minus (t/offset-date-time) (t/hours 1))]
    (is (false? (#'task/stale?)))))

(deftest job-metadata-test
  (let [job-class (Class/forName "metabase.product_notifications.task.SyncProductNotifications")]
    (is (.isAnnotationPresent job-class DisallowConcurrentExecution))))

(deftest trigger-metadata-test
  (let [^CronTrigger trigger (#'task/sync-trigger 3 15)]
    (is (= "0 15 3/12 * * ? *" (.getCronExpression trigger)))
    (is (= CronTrigger/MISFIRE_INSTRUCTION_DO_NOTHING
           (.getMisfireInstruction trigger)))))

(deftest startup-sync-test
  (doseq [[enabled? stale? expected-triggers] [[true true 1]
                                               [true false 0]
                                               [false true 0]]]
    (let [trigger-count (atom 0)]
      (mt/with-dynamic-fn-redefs [task/sync-enabled?        (constantly enabled?)
                                  task/stale?               (constantly stale?)
                                  task.core/schedule-task!  (constantly nil)
                                  task.core/trigger-now!    (fn [_job-key]
                                                              (swap! trigger-count inc))]
        (task.core/init! ::task/SyncProductNotifications)
        (is (= expected-triggers @trigger-count))))))

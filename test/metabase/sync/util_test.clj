(ns metabase.sync.util-test
  "Tests for the utility functions shared by all parts of sync, such as the duplicate ops guard."
  (:require [clj-time.coerce :as tcoerce]
            [expectations :refer :all]
            [metabase
             [driver :as driver]
             [sync :as sync]]
            [metabase.sync
             [interface :as i]
             [util :refer :all]]
            [metabase.models.database :refer [Database] :as mdb]
            [toucan.util.test :as tt]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Duplicate Sync Prevention                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; test that we prevent running simultaneous syncs on the same database

(defonce ^:private calls-to-describe-database (atom 0))

(defrecord ^:private ConcurrentSyncTestDriver []
  clojure.lang.Named
  (getName [_] "ConcurrentSyncTestDriver"))

(extend ConcurrentSyncTestDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:describe-database (fn [_ _]
                               (swap! calls-to-describe-database inc)
                               (Thread/sleep 1000)
                               {:tables #{}})
          :describe-table    (constantly nil)
          :details-fields    (constantly [])}))

(driver/register-driver! :concurrent-sync-test (ConcurrentSyncTestDriver.))

;; only one sync should be going on at a time
(expect
 ;; describe-database gets called twice during a single sync process, once for syncing tables and a second time for
 ;; syncing the _metabase_metadata table
 2
 (tt/with-temp* [Database [db {:engine :concurrent-sync-test}]]
   (reset! calls-to-describe-database 0)
   ;; start a sync processes in the background. It should take 1000 ms to finish
   (let [f1 (future (sync/sync-database! db))
         f2 (do
              ;; wait 200 ms to make sure everything is going
              (Thread/sleep 200)
              ;; Start another in the background. Nothing should happen here because the first is already running
              (future (sync/sync-database! db)))]
     ;; Start another in the foreground. Again, nothing should happen here because the original should still be
     ;; running
     (sync/sync-database! db)
     ;; make sure both of the futures have finished
     (deref f1)
     (deref f2)
     ;; Check the number of syncs that took place. Should be 2 (just the first)
     @calls-to-describe-database)))

(defn call-with-operation-info
  "Call `f` with `log-sync-summary` redef'd to intercept the step metadata before the information is logged. This is
  useful to validate that the metadata is correct as the message might not be logged at all (depending on the logging
  level)."
  [f]
  (let [step-info-atom (atom [])
        orig-fn (var-get #'metabase.sync.util/log-sync-summary)]
    (with-redefs [metabase.sync.util/log-sync-summary (fn [operation database {:keys [steps] :as operation-metadata}]
                                                        (swap! step-info-atom conj operation-metadata)
                                                        (orig-fn operation database operation-metadata))]
      (f))
    @step-info-atom))

(defn sync-database!
  "Calls `sync-database!` and returns the the metadata for `step` as the result. This function is useful for
  validating that each steps metadata correctly reflects the changes that were made via a test scenario."
  [step db]
  (let [operation-results (call-with-operation-info #(sync/sync-database! db))]
    (-> (into {} (mapcat :steps operation-results))
        (get step))))

(defn only-step-keys
  "This function removes the generic keys for the step metadata, returning only the step specific keypairs to make
  validating the results for the given step easier."
  [step-info]
  (dissoc step-info :start-time :end-time :duration :log-summary-fn))

(defn- date-string? [s]
  (-> s tcoerce/from-string boolean))

(defn- validate-times [m]
  (and (-> m :start-time date-string?)
       (-> m :end-time date-string?)
       (-> m :duration string?)))

(expect
  [
   ;; There should only be 1 operation info returned
   true
   ;; Validate that start/end/duration of the entire sync operation is included
   true
   ;; Each step should have a valid start/end/duration value
   [true true]
   ;; Each step name is included with the results, the order is preseverd
   ["step1" "step2"]]
  (let [sync-steps [(create-sync-step "step1" (fn [_] (Thread/sleep 10)))
                    (create-sync-step "step2" (fn [_] (Thread/sleep 10)))]
        mock-db    (mdb/map->DatabaseInstance {:name "test", :id  1, :engine :h2})
        [results & none]    (call-with-operation-info #(run-sync-operation "sync" mock-db sync-steps))]
    [(empty? none)
     (validate-times results)
     (map (comp validate-times second) (:steps results))
     (map first (:steps results))]))

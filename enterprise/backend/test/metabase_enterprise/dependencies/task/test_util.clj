(ns metabase-enterprise.dependencies.task.test-util
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.task.backfill :as dependencies.backfill]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn backfill-dependencies-single-trigger!
  "Runs a single batch of the dependencies backfill task."
  []
  (mt/with-premium-features #{:dependencies}
    (#'dependencies.backfill/backfill-dependencies!)))

(defn backfill-all-existing-entities!
  "Repeatedly runs batches of the dependencies backfill until it runs out of work to do.

  This ensures that any [[mt/with-temp]] entities have their dependencies properly filled in."
  []
  (mt/with-premium-features #{:dependencies}
    (while (backfill-dependencies-single-trigger!))))

(defn wait-for-condition
  "Given a `predicate` and a timeout in milliseconds, repeatedly sleeps for 100ms and checks `(predicate)`.

  Returns when `(predicate)` is truthy or when the timeout expires."
  [predicate timeout-ms]
  (let [limit (+ (System/currentTimeMillis) timeout-ms)]
    (loop []
      (Thread/sleep 100)
      (or (predicate)
          (when (< (System/currentTimeMillis) limit)
            (recur))))))

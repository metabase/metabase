(ns metabase.test.data.bigquery-cloud-sdk.dataset-state-test
  (:require
   [clojure.test :refer :all]
   [metabase.test.data.bigquery-cloud-sdk.dataset-state :as dataset-state])
  (:import
   (java.time Duration Instant LocalDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

(def ^:private now
  (.toInstant (.atOffset (LocalDateTime/of 2026 8 22 12 0 0) ZoneOffset/UTC)))

(defn- ago ^Instant [^Duration d]
  (.minus now d))

(defn- days ^Duration [n] (Duration/ofDays n))

(defn- gold [^Duration age]
  (dataset-state/ready-labels {:ephemeral? false, :created (ago age)}))

(defn- work [^Duration age]
  (dataset-state/ready-labels {:ephemeral? true, :created (ago age)}))

(defn- building [^Duration age]
  (dataset-state/building-labels {:ephemeral? false, :now (ago age)}))

(deftest ^:parallel stamp-round-trips-test
  (testing "label values may not start with a digit or contain `:`, so the timestamp is prefixed and basic-format"
    (is (= "d20260822t120000" (dataset-state/stamp now))))
  (testing "a stamp reads back as the instant it was written from, to the second"
    (is (= now (dataset-state/created {"created" (dataset-state/stamp now)}))))
  (testing "unreadable or absent stamps yield nil rather than a wrong age"
    (is (nil? (dataset-state/created {})))
    (is (nil? (dataset-state/created {"created" "d2026-08-22"})))
    (is (nil? (dataset-state/created {"created" "nonsense"})))))

(deftest ^:parallel building-is-not-ready-test
  (testing "a dataset is not usable until every table is loaded, so creation must not mark it ready"
    (is (not (dataset-state/ready? (building (days 0)))))
    (is (dataset-state/ready? (gold (days 0))))))

(deftest ^:parallel unlabelled-dataset-is-not-ready-test
  (testing "datasets predating this scheme carry no state; trusting them reopens the race it closes"
    (is (not (dataset-state/ready? {})))
    (is (not (dataset-state/ready? nil)))
    (is (not (dataset-state/ready? {"state" "building"})))))

(deftest ^:parallel publishing-preserves-creation-time-test
  (testing "publishing must not reset the age, or a dataset rebuilt on any cadence would never reach the reaping age"
    (let [born   (ago (days 20))
          labels (dataset-state/ready-labels {:ephemeral? false, :created born})]
      (is (= born (dataset-state/created labels)))))
  (testing "publishing keeps every label creation wrote, so it cannot lose the reaper's markers"
    (let [born (ago (days 3))
          b    (dataset-state/building-labels {:ephemeral? true, :now born})
          r    (dataset-state/ready-labels {:ephemeral? true, :created born})]
      (is (= (set (keys b)) (set (keys r))))
      (is (= (dataset-state/created b) (dataset-state/created r)))
      (is (dataset-state/ephemeral? r)))))

(deftest ^:parallel ephemeral-test
  (is (dataset-state/ephemeral? (work (days 0))))
  (is (not (dataset-state/ephemeral? (gold (days 0)))))
  (testing "absent label means shared, not ephemeral: never auto-reap a dataset that did not opt in"
    (is (not (dataset-state/ephemeral? {})))))

(deftest ^:parallel age-is-measured-in-real-time-not-calendar-days-test
  (testing "a work dataset created just before midnight must not be reapable just after it.
           At day granularity its age would round to a full day within a minute, and the reaper would delete it
           out from under the test that made it."
    (let [just-before-midnight (.toInstant (.atOffset (LocalDateTime/of 2026 8 21 23 59 59) ZoneOffset/UTC))
          just-after-midnight  (.toInstant (.atOffset (LocalDateTime/of 2026 8 22 0 0 1) ZoneOffset/UTC))
          labels (dataset-state/ready-labels {:ephemeral? true, :created just-before-midnight})]
      (is (not (dataset-state/reapable? labels just-after-midnight)))
      (testing "and it is still safe most of a day later"
        (is (not (dataset-state/reapable? labels (.plus just-before-midnight (Duration/ofHours 23))))))
      (testing "but does go once a full day of real time has passed"
        (is (dataset-state/reapable? labels (.plus just-before-midnight (Duration/ofHours 24))))))))

(deftest ^:parallel stale-test
  (let [lifetime ^Duration (:gold-lifetime dataset-state/retention)]
    (testing "a gold dataset is reused until its lifetime elapses, then rebuilt"
      (is (not (dataset-state/stale? (gold (days 0)) now)))
      (is (not (dataset-state/stale? (gold (.minus lifetime (Duration/ofSeconds 1))) now)))
      (is (dataset-state/stale? (gold lifetime) now)))
    (testing "a dataset with no creation time cannot be judged stale; `ready?` already rejects it"
      (is (not (dataset-state/stale? {} now)))
      (is (not (dataset-state/stale? {"state" "ready"} now))))))

(deftest ^:parallel reapable-test
  (let [work-life ^Duration (:work-lifetime dataset-state/retention)
        reap      ^Duration (:gold-reap dataset-state/retention)]
    (testing "work datasets go once their lifetime is up: their test dropped them, or died"
      (is (not (dataset-state/reapable? (work (.minus work-life (Duration/ofSeconds 1))) now)))
      (is (dataset-state/reapable? (work work-life) now)))
    (testing "a dataset stuck mid-build is residue nothing will ever finish"
      (is (not (dataset-state/reapable? (building (Duration/ofSeconds 0)) now)))
      (is (dataset-state/reapable? (building work-life) now)))
    (testing "gold survives well past the age at which anything using it would have rebuilt it"
      (is (not (dataset-state/reapable? (gold (.minus reap (Duration/ofSeconds 1))) now)))
      (is (dataset-state/reapable? (gold reap) now)))
    (testing "unlabelled datasets are left for a deliberate sweep, not reaped by surprise"
      (is (not (dataset-state/reapable? {} now)))
      (is (not (dataset-state/reapable? {"state" "ready"} now))))))

(deftest ^:parallel reaping-only-follows-a-missed-rebuild-test
  (testing "a gold dataset must go stale, then stay unrebuilt for a further lifetime, before it can be reaped -
           that gap is the only evidence anyone has that nobody is using it"
    (let [{:keys [gold-lifetime gold-reap]} dataset-state/retention]
      (is (pos? (.compareTo ^Duration gold-reap ^Duration gold-lifetime)))
      (testing "at the moment it goes stale it is rebuilt, not deleted"
        (is (dataset-state/stale? (gold gold-lifetime) now))
        (is (not (dataset-state/reapable? (gold gold-lifetime) now)))))))

(ns metabase.test.data.bigquery-cloud-sdk.dataset-state-test
  (:require
   [clojure.test :refer :all]
   [metabase.test.data.bigquery-cloud-sdk.dataset-state :as dataset-state])
  (:import
   (java.time Duration LocalDate)))

(set! *warn-on-reflection* true)

(def ^:private today (LocalDate/of 2026 8 22))

(defn- days-ago ^LocalDate [n]
  (.minusDays today (long n)))

(defn- gold [built-n-days-ago]
  (dataset-state/ready-labels {:ephemeral? false, :created (days-ago built-n-days-ago)}))

(defn- work [built-n-days-ago]
  (dataset-state/ready-labels {:ephemeral? true, :created (days-ago built-n-days-ago)}))

(defn- building [built-n-days-ago]
  (dataset-state/building-labels {:ephemeral? false, :today (days-ago built-n-days-ago)}))

(deftest ^:parallel day-stamp-test
  (testing "label values may not start with a digit, so the ISO date is prefixed"
    (is (= "d2026-08-22" (dataset-state/day-stamp today)))
    (is (= "d2026-01-01" (dataset-state/day-stamp (LocalDate/of 2026 1 1))))))

(deftest ^:parallel building-is-not-ready-test
  (testing "a dataset is not usable until every table is loaded, so creation must not mark it ready"
    (is (not (dataset-state/ready? (building 0))))
    (is (dataset-state/ready? (gold 0)))))

(deftest ^:parallel unlabelled-dataset-is-not-ready-test
  (testing "datasets predating this scheme carry no state; trusting them reopens the race it closes"
    (is (not (dataset-state/ready? {})))
    (is (not (dataset-state/ready? nil)))
    (is (not (dataset-state/ready? {"state" "building"})))))

(deftest ^:parallel publishing-preserves-creation-date-test
  (testing "publishing must not reset the age, or a dataset rebuilt daily would never reach the reaping age"
    (let [labels (dataset-state/ready-labels {:ephemeral? false, :created (days-ago 20)})]
      (is (= (days-ago 20) (dataset-state/created labels)))))
  (testing "publishing keeps every label creation wrote, so a partial write cannot lose the reaper's markers"
    (let [b (dataset-state/building-labels {:ephemeral? true, :today (days-ago 3)})
          r (dataset-state/ready-labels {:ephemeral? true, :created (days-ago 3)})]
      (is (= (set (keys b)) (set (keys r))))
      (is (= (dataset-state/created b) (dataset-state/created r)))
      (is (dataset-state/ephemeral? r)))))

(deftest ^:parallel ephemeral-test
  (is (dataset-state/ephemeral? (work 0)))
  (is (not (dataset-state/ephemeral? (gold 0))))
  (testing "absent label means shared, not ephemeral: never auto-reap a dataset that did not opt in"
    (is (not (dataset-state/ephemeral? {})))))

(deftest ^:parallel stale-test
  (let [lifetime-days (.toDays ^Duration (:gold-lifetime dataset-state/retention))]
    (testing "a gold dataset is reused until its lifetime elapses, then rebuilt"
      (is (not (dataset-state/stale? (gold 0) today)))
      (is (not (dataset-state/stale? (gold (dec lifetime-days)) today)))
      (is (dataset-state/stale? (gold lifetime-days) today)))
    (testing "a dataset with no creation date cannot be judged stale; `ready?` already rejects it"
      (is (not (dataset-state/stale? {} today)))
      (is (not (dataset-state/stale? {"state" "ready"} today))))))

(deftest ^:parallel reapable-test
  (testing "work datasets are disposable the next day: their test dropped them, or died"
    (is (not (dataset-state/reapable? (work 0) today)))
    (is (dataset-state/reapable? (work 1) today)))
  (testing "a dataset stuck mid-build is residue nothing will ever finish"
    (is (not (dataset-state/reapable? (building 0) today)))
    (is (dataset-state/reapable? (building 1) today)))
  (testing "gold survives well past the age at which anything using it would have rebuilt it"
    (let [reap-days (.toDays ^Duration (:gold-reap dataset-state/retention))]
      (is (not (dataset-state/reapable? (gold (dec reap-days)) today)))
      (is (dataset-state/reapable? (gold reap-days) today))))
  (testing "unlabelled datasets are left for a deliberate sweep, not reaped by surprise"
    (is (not (dataset-state/reapable? {} today)))
    (is (not (dataset-state/reapable? {"state" "ready"} today)))))

(deftest ^:parallel reaping-only-follows-a-missed-rebuild-test
  (testing "a gold dataset must become stale, and stay unrebuilt for a further lifetime, before it can be reaped -
           that gap is the only evidence anyone has that nobody is using it"
    (let [{:keys [gold-lifetime gold-reap]} dataset-state/retention]
      (is (pos? (.compareTo ^Duration gold-reap ^Duration gold-lifetime)))
      (let [lifetime-days (.toDays ^Duration gold-lifetime)]
        (testing "at the moment it goes stale it is rebuilt, not deleted"
          (is (dataset-state/stale? (gold lifetime-days) today))
          (is (not (dataset-state/reapable? (gold lifetime-days) today))))))))

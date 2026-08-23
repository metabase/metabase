(ns metabase.test.data.bigquery-cloud-sdk.dataset-state-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test.data.bigquery-cloud-sdk.dataset-state :as dataset-state])
  (:import
   (java.time Duration LocalDate)))

(set! *warn-on-reflection* true)

(def ^:private ^LocalDate today (LocalDate/of 2026 8 22))

(defn- days-ago ^LocalDate [n]
  (.minusDays today (long n)))

(deftest ^:parallel day-stamp-test
  (testing "label values may not start with a digit, so the ISO date is prefixed"
    (is (= "d2026-08-22" (dataset-state/day-stamp today)))
    (is (= "d2026-01-01" (dataset-state/day-stamp (LocalDate/of 2026 1 1))))))

(deftest ^:parallel building-is-not-ready-test
  (testing "a dataset is not usable until every table is loaded, so creation must not mark it ready"
    (is (not (dataset-state/ready? (dataset-state/building-labels {:ephemeral? false, :today today}))))
    (is (dataset-state/ready? (dataset-state/ready-labels {:ephemeral? false, :today today})))))

(deftest ^:parallel unlabelled-dataset-is-not-ready-test
  (testing "datasets predating this scheme carry no state; trusting them reopens the race it closes"
    (is (not (dataset-state/ready? {})))
    (is (not (dataset-state/ready? nil)))
    (is (not (dataset-state/ready? {"state" "building"})))))

(deftest ^:parallel ready-labels-are-a-complete-set-test
  (testing "publishing rewrites every label, so it does not matter whether BigQuery merges or replaces on update"
    (let [building (dataset-state/building-labels {:ephemeral? true, :today today})
          ready    (dataset-state/ready-labels {:ephemeral? true, :today today})]
      (is (= (set (keys building)) (set (keys ready))))
      (is (dataset-state/ephemeral? ready)))))

(deftest ^:parallel ephemeral-test
  (is (dataset-state/ephemeral? (dataset-state/building-labels {:ephemeral? true, :today today})))
  (is (not (dataset-state/ephemeral? (dataset-state/building-labels {:ephemeral? false, :today today}))))
  (testing "absent label means shared, not ephemeral: never auto-reap a dataset that did not opt in"
    (is (not (dataset-state/ephemeral? {})))))

(deftest ^:parallel touched-labels-preserve-state-test
  (testing "recording use must not un-publish a dataset"
    (let [ready   (dataset-state/ready-labels {:ephemeral? false, :today (days-ago 5)})
          touched (dataset-state/touched-labels ready today)]
      (is (dataset-state/ready? touched))
      (is (= "d2026-08-22" (get touched "last_used"))))))

(deftest ^:parallel needs-touch-test
  (let [labels #(assoc (dataset-state/ready-labels {:ephemeral? false, :today (days-ago %)}) :ignored 1)]
    (testing "within the interval, no write"
      (is (not (dataset-state/needs-touch? (labels 0) today (t/duration 1 :days))))
      (is (not (dataset-state/needs-touch? (labels 1) today (t/duration 1 :days)))))
    (testing "past interval + jitter, one write"
      (is (dataset-state/needs-touch? (labels 2) today (t/duration 1 :days)))
      (is (dataset-state/needs-touch? (labels 30) today (t/duration 1 :days))))
    (testing "jitter staggers the write across processes rather than all firing the same day"
      (is (not (dataset-state/needs-touch? (labels 2) today (t/duration 2 :days))))
      (is (dataset-state/needs-touch? (labels 3) today (t/duration 2 :days))))
    (testing "never touched -> touch"
      (is (dataset-state/needs-touch? {} today (t/duration 1 :days))))))

(deftest ^:parallel reapable-test
  (let [gold #(dataset-state/ready-labels {:ephemeral? false, :today (days-ago %)})
        work #(dataset-state/ready-labels {:ephemeral? true, :today (days-ago %)})
        building #(dataset-state/building-labels {:ephemeral? false, :today (days-ago %)})]
    (testing "gold survives until nothing has used it for a fortnight"
      (is (not (dataset-state/reapable? (gold 13) today)))
      (is (dataset-state/reapable? (gold 14) today)))
    (testing "work is disposable the next day, since its test dropped it or died"
      (is (not (dataset-state/reapable? (work 0) today)))
      (is (dataset-state/reapable? (work 1) today)))
    (testing "a dataset stuck mid-build is residue nothing will finish"
      (is (not (dataset-state/reapable? (building 0) today)))
      (is (dataset-state/reapable? (building 1) today)))
    (testing "unlabelled datasets are left for a deliberate sweep, not reaped by surprise"
      (is (not (dataset-state/reapable? {} today)))
      (is (not (dataset-state/reapable? {"state" "ready"} today))))
    (testing "a touch keeps gold alive"
      (is (not (dataset-state/reapable? (dataset-state/touched-labels (gold 30) today) today))))))

(deftest ^:parallel retention-outlasts-touch-cadence-test
  (let [{:keys [gold-retention work-retention touch-interval touch-jitter]} dataset-state/retention]
    (testing "gold retention must exceed the longest gap between touches, or a dataset still in use is reaped between them"
      (is (pos? (.compareTo ^Duration gold-retention (.plus ^Duration touch-interval ^Duration touch-jitter)))))
    (testing "work datasets are never re-touched - one test creates and drops them - so their `last_used` stays the
             creation day and retention only has to outlast a single test run"
      (is (not (neg? (.compareTo ^Duration work-retention (t/duration 1 :days))))))))

(deftest ^:parallel random-touch-jitter-stays-in-window-test
  (testing "jitter must not push a touch past retention; it is a slice of the configured window, not unbounded"
    (dotimes [_ 50]
      (let [jitter (dataset-state/random-touch-jitter)]
        (is (not (neg? (.compareTo ^Duration jitter Duration/ZERO))))
        (is (not (pos? (.compareTo ^Duration jitter ^Duration (:touch-jitter dataset-state/retention)))))))))

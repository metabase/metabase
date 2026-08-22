(ns metabase.test.data.bigquery-cloud-sdk.dataset-lifecycle-test
  "Integration coverage for the dataset lifecycle, run against a local BigQuery emulator.

  The emulator does not persist label *mutations* - it accepts an update and then serves the original labels back -
  so everything downstream of the publish write (marking a dataset ready, touching `last_used`) is verified by the
  pure tests in [[metabase.test.data.bigquery-cloud-sdk.dataset-state-test]] and still needs a real BigQuery run.
  What is covered here is everything reachable without mutating a label: labels written at creation, reading them
  back, the reaper's decisions, and dataset teardown."
  (:require
   [clojure.java.shell :as shell]
   [clojure.test :refer :all]
   [metabase.test.data.bigquery-cloud-sdk :as bigquery.tx]
   [metabase.test.data.bigquery-cloud-sdk.dataset-state :as dataset-state]
   [metabase.test.data.bigquery-emulator :as bq-emu]
   [metabase.util.log :as log])
  (:import
   (java.time LocalDate)))

(set! *warn-on-reflection* true)

(def ^:private create-dataset! #'bigquery.tx/create-dataset!)
(def ^:private dataset-labels #'bigquery.tx/dataset-labels)
(def ^:private delete-dataset! #'bigquery.tx/delete-dataset!)

(defn- docker-available? []
  (try
    (zero? (:exit (shell/sh "docker" "version")))
    (catch Exception _
      false)))

(defn- with-emulator! [thunk]
  (if-not (docker-available?)
    (log/warn "Skipping BigQuery dataset lifecycle tests: no docker")
    (do (bq-emu/start!)
        (thunk))))

(defn- drop-quietly! [dataset-id]
  (try (delete-dataset! dataset-id) (catch Exception _ nil)))

(defn- days-ago [n]
  (.minusDays (LocalDate/now) n))

(deftest ^:synchronized labels-written-at-creation-test
  (with-emulator!
    (fn []
      (let [gold "emu_labels_gold"
            work "emu_labels_work"]
        (drop-quietly! gold)
        (drop-quietly! work)
        (try
          (testing "a dataset is created unpublished, so a concurrent process cannot mistake it for loaded"
            (create-dataset! gold (dataset-state/building-labels {:ephemeral? false, :today (LocalDate/now)}))
            (let [labels (dataset-labels gold)]
              (is (dataset-state/building? labels))
              (is (not (dataset-state/ready? labels)))
              (is (not (dataset-state/ephemeral? labels)))))
          (testing "a work dataset carries the marker the reaper keys on"
            (create-dataset! work (dataset-state/building-labels {:ephemeral? true, :today (LocalDate/now)}))
            (is (dataset-state/ephemeral? (dataset-labels work))))
          (finally
            (drop-quietly! gold)
            (drop-quietly! work)))))))

(deftest ^:synchronized absent-dataset-reads-as-nil-test
  (with-emulator!
    (fn []
      (testing "absent and unpublished must be distinguishable: one is built, the other waited on"
        (drop-quietly! "emu_absent")
        (is (nil? (dataset-labels "emu_absent")))))))

(deftest ^:synchronized deleted-dataset-reads-as-nil-test
  (with-emulator!
    (fn []
      (testing "a dataset discarded by a failed build reads as absent, which is what lets a waiter stop waiting"
        (drop-quietly! "emu_discarded")
        (create-dataset! "emu_discarded" (dataset-state/building-labels {:ephemeral? false, :today (LocalDate/now)}))
        (is (some? (dataset-labels "emu_discarded")))
        (delete-dataset! "emu_discarded")
        (is (nil? (dataset-labels "emu_discarded")))))))

(deftest ^:synchronized reaper-deletes-only-expired-datasets-test
  (with-emulator!
    (fn []
      (let [fresh-gold "emu_reap_gold_fresh"
            stale-gold "emu_reap_gold_stale"
            stale-work "emu_reap_work_stale"
            fresh-work "emu_reap_work_fresh"
            all        [fresh-gold stale-gold stale-work fresh-work]]
        (run! drop-quietly! all)
        (try
          (create-dataset! fresh-gold (dataset-state/ready-labels {:ephemeral? false, :today (days-ago 1)}))
          (create-dataset! stale-gold (dataset-state/ready-labels {:ephemeral? false, :today (days-ago 30)}))
          (create-dataset! fresh-work (dataset-state/ready-labels {:ephemeral? true, :today (LocalDate/now)}))
          (create-dataset! stale-work (dataset-state/ready-labels {:ephemeral? true, :today (days-ago 3)}))
          (bigquery.tx/delete-old-datasets!)
          (testing "a gold dataset in active use survives; one nothing has touched in a fortnight does not"
            (is (some? (dataset-labels fresh-gold)))
            (is (nil? (dataset-labels stale-gold))))
          (testing "a work dataset outliving its test is reaped; one created today belongs to a running test"
            (is (some? (dataset-labels fresh-work)))
            (is (nil? (dataset-labels stale-work))))
          (finally
            (run! drop-quietly! all)))))))

(deftest ^:synchronized reaper-leaves-unlabelled-datasets-alone-test
  (with-emulator!
    (fn []
      (let [dataset-id "emu_reap_unlabelled"]
        (drop-quietly! dataset-id)
        (try
          (create-dataset! dataset-id {})
          (bigquery.tx/delete-old-datasets!)
          (testing "datasets predating this scheme are not reaped by surprise; they need a deliberate sweep"
            (is (some? (dataset-labels dataset-id))))
          (finally
            (drop-quietly! dataset-id)))))))

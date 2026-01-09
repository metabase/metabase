(ns mage.modules-test
  "Tests for driver decision logic.
   Run `mage -driver-decisions -h` to see the priority order."
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.modules]))

;; Access private functions for testing via @#'ns/var (works in babashka)
(defn driver-decision [& args]
  (apply @(resolve 'mage.modules/driver-decision) args))

(def cloud-drivers @(resolve 'mage.modules/cloud-drivers))

;; Referenced by core_test.clj to ensure namespace is loaded
(def keep-me :loaded)

(defn- make-ctx
  "Create a context map with sensible defaults, overridable by opts."
  [opts]
  (merge {:is-master-or-release false
          :pr-labels #{}
          :skip false
          :particular-driver-changed? #{}
          :verbose? false}
         opts))

;;; =============================================================================
;;; Priority 3: Quarantine (respected even on master/release)
;;; =============================================================================

(deftest quarantined-driver-skips
  (testing "Quarantined driver is skipped"
    (let [result (driver-decision :postgres
                                  (make-ctx {})
                                  false ; driver-module-affected?
                                  #{:postgres})] ; quarantined
      (is (false? (:should-run result)))
      (is (= "driver is quarantined" (:reason result))))))

(deftest quarantined-driver-with-break-label-runs
  (testing "Quarantined driver runs when break-quarantine label is present"
    (let [result (driver-decision :postgres
                                  (make-ctx {:pr-labels #{"break-quarantine-postgres"}})
                                  false
                                  #{:postgres})]
      (is (true? (:should-run result)))
      (is (re-find #"break-quarantine-postgres" (:reason result))))))

(deftest quarantine-respected-on-master
  (testing "Quarantined driver is skipped even on master/release"
    (let [result (driver-decision :postgres
                                  (make-ctx {:is-master-or-release true})
                                  true ; driver-deps-affected?
                                  #{:postgres})] ; quarantined
      (is (false? (:should-run result)))
      (is (= "driver is quarantined" (:reason result))))))

;;; =============================================================================
;;; Priority 1: Global skip
;;; =============================================================================

(deftest global-skip-skips-all-drivers
  (testing "Global skip (no backend changes) skips all drivers"
    (doseq [driver [:postgres :mysql :mongo :athena :bigquery]]
      (let [result (driver-decision driver
                                    (make-ctx {:skip true})
                                    true ; even if affected
                                    #{})]
        (is (false? (:should-run result))
            (str driver " should be skipped"))
        (is (= "workflow skip (no backend changes)" (:reason result)))))))

(deftest global-skip-beats-quarantine
  (testing "Global skip takes priority over quarantine"
    (let [result (driver-decision :postgres
                                  (make-ctx {:skip true})
                                  false
                                  #{:postgres})]
      (is (false? (:should-run result)))
      (is (= "workflow skip (no backend changes)" (:reason result))))))

;;; =============================================================================
;;; Priority 2: H2 always runs
;;; =============================================================================

(deftest h2-always-runs
  (testing "H2 always runs when not globally skipped"
    (let [result (driver-decision :h2
                                  (make-ctx {:is-master-or-release false})
                                  false ; driver module not affected
                                  #{})]
      (is (true? (:should-run result)))
      (is (= "H2 always runs" (:reason result))))))

(deftest h2-skipped-on-global-skip
  (testing "H2 is skipped when global skip is true"
    (let [result (driver-decision :h2
                                  (make-ctx {:skip true})
                                  false
                                  #{})]
      (is (false? (:should-run result)))
      (is (= "workflow skip (no backend changes)" (:reason result))))))

;;; =============================================================================
;;; Priority 4: Master/release branch
;;; =============================================================================

(deftest master-branch-runs-all-drivers
  (testing "All drivers run on master/release branch"
    (doseq [driver [:postgres :mysql :mongo :athena :bigquery :snowflake]]
      (let [result (driver-decision driver
                                    (make-ctx {:is-master-or-release true})
                                    false ; even if not affected
                                    #{})]
        (is (true? (:should-run result))
            (str driver " should run on master"))
        (is (= "master/release branch" (:reason result)))))))

;;; =============================================================================
;;; Priority 8: Driver deps affected (self-hosted only)
;;; =============================================================================

(deftest driver-deps-affected-runs-self-hosted-drivers
  (testing "Self-hosted drivers run when driver module is affected"
    (doseq [driver [:postgres :mysql :mongo :oracle :sqlserver]]
      (let [result (driver-decision driver
                                    (make-ctx {})
                                    true ; driver-deps-affected
                                    #{})]
        (is (true? (:should-run result))
            (str driver " should run when driver module affected"))
        (is (= "driver module affected by shared code changes" (:reason result)))))))

;;; =============================================================================
;;; Priority 5-7: Cloud driver special rules
;;; =============================================================================

(deftest cloud-driver-with-label-runs
  (testing "Cloud driver runs with ci:all-cloud-drivers label"
    (doseq [driver [:athena :bigquery :databricks :redshift :snowflake]]
      (let [result (driver-decision driver
                                    (make-ctx {:pr-labels #{"ci:all-cloud-drivers"}})
                                    false ; not affected
                                    #{})]
        (is (true? (:should-run result))
            (str driver " should run with label"))
        (is (= "ci:all-cloud-drivers label" (:reason result)))))))

(deftest cloud-driver-with-file-changes-runs
  (testing "Cloud driver runs when its files changed"
    (let [result (driver-decision :athena
                                  (make-ctx {:particular-driver-changed? #{:athena}})
                                  false
                                  #{})]
      (is (true? (:should-run result)))
      (is (re-find #"driver files changed" (:reason result))))))

(deftest cloud-driver-without-changes-skips
  (testing "Cloud driver skips when no relevant changes"
    (doseq [driver [:athena :bigquery :databricks :redshift :snowflake]]
      (let [result (driver-decision driver
                                    (make-ctx {})
                                    false ; not affected
                                    #{})]
        (is (false? (:should-run result))
            (str driver " should skip without changes"))
        (is (= "no relevant changes for cloud driver" (:reason result)))))))

;;; =============================================================================
;;; Priority 9: Self-hosted drivers
;;; =============================================================================

(deftest self-hosted-driver-not-affected-skips
  (testing "Self-hosted driver skips when driver module not affected"
    (doseq [driver [:postgres :mysql :mongo :oracle :sqlserver]]
      (let [result (driver-decision driver
                                    (make-ctx {})
                                    false ; not affected
                                    #{})]
        (is (false? (:should-run result))
            (str driver " should skip when not affected"))
        (is (= "driver module not affected" (:reason result)))))))

;;; =============================================================================
;;; Integration: Verify cloud vs self-hosted classification
;;; =============================================================================

(deftest cloud-drivers-are-correct
  (testing "Cloud drivers set matches expected"
    (is (= #{:athena :bigquery :databricks :redshift :snowflake}
           cloud-drivers))))

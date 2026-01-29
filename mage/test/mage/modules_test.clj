(ns mage.modules-test
  "Tests for driver decision logic.
   Run `mage -driver-decisions -h` to see the priority order."
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.modules]))

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
    (let [result (mage.modules/driver-decision :mysql
                                               (make-ctx {})
                                               false ; driver-module-affected?
                                               #{:mysql})] ; quarantined
      (is (false? (:should-run result)))
      (is (= "driver is quarantined" (:reason result))))))

(deftest quarantined-driver-with-break-label-runs
  (testing "Quarantined driver runs when break-quarantine label is present"
    (let [result (mage.modules/driver-decision :mysql
                                               (make-ctx {:pr-labels #{"break-quarantine-mysql"}})
                                               false
                                               #{:mysql})]
      (is (true? (:should-run result)))
      (is (re-find #"break-quarantine-mysql" (:reason result))))))

(deftest quarantine-respected-on-master
  (testing "Quarantined driver is skipped even on master/release"
    (let [result (mage.modules/driver-decision :mysql
                                               (make-ctx {:is-master-or-release true})
                                               true ; driver-deps-affected?
                                               #{:mysql})] ; quarantined
      (is (false? (:should-run result)))
      (is (= "driver is quarantined" (:reason result))))))

;;; =============================================================================
;;; Priority 1: Global skip
;;; =============================================================================

(deftest global-skip-skips-all-drivers
  (testing "Global skip (no backend changes) skips all drivers"
    (doseq [driver [:h2 :postgres :mysql :mongo :athena :bigquery]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {:skip true})
                                                 true ; even if affected
                                                 #{})]
        (is (false? (:should-run result))
            (str driver " should be skipped"))
        (is (= "workflow skip (no backend changes)" (:reason result)))))))

(deftest global-skip-beats-quarantine
  (testing "Global skip takes priority over quarantine"
    (let [result (mage.modules/driver-decision :mysql
                                               (make-ctx {:skip true})
                                               false
                                               #{:mysql})]
      (is (false? (:should-run result)))
      (is (= "workflow skip (no backend changes)" (:reason result))))))

;;; =============================================================================
;;; Priority 2: H2 and Postgres always run
;;; =============================================================================

(deftest h2-and-postgres-always-run
  (testing "H2 and Postgres always run when not globally skipped"
    (doseq [driver [:h2 :postgres]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {:is-master-or-release false})
                                                 false ; driver module not affected
                                                 #{})]
        (is (true? (:should-run result))
            (str driver " should always run"))
        (is (= "H2/Postgres always run" (:reason result)))))))

(deftest h2-and-postgres-skipped-on-global-skip
  (testing "H2 and Postgres are skipped when global skip is true"
    (doseq [driver [:h2 :postgres]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {:skip true})
                                                 false
                                                 #{})]
        (is (false? (:should-run result))
            (str driver " should be skipped on global skip"))
        (is (= "workflow skip (no backend changes)" (:reason result)))))))

;;; =============================================================================
;;; Priority 4: Master/release branch
;;; =============================================================================

(deftest master-branch-runs-all-drivers
  (testing "All drivers run on master/release branch"
    ;; H2/Postgres hit priority 2 first, others hit priority 4
    (doseq [driver [:mysql :mongo :athena :bigquery :snowflake]]
      (let [result (mage.modules/driver-decision driver
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
    ;; H2/Postgres hit priority 2 first, others hit priority 8
    (doseq [driver [:mysql :mongo :oracle :sqlserver]]
      (let [result (mage.modules/driver-decision driver
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
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {:pr-labels #{"ci:all-cloud-drivers"}})
                                                 false ; not affected
                                                 #{})]
        (is (true? (:should-run result))
            (str driver " should run with label"))
        (is (= "ci:all-cloud-drivers label" (:reason result)))))))

(deftest cloud-driver-with-file-changes-runs
  (testing "Cloud driver runs when its files changed"
    (let [result (mage.modules/driver-decision :athena
                                               (make-ctx {:particular-driver-changed? #{:athena}})
                                               false
                                               #{})]
      (is (true? (:should-run result)))
      (is (re-find #"driver files changed" (:reason result))))))

(deftest cloud-driver-without-changes-skips
  (testing "Cloud driver skips when no relevant changes"
    (doseq [driver [:athena :bigquery :databricks :redshift :snowflake]]
      (let [result (mage.modules/driver-decision driver
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
    ;; H2/Postgres always run (priority 2), so test other self-hosted drivers
    (doseq [driver [:mysql :mongo :oracle :sqlserver]]
      (let [result (mage.modules/driver-decision driver
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
           mage.modules/cloud-drivers))))

;;; =============================================================================
;;; Two roots trigger driver tests: driver and enterprise/transforms
;;; =============================================================================

(deftest transforms-triggers-driver-tests
  (testing "enterprise/transforms triggers driver tests (it's a root)"
    (is (true? (mage.modules/driver-deps-affected? ['enterprise/transforms])))))

(deftest driver-triggers-driver-tests
  (testing "driver triggers driver tests (it's a root)"
    (is (true? (mage.modules/driver-deps-affected? ['driver])))))

(deftest all-modules-triggers-themselves-test
  (let [deps (mage.modules/dependencies)]
    (doseq [a-module (keys (mage.modules/dependencies))]
      (is (contains? (mage.modules/affected-modules deps [a-module]) a-module)
          (str "The " a-module " module should trigger itself")))))

;;; =============================================================================
;;; Regression test: module graph should not become more connected
;;; =============================================================================

(defn modules-affecting-drivers []
  (let [deps (mage.modules/dependencies)
        all (keys deps)]
    (filter #(mage.modules/driver-deps-affected? [%]) all)))

(deftest module-graph-may-not-become-more-connected
  (testing "The number of modules that trigger driver tests should not increase without explicit approval.
            If this test fails, you've likely connected a module to driver that shouldn't trigger driver tests.
            Add it to driver-affecting-overrides if it shouldn't trigger driver tests."
    (let [modules-triggering-drivers (modules-affecting-drivers)
          ;; This count was 33 as of 2026-01-20. Update this number ONLY if you
          ;; intentionally want more modules to trigger driver tests.
          max-allowed-count 33]
      (is (<= (count modules-triggering-drivers) max-allowed-count)
          (format "Too many modules trigger driver tests! Expected <= %d, got %d.
                   Modules triggering driver tests: %s
                   If this is intentional, update max-allowed-count.
                   Otherwise, add the new module(s) to driver-affecting-overrides."
                  max-allowed-count
                  (count modules-triggering-drivers)
                  (pr-str (sort modules-triggering-drivers)))))))

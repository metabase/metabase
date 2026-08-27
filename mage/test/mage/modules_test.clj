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
          :particular-driver-changed? #{}}
         opts))

;;; =============================================================================
;;; Priority 0: --only-driver (workflow_dispatch asking for one job by name)
;;; =============================================================================

(deftest only-driver-runs-just-that-driver
  (testing "--only-driver runs the named driver and skips every other one"
    (doseq [driver [:h2 :postgres :mysql-mariadb :bigquery]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {:only-driver :bigquery})
                                                 false   ; driver-deps-affected?
                                                 #{})]   ; updated
        (is (= (= :bigquery driver) (:should-run result))
            (str driver " should run only when it is the requested driver"))))))

(deftest only-driver-beats-every-other-rule
  (testing "the requested driver runs even when the workflow says skip"
    (let [result (mage.modules/driver-decision :snowflake
                                               (make-ctx {:only-driver :snowflake, :skip true})
                                               false
                                               #{})]
      (is (true? (:should-run result)))
      (is (= "requested via --only-driver=snowflake" (:reason result)))))
  (testing "and H2/Postgres lose their always-run privilege, so the run is one job wide"
    (let [result (mage.modules/driver-decision :h2
                                               (make-ctx {:only-driver :snowflake})
                                               false
                                               #{})]
      (is (false? (:should-run result)))
      (is (= "--only-driver=snowflake requested instead" (:reason result))))))

(deftest unknown-only-driver-is-rejected
  (testing "a typo throws instead of silently falling back to the normal decisions"
    (is (thrown-with-msg? Exception #"Unknown driver: bigquerry"
                          (#'mage.modules/parse-only-driver "bigquerry"))))
  (testing "blank means no request"
    (doseq [blank [nil "" "  "]]
      (is (nil? (#'mage.modules/parse-only-driver blank))))))

;;; =============================================================================
;;; Driver directory -> test job mapping
;;; =============================================================================

(deftest driver-directory-names-map-to-test-jobs
  (testing "a driver directory maps to the driver keyword(s) whose jobs it feeds"
    (is (= [:bigquery] (get @#'mage.modules/driver-directory->drivers "bigquery-cloud-sdk"))
        "bigquery-cloud-sdk should map to [:bigquery]")
    (is (= [:mongo :mongo-ssl :mongo-sharded-cluster] (get @#'mage.modules/driver-directory->drivers "mongo"))
        "mongo should map to multiple test jobs")))

;;; =============================================================================
;;; Priority 1: Global skip
;;; =============================================================================

(deftest global-skip-skips-all-drivers
  (testing "Global skip (no backend changes) skips all drivers"
    (doseq [driver [:h2 :postgres :mysql :mongo :athena :bigquery]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {:skip true})
                                                 true  ; even if affected
                                                 #{})] ; updated
        (is (false? (:should-run result))
            (str driver " should be skipped"))
        (is (= "workflow skip (no backend changes)" (:reason result)))))))

;;; =============================================================================
;;; Priority 2: H2 and Postgres always run
;;; =============================================================================

(deftest h2-and-postgres-always-run
  (testing "H2 and Postgres always run when not globally skipped"
    (doseq [driver [:h2 :postgres]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {:is-master-or-release false})
                                                 false ; driver module not affected
                                                 #{})] ; updated
        (is (true? (:should-run result))
            (str driver " should always run"))
        (is (= "H2/Postgres always run" (:reason result)))))))

(deftest h2-and-postgres-skipped-on-global-skip
  (testing "H2 and Postgres are skipped when global skip is true"
    (doseq [driver [:h2 :postgres]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {:skip true})
                                                 false
                                                 #{})] ; updated
        (is (false? (:should-run result))
            (str driver " should be skipped on global skip"))
        (is (= "workflow skip (no backend changes)" (:reason result)))))))

;;; =============================================================================
;;; Priority 3: ci:run-all-drivers / ci:run-<driver> labels
;;; =============================================================================

(deftest ci-run-all-drivers-forces-run
  (testing "ci:run-all-drivers forces any driver to run"
    (doseq [driver [:mysql :mongo :athena :bigquery :snowflake]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {:pr-labels #{"ci:run-all-drivers"}})
                                                 false ; not affected
                                                 #{})] ; updated
        (is (true? (:should-run result))
            (str driver " should run with ci:run-all-drivers"))
        (is (= "ci:run-all-drivers label" (:reason result)))))))

(deftest ci-run-specific-driver-forces-run
  (testing "ci:run-<driver> forces that specific driver to run"
    (let [result (mage.modules/driver-decision :mysql
                                               (make-ctx {:pr-labels #{"ci:run-mysql"}})
                                               false
                                               #{})] ; updated
      (is (true? (:should-run result)))
      (is (= "ci:run-mysql label" (:reason result))))))

(deftest ci-run-specific-driver-does-not-force-other-drivers
  (testing "ci:run-<driver> for a different driver does NOT force the current driver"
    (let [result (mage.modules/driver-decision :mongo
                                               (make-ctx {:pr-labels #{"ci:run-mysql"}})
                                               false
                                               #{})] ; updated
      (is (false? (:should-run result))))))

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
                                                 #{})] ; updated
        (is (true? (:should-run result))
            (str driver " should run on master"))
        (is (= "master/release branch" (:reason result)))))))

;;; =============================================================================
;;; Priority 10: Driver deps affected (self-hosted only)
;;; =============================================================================

(deftest driver-deps-affected-runs-self-hosted-drivers
  (testing "Self-hosted drivers run when driver module is affected"
    ;; H2/Postgres hit priority 2 first, others hit priority 10
    (doseq [driver [:mysql :mongo :oracle :sqlserver]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {})
                                                 true  ; driver-deps-affected
                                                 #{})] ; updated
        (is (true? (:should-run result))
            (str driver " should run when driver module affected"))
        (is (= "driver module affected by shared code changes" (:reason result)))))))

;;; =============================================================================
;;; Priority 5-9: Cloud driver special rules
;;; =============================================================================

(deftest cloud-driver-with-label-runs
  (testing "Cloud driver runs with ci:run-all-cloud-drivers label"
    (doseq [driver [:athena :bigquery :databricks :redshift :snowflake]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {:pr-labels #{"ci:run-all-cloud-drivers"}})
                                                 false ; not affected
                                                 #{})] ; updated
        (is (true? (:should-run result))
            (str driver " should run with label"))
        (is (= "ci:run-all-cloud-drivers label" (:reason result)))))))

(deftest cloud-driver-with-file-changes-runs
  (testing "Cloud driver runs when its files changed"
    (let [result (mage.modules/driver-decision :athena
                                               (make-ctx {:particular-driver-changed? #{:athena}})
                                               false
                                               #{})] ; updated
      (is (true? (:should-run result)))
      (is (re-find #"driver files changed" (:reason result))))))

(deftest modules-can-trigger-cloud-drivers
  (doseq [module '#{query-processor transforms
                    enterprise/transforms enterprise/transforms-python enterprise/workspaces}
          driver [:athena :bigquery :databricks :redshift :snowflake]]
    (testing (format "Cloud driver runs when %s module is updated" module)
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {})
                                                 false       ; not affected
                                                 #{module})] ; updated
        (is (true? (:should-run result))
            (str driver " should run when query-processor updated"))
        (is (= "Module updated which explicitly triggers cloud drivers"
               (:reason result)))))))

(deftest cloud-driver-runs-when-driver-deps-affected
  (testing "Cloud driver runs when driver deps are affected (e.g., deps.edn changed)"
    (doseq [driver [:athena :bigquery :databricks :redshift :snowflake]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {})
                                                 true  ; driver-deps-affected
                                                 #{})] ; updated
        (is (true? (:should-run result))
            (str driver " should run when driver deps affected"))
        (is (= "driver module affected by shared code changes" (:reason result)))))))

(deftest cloud-driver-without-changes-skips
  (testing "Cloud driver skips when no relevant changes"
    (doseq [driver [:athena :bigquery :databricks :redshift :snowflake]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {})
                                                 false ; not affected
                                                 #{})] ; updated
        (is (false? (:should-run result))
            (str driver " should skip without changes"))
        (is (= "no relevant changes for cloud driver" (:reason result)))))))

;;; =============================================================================
;;; Priority 11: Self-hosted drivers
;;; =============================================================================

(deftest self-hosted-driver-not-affected-skips
  (testing "Self-hosted driver skips when driver module not affected"
    ;; H2/Postgres always run (priority 2), so test other self-hosted drivers
    (doseq [driver [:mysql :mongo :oracle :sqlserver]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {})
                                                 false ; not affected
                                                 #{})] ; updated
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
;;; Two roots trigger driver tests: driver and transforms
;;; =============================================================================

(deftest transforms-triggers-driver-tests
  (testing "transforms triggers driver tests (it's a root)"
    (is (true? (mage.modules/driver-deps-affected? ['transforms])))))

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
          ;; This is a ratchet: it prevents accidental expansion of which modules
          ;; trigger driver tests. When a module transitively depends on driver code,
          ;; changes to that module cause ALL driver tests to run in CI, which is
          ;; expensive. If this test fails, either:
          ;;   1. Your module legitimately affects drivers -- bump max-allowed-count
          ;;   2. Your module is infrastructure/gating, not driver logic
          ;;      -- add it to driver-affecting-overrides in mage.modules
          ;;
          ;; History:
          ;; 2026-02-06 Initial count: 37
          ;; 2026-02-10 Bumped to 38 for sql-tools + sql-parsing
          ;; 2026-03-10 Bumped to 40 for lib-metric + metrics (Metrics Explorer #68961)
          ;;            Added premium-features to driver-affecting-overrides (#69561)
          ;; 2026-04-07 Bumped to 41 due to agent-lib addition (Metabot MBQL improvements #71524)
          max-allowed-count 41]
      (is (<= (count modules-triggering-drivers) max-allowed-count)
          (format "Too many modules trigger driver tests! Expected <= %d, got %d.
                   Modules triggering driver tests: %s
                   If this is intentional, update max-allowed-count.
                   Otherwise, add the new module(s) to driver-affecting-overrides."
                  max-allowed-count
                  (count modules-triggering-drivers)
                  (pr-str (sort modules-triggering-drivers)))))))

(deftest test-files-mark-modules-changes
  (testing "if you change a test in a module, that module is affected"
    ;; note in the future, this won't be all dependent modules see
    ;; https://linear.app/metabase/issue/DEV-1487/treat-changed-test-namespaces-as-module-only-changes
    (let [changed-file "enterprise/backend/test/metabase_enterprise/workspaces/api_test.clj"]
      (is (= '#{enterprise/workspaces}
             (mage.modules/updated-files->updated-modules [changed-file])))
      (is (-> [changed-file]
              mage.modules/updated-files->updated-modules
              mage.modules/driver-deps-affected?)))))

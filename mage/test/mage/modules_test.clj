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
;;; Priority 4: Quarantine (respected on PR branches, ignored on master/release)
;;; =============================================================================

(deftest quarantined-driver-skips
  (testing "Quarantined driver is skipped"
    (let [result (mage.modules/driver-decision :mysql
                                               (make-ctx {})
                                               false ; driver-module-affected?
                                               #{:mysql} ; quarantined
                                               #{})] ; updated
      (is (false? (:should-run result)))
      (is (= "driver is quarantined" (:reason result))))))

(deftest quarantined-driver-with-break-label-runs
  (testing "Quarantined driver runs when break-quarantine label is present"
    (let [result (mage.modules/driver-decision :mysql
                                               (make-ctx {:pr-labels #{"break-quarantine-mysql"}})
                                               false
                                               #{:mysql}
                                               #{})]
      (is (true? (:should-run result)))
      (is (re-find #"break-quarantine-mysql" (:reason result))))))

(deftest effective-quarantine-ignored-on-master-and-release
  (testing "the remote quarantine list is dropped on master/release, but honored on PR branches"
    (let [statuses {:databricks :skip :snowflake :info}]
      (is (= #{} (#'mage.modules/effective-quarantined-drivers statuses true))
          "master/release: nothing is quarantined")
      (is (= #{:databricks} (#'mage.modules/effective-quarantined-drivers statuses false))
          "PR/feature branch: :skip drivers remain quarantined"))))

(deftest quarantined-driver-runs-on-master
  (testing "a driver quarantined in the remote config still runs (and gates) on master/release"
    ;; Production clears the quarantine set on master/release via effective-quarantined-drivers,
    ;; so the decision falls through Priority 4 to Priority 5.
    (let [quarantined (#'mage.modules/effective-quarantined-drivers {:mysql :skip} true)
          result (mage.modules/driver-decision :mysql
                                               (make-ctx {:is-master-or-release true})
                                               true ; driver-deps-affected?
                                               quarantined
                                               #{})] ; updated
      (is (true? (:should-run result)))
      (is (= "master/release branch" (:reason result))))))

(deftest quarantine-config-names-are-translated
  (testing "Config names from ci-test-config.json are translated to internal driver keywords via driver-directory->drivers"
    (testing "directory names are translated to internal keywords"
      ;; bigquery-cloud-sdk -> :bigquery (via driver-directory->drivers mapping).
      ;; Use a PR/feature branch here, since quarantine is ignored on master/release.
      (let [result (mage.modules/driver-decision :bigquery
                                                 (make-ctx {:is-master-or-release false})
                                                 false
                                                 #{:bigquery} ; as if translated from "bigquery-cloud-sdk"
                                                 #{})]
        (is (false? (:should-run result)))
        (is (= "driver is quarantined" (:reason result)))))
    (testing "the driver-directory->drivers mapping contains expected translations"
      ;; Verify the mapping exists and has expected entries
      (is (= [:bigquery] (get @#'mage.modules/driver-directory->drivers "bigquery-cloud-sdk"))
          "bigquery-cloud-sdk should map to [:bigquery]")
      (is (= [:mongo :mongo-ssl :mongo-sharded-cluster] (get @#'mage.modules/driver-directory->drivers "mongo"))
          "mongo should map to multiple test jobs"))))

;;; =============================================================================
;;; Priority 1: Global skip
;;; =============================================================================

(deftest global-skip-skips-all-drivers
  (testing "Global skip (no backend changes) skips all drivers"
    (doseq [driver [:h2 :postgres :mysql :mongo :athena :bigquery]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {:skip true})
                                                 true ; even if affected
                                                 #{} ; quarantined
                                                 #{})] ; updated
        (is (false? (:should-run result))
            (str driver " should be skipped"))
        (is (= "workflow skip (no backend changes)" (:reason result)))))))

(deftest global-skip-beats-quarantine
  (testing "Global skip takes priority over quarantine"
    (let [result (mage.modules/driver-decision :mysql
                                               (make-ctx {:skip true})
                                               false
                                               #{:mysql}
                                               #{})]
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
                                                 #{} ; quarantined
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
                                                 #{} ; quarantined
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
                                                 #{} ; quarantined
                                                 #{})] ; updated
        (is (true? (:should-run result))
            (str driver " should run with ci:run-all-drivers"))
        (is (= "ci:run-all-drivers label" (:reason result)))))))

(deftest ci-run-specific-driver-forces-run
  (testing "ci:run-<driver> forces that specific driver to run"
    (let [result (mage.modules/driver-decision :mysql
                                               (make-ctx {:pr-labels #{"ci:run-mysql"}})
                                               false
                                               #{} ; quarantined
                                               #{})] ; updated
      (is (true? (:should-run result)))
      (is (= "ci:run-mysql label" (:reason result))))))

(deftest ci-run-specific-driver-does-not-force-other-drivers
  (testing "ci:run-<driver> for a different driver does NOT force the current driver"
    (let [result (mage.modules/driver-decision :mongo
                                               (make-ctx {:pr-labels #{"ci:run-mysql"}})
                                               false
                                               #{} ; quarantined
                                               #{})] ; updated
      (is (false? (:should-run result))))))

(deftest ci-run-all-drivers-overrides-quarantine
  (testing "ci:run-all-drivers overrides quarantine"
    (let [result (mage.modules/driver-decision :mysql
                                               (make-ctx {:pr-labels #{"ci:run-all-drivers"}})
                                               false
                                               #{:mysql} ; quarantined
                                               #{})] ; updated
      (is (true? (:should-run result)))
      (is (= "ci:run-all-drivers label" (:reason result))))))

(deftest ci-run-specific-driver-overrides-quarantine
  (testing "ci:run-<driver> overrides quarantine"
    (let [result (mage.modules/driver-decision :mysql
                                               (make-ctx {:pr-labels #{"ci:run-mysql"}})
                                               false
                                               #{:mysql} ; quarantined
                                               #{})] ; updated
      (is (true? (:should-run result)))
      (is (= "ci:run-mysql label" (:reason result))))))

;;; =============================================================================
;;; Priority 5: Master/release branch
;;; =============================================================================

(deftest master-branch-runs-all-drivers
  (testing "All drivers run on master/release branch"
    ;; H2/Postgres hit priority 2 first, others hit priority 5
    (doseq [driver [:mysql :mongo :athena :bigquery :snowflake]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {:is-master-or-release true})
                                                 false ; even if not affected
                                                 #{} ; quarantined
                                                 #{})] ; updated
        (is (true? (:should-run result))
            (str driver " should run on master"))
        (is (= "master/release branch" (:reason result)))))))

;;; =============================================================================
;;; Priority 11: Driver deps affected (self-hosted only)
;;; =============================================================================

(deftest driver-deps-affected-runs-self-hosted-drivers
  (testing "Self-hosted drivers run when driver module is affected"
    ;; H2/Postgres hit priority 2 first, others hit priority 11
    (doseq [driver [:mysql :mongo :oracle :sqlserver]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {})
                                                 true ; driver-deps-affected
                                                 #{} ; quarantined
                                                 #{})] ; updated
        (is (true? (:should-run result))
            (str driver " should run when driver module affected"))
        (is (= "driver module affected by shared code changes" (:reason result)))))))

;;; =============================================================================
;;; Priority 6-10: Cloud driver special rules
;;; =============================================================================

(deftest cloud-driver-with-label-runs
  (testing "Cloud driver runs with ci:all-cloud-drivers label"
    (doseq [driver [:athena :bigquery :databricks :redshift :snowflake]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {:pr-labels #{"ci:all-cloud-drivers"}})
                                                 false ; not affected
                                                 #{} ; quarantined
                                                 #{})] ; updated
        (is (true? (:should-run result))
            (str driver " should run with label"))
        (is (= "ci:all-cloud-drivers label" (:reason result)))))))

(deftest cloud-driver-with-file-changes-runs
  (testing "Cloud driver runs when its files changed"
    (let [result (mage.modules/driver-decision :athena
                                               (make-ctx {:particular-driver-changed? #{:athena}})
                                               false
                                               #{} ; quarantined
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
                                                 #{}         ; quarantined
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
                                                 #{}   ; quarantined
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
                                                 #{} ; quarantined
                                                 #{})] ; updated
        (is (false? (:should-run result))
            (str driver " should skip without changes"))
        (is (= "no relevant changes for cloud driver" (:reason result)))))))

;;; =============================================================================
;;; Priority 12: Self-hosted drivers
;;; =============================================================================

(deftest self-hosted-driver-not-affected-skips
  (testing "Self-hosted driver skips when driver module not affected"
    ;; H2/Postgres always run (priority 2), so test other self-hosted drivers
    (doseq [driver [:mysql :mongo :oracle :sqlserver]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {})
                                                 false ; not affected
                                                 #{} ; quarantined
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
          ;; 2026-06-04 Bumped to 42 due to run-tracking addition (Zombie transform reaper #75194)
          max-allowed-count 42]
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

;;; =============================================================================
;;; ci-test-config `drivers` parsing (skip / info / required status)
;;; =============================================================================

(deftest config-name->drivers-resolves-driver-names
  (testing "a driver name resolves to its internal driver keyword"
    (is (= [:snowflake] (#'mage.modules/config-name->drivers "snowflake")))
    (is (= [:bigquery] (#'mage.modules/config-name->drivers "bigquery")))
    (is (= [:databricks] (#'mage.modules/config-name->drivers "databricks"))))
  (testing "a name that fans out to several jobs is expanded"
    (is (= [:mongo :mongo-ssl :mongo-sharded-cluster]
           (#'mage.modules/config-name->drivers "mongo")))))

(def ^:private example-config
  "The new ci-test-config `drivers` shape from DEV-2149."
  {:drivers [{:name "databricks" :status "skip"}
             {:name "snowflake" :status "info"}
             {:name "bigquery" :status "info"}]})

(deftest driver-statuses-maps-names-to-status
  (testing "drivers array is translated to a driver-keyword -> status map"
    (with-redefs [mage.modules/read-ci-test-config (constantly example-config)]
      (is (= {:databricks :skip
              :snowflake :info
              :bigquery :info}
             (#'mage.modules/driver-statuses)))))
  (testing "drivers absent from the config are not present (implicitly :required)"
    (with-redefs [mage.modules/read-ci-test-config (constantly example-config)]
      (is (nil? (get (#'mage.modules/driver-statuses) :mysql))))))

(deftest driver-statuses-never-throws
  (testing "a failure to read/parse the config yields {} (all drivers required) instead of breaking CI"
    (with-redefs [mage.modules/read-ci-test-config (fn [] (throw (ex-info "boom" {})))]
      (is (= {} (#'mage.modules/driver-statuses))))))

(deftest skip-drivers-selects-only-skip-status
  (testing "only :skip drivers are quarantined; :info drivers still run"
    (is (= #{:databricks}
           (#'mage.modules/skip-drivers {:databricks :skip
                                         :snowflake :info
                                         :bigquery :info})))))

(deftest info-driver-runs-but-is-not-skipped
  (testing "an :info driver is NOT in the skip-set, so it follows normal run rules (runs on master)"
    ;; skip-set derived from example-config contains only :databricks
    (let [skip-set (#'mage.modules/skip-drivers {:databricks :skip :snowflake :info})
          result (mage.modules/driver-decision :snowflake
                                               (make-ctx {:is-master-or-release true})
                                               false
                                               skip-set
                                               #{})]
      (is (true? (:should-run result)))
      (is (= "master/release branch" (:reason result))))))

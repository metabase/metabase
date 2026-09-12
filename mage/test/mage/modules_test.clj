(ns mage.modules-test
  "Tests for driver decision logic.
   Run `mage -driver-decisions -h` to see the priority order."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [hooks.common.modules :as modules]
   [mage.color]
   [mage.modules]))

;; Referenced by core_test.clj to ensure namespace is loaded
(def keep-me :loaded)

(defn- make-ctx
  "Create a context map with sensible defaults, overridable by opts."
  [opts]
  (merge {:force-run false
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
;;; Priority 5: Driver's own files changed
;;; =============================================================================

(deftest particular-driver-changes-run-that-driver
  (testing "a driver runs when its own files changed, even with nothing else affected"
    (doseq [driver [:mysql :mongo :snowflake :databricks]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {:particular-driver-changed? #{driver}})
                                                 false   ; driver-deps-affected?
                                                 #{})]   ; updated
        (is (true? (:should-run result))
            (str driver " should run when its own files changed"))
        (is (= "driver files changed" (:reason result)))))))

(deftest driver-directory-names-map-to-test-jobs
  (testing "a driver directory maps to the driver keyword(s) whose jobs it feeds"
    (is (= [:bigquery] (get @#'mage.modules/driver-directory->drivers "bigquery-cloud-sdk"))
        "bigquery-cloud-sdk should map to [:bigquery]")
    (is (= [:mongo :mongo-ssl :mongo-sharded-cluster] (get @#'mage.modules/driver-directory->drivers "mongo"))
        "mongo should map to multiple test jobs")))

;;; =============================================================================
;;; Priority 2: Global skip
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
;;; Priority 3: H2 and Postgres always run
;;; =============================================================================

(deftest h2-and-postgres-always-run
  (testing "H2 and Postgres always run when not globally skipped"
    (doseq [driver [:h2 :postgres]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {:force-run false})
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
;;; Priority 4: ci:run-all-drivers / ci:run-<driver> labels
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
;;; Priority 1: Global force-run
;;; =============================================================================

(deftest force-run-runs-all-drivers
  (testing "All drivers run on a force-run, even when the workflow says skip"
    (doseq [driver [:h2 :postgres :mysql :mongo :athena :bigquery :snowflake]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {:force-run true :skip true})
                                                 false ; even if not affected
                                                 #{})] ; updated
        (is (true? (:should-run result))
            (str driver " should run on a force-run"))
        (is (= "force-run (master/release branch or ci:run-all label)" (:reason result)))))))

;;; =============================================================================
;;; Priority 10: Driver deps affected (self-hosted only)
;;; =============================================================================

(deftest driver-deps-affected-runs-self-hosted-drivers
  (testing "Self-hosted drivers run when driver module is affected"
    ;; H2/Postgres hit priority 3 first, others hit priority 10
    (doseq [driver [:mysql :mongo :oracle :sqlserver]]
      (let [result (mage.modules/driver-decision driver
                                                 (make-ctx {})
                                                 true  ; driver-deps-affected
                                                 #{})] ; updated
        (is (true? (:should-run result))
            (str driver " should run when driver module affected"))
        (is (= "driver module affected by shared code changes" (:reason result)))))))

;;; =============================================================================
;;; Priority 6-9: Cloud driver special rules
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

(deftest modules-can-trigger-cloud-drivers
  (doseq [module '#{query-processor transforms
                    enterprise/transforms enterprise/transforms.python}
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
    ;; H2/Postgres always run (priority 3), so test other self-hosted drivers
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
          ;; 2026-06-04 Bumped to 42 due to run-tracking addition (Zombie transform reaper #75194)
          ;; 2026-06-24 Bumped to 44 for indexes + indexes-rest (Index manager #75848)
          ;; 2026-09-11 Bumped to 47: lib.schema, lib.metadata and query-processor.cache-backend are carved out of
          ;;            lib and query-processor, which already trigger driver tests
          max-allowed-count 47]
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
    (let [changed-file "enterprise/backend/test/metabase_enterprise/transforms_python/api_test.clj"]
      (is (= '#{enterprise/transforms.python}
             (mage.modules/updated-files->updated-modules [changed-file])))
      (is (-> [changed-file]
              mage.modules/updated-files->updated-modules
              mage.modules/driver-deps-affected?)))))

(deftest module-tree-lines-test
  (let [config '{lib                          {}
                 lib.be                       {:ns-prefix "metabase.lib-be"}
                 transforms                   {}
                 transforms.base              {:ns-prefix "metabase.transforms-base"}
                 transforms.base.deep         {}
                 transforms.python            {:ns-prefix "metabase.transforms-python"}
                 enterprise-tools             {}
                 enterprise/transforms        {}
                 enterprise/transforms.python {:ns-prefix "metabase-enterprise.transforms-python"}
                 enterprise/billing           {}}
        lines  (binding [mage.color/*disable-colors* true]
                 (into []
                       (mapcat (fn [[segment node]]
                                 (#'mage.modules/tree-node-lines config false [segment] node)))
                       (#'mage.modules/sorted-children (#'mage.modules/module-display-tree config))))]
    (testing "the tree sorts and marks modules with custom prefixes"
      (is (= ["enterprise-tools"
              "lib"
              "- lib.be *"
              "transforms"
              "- transforms.base *"
              "-- transforms.base.deep"
              "- transforms.python *"
              "- transforms.enterprise"
              "-- transforms.enterprise.python *"
              "enterprise/billing"]
             lines)))))

(deftest module-tree-enterprise-default-prefix-not-starred-test
  (testing "default enterprise prefixes are not marked as custom"
    (is (nil? (#'mage.modules/explicit-ns-prefix '{enterprise/billing {}} 'enterprise/billing)))
    (is (nil? (#'mage.modules/explicit-ns-prefix '{enterprise/billing {:ns-prefix "metabase-enterprise.billing"}}
                                                 'enterprise/billing)))
    (is (= "metabase.lib-be"
           (#'mage.modules/explicit-ns-prefix '{lib.be {:ns-prefix "metabase.lib-be"}} 'lib.be)))))

(deftest dotted-module-files-mark-correct-module-changes
  (testing "dotted module files resolve to the dotted module when its prefix exists"
    (let [prefix->module (modules/build-prefix->module {'lib.schema {}})]
      (is (= 'lib.schema
             (#'mage.modules/file->module prefix->module "test/metabase/lib/schema_test.cljc")))
      (is (= 'lib.schema
             (#'mage.modules/file->module prefix->module "src/metabase/lib/schema/config.edn"))))))

(deftest top-level-files-belong-only-to-declared-modules-test
  (testing "a file directly under metabase/ belongs to a module only when a declared prefix owns its namespace"
    (let [prefix->module (modules/build-prefix->module '{driver {}})]
      (is (= 'driver (#'mage.modules/file->module prefix->module "src/metabase/driver.clj")))
      (is (nil? (#'mage.modules/file->module prefix->module "test/metabase/test_runner.clj")))
      (is (nil? (#'mage.modules/file->module prefix->module "src/metabase/DO_NOT_ADD_NEW_FILES_HERE.txt"))))))

;;; =============================================================================
;;; CODEOWNERS generation
;;; =============================================================================

(deftest codeowners-stanza-active-test
  (testing "a module whose team has an :assignee and no suppression gets live owner lines"
    (is (= ["# lib (Querying Platform)"
            "src/metabase/lib @metabase/qp"
            "test/metabase/lib @metabase/qp"]
           (#'mage.modules/codeowners-stanza-lines
            {:module 'lib :team "Querying Platform" :handle "@metabase/qp" :suppress? false
             :dirs ["src/metabase/lib" "test/metabase/lib"]})))))

(deftest codeowners-stanza-suppressed-test
  (testing "a suppressed module is commented out but keeps its known handle, ready to uncomment"
    (is (= ["# driver (Querying Platform, suppressed via :suppress-codeowners)"
            "# src/metabase/driver @metabase/qp"]
           (#'mage.modules/codeowners-stanza-lines
            {:module 'driver :team "Querying Platform" :handle "@metabase/qp" :suppress? true
             :dirs ["src/metabase/driver"]})))))

(deftest codeowners-stanza-no-assignee-test
  (testing "a module whose team has no :assignee is commented out with no handle"
    (is (= ["# audit-app (UX West, no :assignee in team.json)"
            "# enterprise/backend/src/metabase_enterprise/audit_app"]
           (#'mage.modules/codeowners-stanza-lines
            {:module 'enterprise/audit-app :team "UX West" :handle nil :suppress? false
             :dirs ["enterprise/backend/src/metabase_enterprise/audit_app"]})))))

(deftest codeowners-stanza-no-dirs-test
  (testing "a module that owns no existing directory produces no stanza"
    (is (nil? (#'mage.modules/codeowners-stanza-lines
               {:module 'ghost :team "UX West" :handle nil :suppress? false :dirs []})))))

(deftest codeowners-splice-idempotent-test
  (testing "splicing a block in replaces only the marked region and is idempotent"
    (let [begin @#'mage.modules/codeowners-begin-marker
          end   @#'mage.modules/codeowners-end-marker
          splice @#'mage.modules/splice-codeowners
          block (str begin "\nfoo/bar @team\n" end)
          base  "# hand-maintained\ndocs @writers\n"
          once  (splice base block)
          twice (splice once block)]
      (is (str/includes? once "# hand-maintained"))
      (is (str/includes? once "foo/bar @team"))
      (is (= once twice))))
  (testing "text on BOTH sides of the marked region survives, with the block still between them"
    ;; This is the normal layout: the generated block sits above the hand-maintained rules, so the
    ;; trailing-content branch of the in-place splice is load-bearing. The idempotence case above
    ;; leaves an empty tail and would not notice it being dropped.
    (let [begin  @#'mage.modules/codeowners-begin-marker
          end    @#'mage.modules/codeowners-end-marker
          splice @#'mage.modules/splice-codeowners
          base   (str "# header\n" begin "\nold/path @old\n" end "\n\n# exceptions\nsrc/a.clj @owner\n")
          block  (str begin "\nnew/path @new\n" end)
          out    (splice base block)]
      (is (str/includes? out "# header") "leading content survives")
      (is (str/includes? out "src/a.clj @owner") "trailing content survives")
      (is (str/includes? out "new/path @new") "the block was replaced")
      (is (not (str/includes? out "old/path @old")) "the previous block is gone")
      (is (< (str/index-of out "# header")
             (str/index-of out "new/path @new")
             (str/index-of out "src/a.clj @owner"))
          "and the block still sits between the two")
      (is (= out (splice out block)) "still idempotent with content on both sides"))))

(deftest codeowners-block-orders-children-after-parents
  (testing (str "Stanzas sort by source path so a nested child's dirs come after its parent's. "
                "CODEOWNERS applies the LAST matching pattern, so reversing this would let the "
                "parent's module-wide rule swallow its child's ownership.")
    ;; `lib` and `lib.schema` are used because the generator only emits directories that exist on
    ;; disk, so an invented nested path would silently drop its stanza and the ordering assertion
    ;; would pass on a one-element list.
    (let [config    '{lib        {:team "Querying Platform"}
                      lib.schema {:team "Querying Platform"}}
          assignees {"Querying Platform" "@metabase/querying-platform"}
          block     (#'mage.modules/codeowners-block config assignees)
          lines     (->> (str/split-lines block)
                         (filter #(str/starts-with? % "src/metabase/lib")))]
      (is (= 2 (count lines)) "both parent and child stanzas are emitted")
      (is (= ["src/metabase/lib @metabase/querying-platform"
              "src/metabase/lib/schema @metabase/querying-platform"]
             lines)))))

(deftest codeowners-block-comments-out-unknown-teams
  (testing (str "A module whose :team has no matching team.json entry degrades to a commented "
                "stanza rather than emitting a bad handle or being dropped silently.")
    (let [config    '{lib {:team "Nonexistent Team"}}
          block     (#'mage.modules/codeowners-block config {"Querying Platform" "@metabase/querying-platform"})
          src-lines (->> (str/split-lines block)
                         (filter #(str/includes? % "src/metabase/lib")))]
      (is (seq src-lines) "the module still appears in the block")
      (is (every? #(str/starts-with? % "#") src-lines)
          "but every one of its path lines is commented out"))))

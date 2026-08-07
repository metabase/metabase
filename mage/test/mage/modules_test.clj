(ns mage.modules-test
  "Tests for driver decision logic.
   Run `mage -driver-decisions -h` to see the priority order."
  (:require
   [clojure.edn :as edn]
   [clojure.test :refer [deftest is testing]]
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
                    enterprise/transforms enterprise/transforms-python}
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

(defn- modules-affecting-drivers []
  (let [deps (mage.modules/dependencies)
        all (keys deps)]
    (filter #(mage.modules/driver-deps-affected? [%]) all)))

(deftest module-graph-may-not-become-more-connected
  (testing "The number of top-level modules that trigger driver tests should not increase without explicit approval.
            If this test fails, you've likely connected a module to driver that shouldn't trigger driver tests.
            Add it to driver-affecting-overrides if it shouldn't trigger driver tests."
    ;; A module that transitively depends on driver code makes a change to it run ALL driver tests, which
    ;; is expensive. The budget lives in ratchets.edn next to :driver-test-exempt-modules, because the two
    ;; move against each other: exempting a module lowers this and raises the exemption count, and dropping
    ;; an exemption does the reverse. Reading either alone is how you talk yourself into paying for CI you
    ;; did not mean to.
    ;;
    ;; Counted per module, not per top-level subtree. Collapsing to top-level ancestors would report
    ;; nesting the -rest layer as a 46 -> 33 improvement while the same 696 namespaces still trigger, so
    ;; module-stats.edn carries :driver-test-triggering-namespaces for the number that holds still. The
    ;; cost of counting modules is that splitting a triggering module needs a hand edit here, with a
    ;; reason in the commit.
    (let [modules-triggering-drivers (modules-affecting-drivers)
          max-allowed-count          (:driver-test-triggering-modules
                                      (edn/read-string
                                       (slurp ".clj-kondo/config/modules/ratchets.edn")))]
      (is (<= (count modules-triggering-drivers) max-allowed-count)
          (format "Too many modules trigger driver tests! Expected <= %d, got %d.
                   Modules triggering driver tests: %s
                   If this is intentional, raise :driver-test-triggering-modules in
                   .clj-kondo/config/modules/ratchets.edn and say why in the commit message.
                   Otherwise, add the new module(s) to :exempt-modules in driver-test-overrides.edn."
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

(deftest module-tree-sorts-enterprise-last
  (testing "siblings are alphabetical, except enterprise modules sort after everything else"
    (let [config {'queries {} 'enterprise/audit {} 'actions {} 'enterprise/sso {} 'util {}}
          tree   (#'mage.modules/module-display-tree config)
          lines  (binding [mage.color/*disable-colors* true]
                   (into []
                         (mapcat (fn [[segment node]]
                                   (#'mage.modules/tree-node-lines config false [segment] node)))
                         (#'mage.modules/sorted-children tree)))]
      (is (= ["actions" "queries" "util" "enterprise/audit" "enterprise/sso"]
             lines)))))

(deftest module-tree-lines-test
  (let [config '{lib                  {}
                 lib.be               {:ns-prefix "metabase.lib-be"}
                 transforms           {}
                 transforms.base      {:ns-prefix "metabase.transforms-base"}
                 transforms.base.deep {}
                 transforms.python    {:ns-prefix "metabase.transforms-python"}
                 enterprise-tools     {}
                 enterprise/transforms {}
                 enterprise/transforms.python {:ns-prefix "metabase-enterprise.transforms-python"}
                 enterprise/billing   {}}
        tree   (#'mage.modules/module-display-tree config)
        lines  (binding [mage.color/*disable-colors* true]
                 (into []
                       (mapcat (fn [[segment node]]
                                 (#'mage.modules/tree-node-lines config false [segment] node)))
                       (#'mage.modules/sorted-children tree)))]
    (testing "alphabetical roots, enterprise last among siblings, dotted display names, stars on :ns-prefix"
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
  (testing "the implicit metabase-enterprise. prefix is canonical, and so is an explicit :ns-prefix equal to the default"
    (is (nil? (#'mage.modules/explicit-ns-prefix '{enterprise/billing {}} 'enterprise/billing)))
    (is (nil? (#'mage.modules/explicit-ns-prefix '{enterprise/billing {:ns-prefix "metabase-enterprise.billing"}}
                                                 'enterprise/billing)))
    (is (= "metabase.lib-be"
           (#'mage.modules/explicit-ns-prefix '{lib.be {:ns-prefix "metabase.lib-be"}} 'lib.be)))))

(deftest dotted-module-exact-test-files-mark-correct-module-changes
  (testing "module-level dotted test files resolve back to the dotted module when a dotted prefix exists"
    (let [build-prefix->module @#'mage.modules/build-prefix->module
          file->module         @#'mage.modules/file->module
          prefix->module       (build-prefix->module {'lib.schema {}})]
      (is (= 'lib.schema
             (file->module prefix->module
                           "test/metabase/lib/schema_test.cljc"))))))

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
      (is (= once twice)))))

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
          lines     (->> (clojure.string/split-lines block)
                         (filter #(clojure.string/starts-with? % "src/metabase/lib")))]
      (is (= 2 (count lines)) "both parent and child stanzas are emitted")
      (is (= ["src/metabase/lib @metabase/querying-platform"
              "src/metabase/lib/schema @metabase/querying-platform"]
             lines)))))

(deftest codeowners-block-comments-out-unknown-teams
  (testing (str "A module whose :team has no matching team.json entry degrades to a commented "
                "stanza rather than emitting a bad handle or being dropped silently.")
    (let [config    '{lib {:team "Nonexistent Team"}}
          block     (#'mage.modules/codeowners-block config {"Querying Platform" "@metabase/querying-platform"})
          src-lines (->> (clojure.string/split-lines block)
                         (filter #(clojure.string/includes? % "src/metabase/lib")))]
      (is (seq src-lines) "the module still appears in the block")
      (is (every? #(clojure.string/starts-with? % "#") src-lines)
          "but every one of its path lines is commented out"))))

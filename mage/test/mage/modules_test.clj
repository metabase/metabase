(ns mage.modules-test
  "Tests for driver decision logic.
   Run `mage -driver-decisions -h` to see the priority order."
  (:require
   [babashka.fs :as fs]
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing]]
   [dev.module-cycle-names :as cycle-names]
   [dev.module-explorer :as module-explorer]
   [hooks.common.modules :as modules]
   [mage.color]
   [mage.modules]))

(set! *warn-on-reflection* true)

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
          ;; 2026-10-01 Bumped to 48: parameters.schema is carved out of parameters, which already triggers driver tests
          max-allowed-count 48]
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
    (is (nil? (module-explorer/explicit-ns-prefix '{enterprise/billing {}} 'enterprise/billing)))
    (is (nil? (module-explorer/explicit-ns-prefix '{enterprise/billing {:ns-prefix "metabase-enterprise.billing"}}
                                                  'enterprise/billing)))
    (is (= "metabase.lib-be"
           (module-explorer/explicit-ns-prefix '{lib.be {:ns-prefix "metabase.lib-be"}} 'lib.be)))))

(deftest explorer-data-test
  (let [config '{core                 {:uses :any, :team "Core"}
                 widget               {:uses #{gadget}, :api #{metabase.widget.core}}
                 gadget               {:uses #{}, :team "Gadgets", :ns-prefix "metabase.gizmo"}
                 gadget.part          {:uses #{gadget}}
                 enterprise/gadget    {:uses #{gadget}}
                 enterprise/cloud     {:uses #{}}}
        modules (into {} (map (juxt :id identity)) (:modules (module-explorer/explorer-data config {})))]
    (testing ":uses :any remains unresolved without source data"
      (is (empty? (get-in modules ["core" :uses])))
      (is (= ["enterprise/gadget" "gadget.part" "widget"]
             (get-in modules ["gadget" :used-by]))))
    (testing "teams are inherited from the nearest ancestor"
      (is (= "Gadgets" (get-in modules ["gadget.part" :team])))
      (is (= "Gadgets" (get-in modules ["enterprise/gadget" :team]))))
    (testing "tree paths nest children and keep enterprise companions under their OSS module"
      (is (= ["gadget" "part"] (get-in modules ["gadget.part" :path])))
      (is (= ["gadget" "enterprise"] (get-in modules ["enterprise/gadget" :path])))
      (is (= ["enterprise/cloud"] (get-in modules ["enterprise/cloud" :path]))))
    (testing "only custom prefixes are reported"
      (is (= "metabase.gizmo" (get-in modules ["gadget" :ns-prefix])))
      (is (nil? (get-in modules ["widget" :ns-prefix]))))
    (testing "an omitted :api uses the same defaults as the module linter"
      (is (= ["metabase.gizmo.api" "metabase.gizmo.core" "metabase.gizmo.init"]
             (get-in modules ["gadget" :api]))))))

(deftest explorer-data-with-namespace-edges-test
  (let [config '{core   {:uses :any}
                 widget {:uses #{gadget}}
                 gadget {:uses #{}}}
        edges  [["core" "gadget" "metabase.gadget.core"]
                ["widget" "gadget" "metabase.gadget.core"]]
        modules (into {}
                      (map (juxt :id identity))
                      (:modules (module-explorer/explorer-data config {:ns-edges edges})))]
    (testing "observed namespace edges resolve unrestricted and reverse dependencies"
      (is (= ["gadget"] (get-in modules ["core" :uses])))
      (is (= ["core" "widget"] (get-in modules ["gadget" :used-by]))))))

(deftest explorer-data-cycles-test
  (let [config '{a {:uses #{b}}
                 b {:uses #{a c}}
                 c {:uses #{b}}
                 d {:uses #{a}}}
        {:keys [modules cycles]} (module-explorer/explorer-data config {})
        modules                  (into {} (map (juxt :id identity)) modules)]
    (testing "cycles carry their metrics and string members"
      (is (= [{:size           3
               :edges          4
               :density        (double (/ 4 6))
               :cycle-rank     2
               :modules        ["a" "b" "c"]
               :name           nil
               :strong-bridges [["a" "b"] ["b" "a"] ["b" "c"] ["c" "b"]]}]
             cycles)))
    (testing "only modules in a cycle carry its index"
      (is (= 0 (get-in modules ["b" :cycle])))
      (is (not (contains? (get modules "d") :cycle))))))

(deftest explorer-cycle-name-test
  (let [anchors '{deep-thought metabot, tardis lib, stargate api-routes}]
    (testing "a cycle takes the name anchored in it"
      (is (= "tardis" (#'module-explorer/cycle-name anchors '[lib lib.schema]))))
    (testing "a cycle holding two anchors shows both names"
      (is (= "deep-thought + tardis" (#'module-explorer/cycle-name anchors '[lib metabot]))))
    (testing "a cycle without an anchor, or with no names to read, has no name"
      (is (nil? (#'module-explorer/cycle-name anchors '[sync])))
      (is (nil? (#'module-explorer/cycle-name nil '[lib]))))))

(deftest explorer-cycle-anchors-fallback-test
  (let [file (java.io.File/createTempFile "cycle-clusters" ".edn")]
    (try
      (testing "the names file loads under Babashka"
        (spit file "{tardis lib}")
        (with-redefs [cycle-names/clusters-file (str file)]
          (is (= '{tardis lib} (#'module-explorer/cycle-anchors)))))
      (testing "an invalid or missing names file leaves the cycles unnamed"
        (spit file "{tardis lib} {stargate api-routes}")
        (with-redefs [cycle-names/clusters-file (str file)]
          (is (nil? (#'module-explorer/cycle-anchors))))
        (with-redefs [cycle-names/clusters-file "no/such/cycle-clusters.edn"]
          (is (nil? (#'module-explorer/cycle-anchors)))))
      (finally (.delete file)))))

(deftest explorer-file-requires-test
  (let [file (java.io.File/createTempFile "requires" ".cljc")]
    (try
      (spit file (str "(ns metabase.widget.core\n"
                      "  (:require\n"
                      "   [metabase.gadget.core :as gadget]\n"
                      "   [metabase.lib [core :as lib] schema]\n"
                      "   #?(:clj [metabase.server.core] :cljs [metabase.frontend.core]))\n"
                      "  (:use metabase.util))\n"))
      (testing "requires and uses are read as Clojure, with prefix lists expanded"
        (is (= '#{metabase.gadget.core metabase.lib.core metabase.lib.schema metabase.server.core metabase.util}
               (#'module-explorer/file-requires (str file)))))
      (finally (.delete file)))))

(deftest explorer-any-uses-test
  (let [config '{core   {:uses :any}
                 gadget {}
                 widget {}}
        dir    (doto (java.io.File/createTempFile "any-uses" "") (.delete) (.mkdirs))
        source (fn [path ns-form]
                 (let [file (io/file dir path)]
                   (io/make-parents file)
                   (spit file (pr-str ns-form))
                   (str file)))
        clj    (source "src/core/init.clj" '(ns metabase.core.init (:require
                                                                    [metabase.widget.core] [metabase.core.util])))
        tst    (source "test/core/init_test.clj" '(ns metabase.core.init-test (:require [metabase.gadget.core])))
        cljs   (source "src/core/ui.cljs" '(ns metabase.core.ui (:require [metabase.gadget.core])))]
    (try
      (testing "a :uses :any module gets the modules its sources require, not its tests, ClojureScript, or itself"
        (is (= '{core #{widget}}
               (#'module-explorer/any-uses config {clj 'core, tst 'core, cljs 'core}))))
      (finally (run! io/delete-file (reverse (file-seq dir)))))))

(deftest explorer-resolved-any-uses-test
  (let [config '{core   {:uses :any}
                 widget {:uses #{core}}
                 gadget {:uses #{}}}]
    (testing "resolved requires stand in for :uses :any, which still marks the module"
      (is (= '{core #{widget gadget}, widget #{core}, gadget #{}}
             (#'module-explorer/build-module->uses config nil '{core #{widget gadget}})))
      (is (true? (:uses-any (#'module-explorer/module-node config {} {} 'core)))))
    (testing "an unresolved :uses :any has no dependencies"
      (is (= #{} (get (#'module-explorer/build-module->uses config nil nil) 'core))))))

(deftest explorer-file->module-test
  (let [file->module   #'module-explorer/file->module
        prefix->module (modules/build-prefix->module '{lib {} lib.schema {} driver {}})]
    (testing "files resolve through the declared prefixes, tests included"
      (is (= 'lib.schema (file->module prefix->module "src/metabase/lib/schema/join.cljc")))
      (is (= 'lib.schema (file->module prefix->module "test/metabase/lib/schema_test.cljc")))
      (is (= 'lib (file->module prefix->module "src/metabase/lib/core.cljc"))))
    (testing "driver-plugin files belong to the driver module regardless of namespace"
      (is (= 'driver (file->module prefix->module "modules/drivers/mysql/src/metabase/driver/mysql.clj")))
      (is (= 'driver (file->module prefix->module "modules/drivers/mysql/test/metabase/test/data/mysql.clj"))))))

(deftest explorer-page-test
  (let [html (module-explorer/page {:modules [{:id "</script>"}]})]
    (testing "the data and state codec replace their placeholders"
      (is (not (str/includes? html "/*DATA*/null")))
      (is (not (str/includes? html "/*STATE-CODEC*/")))
      (is (str/includes? html "<\\/script>")))))

(deftest explorer-git-failure-test
  (is (thrown-with-msg? Exception #"Git failed:"
                        (#'module-explorer/git-output! "not-a-real-git-subcommand"))))

(deftest explorer-state-codec-test
  (let [{:keys [exit out err]} (shell/sh "node" "mage/test/mage/module_explorer_state_test.js")]
    (is (zero? exit) (str out err))))

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

(def ^:private test-team->codeowner
  {"Querying Platform" "@metabase/querying-platform"
   "UX West"           "@metabase/ux-west"})

(defn- entries
  "Block entries the generator builds for `modules-config`."
  [modules-config]
  (#'mage.modules/codeowners-entries modules-config test-team->codeowner))

(defn- owners
  "`[module handle]` for each block entry for `modules-config`, in block order."
  [modules-config]
  (mapv (juxt :module :handle) (entries modules-config)))

(deftest codeowners-entries-test
  (testing "only modules that set :codeowners true get entries, covering their directories and root files"
    (is (= [{:module    'lib
             :src-dir   "src/metabase/lib"
             :team      "Querying Platform"
             :handle    "@metabase/querying-platform"
             :opted-in? true
             :patterns  ["src/metabase/lib" "src/metabase/lib.*" "test/metabase/lib" "test/metabase/lib_test.*"]}]
           (entries '{lib             {:team "Querying Platform", :codeowners true}
                      query-processor {:team "Querying Platform"}}))))
  (testing "enterprise modules own their enterprise/backend code"
    (is (= ["enterprise/backend/src/metabase_enterprise/sso"
            "enterprise/backend/src/metabase_enterprise/sso.*"
            "enterprise/backend/test/metabase_enterprise/sso"
            "enterprise/backend/test/metabase_enterprise/sso_test.*"]
           (mapcat :patterns (entries '{enterprise/sso {:team "Querying Platform", :codeowners true}})))))
  (testing "any value other than true does not opt in"
    (is (= []
           (owners '{lib {:team "Querying Platform", :codeowners :test}}))))
  (testing "a nested module without its own :team takes its ancestor's"
    (is (= [['lib.schema "@metabase/querying-platform"]]
           (owners '{lib        {:team "Querying Platform"}
                     lib.schema {:codeowners true}})))))

(deftest codeowners-entries-nested-test
  ;; CODEOWNERS applies the last matching pattern, so an entry inside another module's directory must follow it.
  (testing "a nested module of the same team that opts in follows its parent"
    (is (= [['lib "@metabase/querying-platform"]
            ['lib.schema "@metabase/querying-platform"]]
           (owners '{lib.schema {:team "Querying Platform", :codeowners true}
                     lib        {:team "Querying Platform", :codeowners true}}))))
  (testing "a nested module of the same team that does not opt in needs no entry"
    (is (= [['lib "@metabase/querying-platform"]]
           (owners '{lib        {:team "Querying Platform", :codeowners true}
                     lib.schema {:team "Querying Platform"}}))))
  (testing "a nested module of another team that does not opt in is left unowned"
    (is (= [['lib "@metabase/querying-platform"]
            ['lib.schema nil]]
           (owners '{lib        {:team "Querying Platform", :codeowners true}
                     lib.schema {:team "UX West"}}))))
  (testing "a nested module of another team that opts in keeps its own team"
    (is (= [['lib "@metabase/querying-platform"]
            ['lib.schema "@metabase/ux-west"]]
           (owners '{lib        {:team "Querying Platform", :codeowners true}
                     lib.schema {:team "UX West", :codeowners true}})))))

(deftest codeowners-entries-deep-nesting-test
  (testing "a grandchild that inherits the team of an opted-in nested module needs no entry"
    (is (= [['lib "@metabase/querying-platform"]
            ['lib.schema "@metabase/ux-west"]]
           (owners '{lib             {:team "Querying Platform", :codeowners true}
                     lib.schema      {:team "UX West", :codeowners true}
                     lib.schema.util {}}))))
  (testing "a grandchild inside another team's opted-in module keeps an outer opted-in module of its team"
    (is (= [['lib "@metabase/querying-platform"]
            ['lib.schema "@metabase/ux-west"]
            ['lib.schema.util "@metabase/querying-platform"]]
           (owners '{lib             {:team "Querying Platform", :codeowners true}
                     lib.schema      {:team "UX West", :codeowners true}
                     lib.schema.util {:team "Querying Platform"}}))))
  (testing "a grandchild of the owning team inside an unowned module gets that team back"
    (is (= [['lib "@metabase/querying-platform"]
            ['lib.schema nil]
            ['lib.schema.util "@metabase/querying-platform"]]
           (owners '{lib             {:team "Querying Platform", :codeowners true}
                     lib.schema      {:team "UX West"}
                     lib.schema.util {:team "Querying Platform"}}))))
  (testing "a module inside an unowned module of its own team stays unowned, with no entry of its own"
    (is (= [['lib "@metabase/querying-platform"]
            ['lib.a nil]]
           (owners '{lib     {:team "Querying Platform", :codeowners true}
                     lib.a   {:team "UX West"}
                     lib.a.b {:team "UX West"}}))))
  (testing "a deep chain alternates between teams, with a team that never opted in left unowned"
    (is (= [['lib "@metabase/querying-platform"]
            ['lib.a "@metabase/ux-west"]
            ['lib.a.b nil]
            ['lib.a.b.c "@metabase/ux-west"]
            ['lib.a.b.c.d "@metabase/querying-platform"]]
           (owners '{lib         {:team "Querying Platform", :codeowners true}
                     lib.a       {:team "UX West", :codeowners true}
                     lib.a.b     {:team "Gadget"}
                     lib.a.b.c   {:team "UX West"}
                     lib.a.b.c.d {:team "Querying Platform"}})))))

(deftest codeowners-config-problems-test
  (let [problems (fn [config source? & [team->codeowner]]
                   (vec (#'mage.modules/codeowners-config-problems
                         config (or team->codeowner test-team->codeowner) source?)))]
    (testing "a valid config has none"
      (is (= []
             (problems '{lib {:team "Querying Platform", :codeowners true}} (constantly true)))))
    (testing "every problem of a module is reported in one run"
      (is (= [{:type :unknown-value, :module 'lib, :value :test}
              {:type :no-codeowner, :module 'lib, :team "Gadget"}
              {:type :no-source, :module 'lib, :src-dir "src/metabase/lib"}]
             (problems '{lib {:team "Gadget", :codeowners :test}} (constantly false)))))
    (testing "a team whose codeowner is not one GitHub handle is reported once, naming its modules"
      (doseq [value [""
                     "metabase/metabot"
                     "@"
                     "@metabase/"
                     "@metabase/metabot @metabase/other"
                     "@metabase/ux west"
                     "@metabase/metabot\n* @metabase/other"
                     42]]
        (is (= [{:type :bad-codeowner, :team "Gadget", :value value, :modules ['lib 'lib.schema]}]
               (problems '{lib        {:team "Gadget", :codeowners true}
                           lib.schema {:codeowners true}}
                         (constantly true)
                         {"Gadget" value})))))
    (testing "user and team handles are valid"
      (doseq [value ["@someone" "@metabase/metabot" "@metabase/ux.west_2"]]
        (is (= []
               (problems '{lib {:team "Gadget", :codeowners true}} (constantly true) {"Gadget" value})))))
    (testing "modules that do not set :codeowners are not checked"
      (is (= []
             (problems '{lib {:team "Gadget"}} (constantly false)))))))

(deftest codeowners-has-source-test
  (let [has-source? #'mage.modules/has-source?
        root        (str (fs/create-temp-dir))]
    (try
      (fs/create-dirs (str root "/src/metabase/actions"))
      (spit (str root "/src/metabase/args.clj") "(ns metabase.args)")
      (testing "a module directory counts"
        (is (has-source? (str root "/src/metabase/actions"))))
      (testing "a root namespace file without a directory counts"
        (is (has-source? (str root "/src/metabase/args"))))
      (testing "neither does not"
        (is (not (has-source? (str root "/src/metabase/no_such_module")))))
      (finally
        (fs/delete-tree root)))))

(deftest codeowners-shadowed-lines-test
  (let [begin    @#'mage.modules/codeowners-begin-marker
        shadowed #(#'mage.modules/shadowed-lines % ["src/metabase/lib" "src/metabase/lib.*"])]
    (testing "rule lines above the block inside an owned path are reported"
      (is (= ["src/metabase/lib/util.clj @metabase/other"
              "/src/metabase/lib.cljc @metabase/other"]
             (shadowed (str "src/metabase/lib/util.clj @metabase/other\n"
                            "/src/metabase/lib.cljc @metabase/other\n"
                            begin "\n")))))
    (testing "broader, neighbouring, commented and below-the-block lines are not"
      (is (= []
             (shadowed (str "src/metabase @metabase/other\n"
                            "src/metabase/lib_be @metabase/other\n"
                            "src/metabase/lib.cljc.bak/x @metabase/other\n"
                            "# src/metabase/lib/util.clj @metabase/other\n"
                            begin "\n"
                            "src/metabase/lib/util.clj @metabase/other\n")))))))

(deftest codeowners-markers-problem-test
  (let [begin   @#'mage.modules/codeowners-begin-marker
        end     @#'mage.modules/codeowners-end-marker
        problem #'mage.modules/markers-problem]
    (testing "no markers, or one of each in order, is fine"
      (is (nil? (problem "docs @writers\n")))
      (is (nil? (problem (str begin "\n" end "\n")))))
    (testing "a missing, repeated or misordered marker is a problem"
      (doseq [existing [(str "# header\n" begin "\nsrc/a.clj @owner\n")
                        (str "src/a.clj @owner\n" end "\n")
                        (str end "\nsrc/a.clj @owner\n" begin "\n")
                        (str begin "\nnew/path @new\n" end "\n" begin "\nold/path @old\n" end "\n")]]
        (is (= :broken-markers (:type (problem existing))))))))

(deftest codeowners-file-problems-test
  (let [begin    @#'mage.modules/codeowners-begin-marker
        end      @#'mage.modules/codeowners-end-marker
        problems #(#'mage.modules/codeowners-file-problems % (entries '{lib {:team       "Querying Platform"
                                                                             :codeowners true}}))]
    (testing "a file with nothing above the block inside an owned path has none"
      (is (empty? (problems "docs @writers\n"))))
    (testing "a line above the block inside an owned path is a problem"
      (is (= [{:type :shadowed-lines, :lines ["src/metabase/lib/x.clj @metabase/other"]}]
             (problems "src/metabase/lib/x.clj @metabase/other\n"))))
    (testing "lines are not checked while the markers are broken"
      (is (= [:broken-markers]
             (map :type (problems (str "src/metabase/lib @metabase/querying-platform\n" end "\n"))))))
    (testing "a well-formed block's own lines are not shadowed lines"
      (is (empty? (problems (str begin "\nsrc/metabase/lib @metabase/querying-platform\n" end "\n")))))))

(deftest codeowners-outcome-test
  (let [outcome (fn [existing config check?]
                  (#'mage.modules/codeowners-outcome existing config test-team->codeowner (constantly true) check?))
        config  '{lib {:team "Querying Platform", :codeowners true}}
        written (str "docs @writers\n\n"
                     (#'mage.modules/codeowners-block
                      [{:module    'lib
                        :team      "Querying Platform"
                        :handle    "@metabase/querying-platform"
                        :opted-in? true
                        :patterns  ["src/metabase/lib"
                                    "src/metabase/lib.*"
                                    "test/metabase/lib"
                                    "test/metabase/lib_test.*"]}])
                     "\n")]
    (testing "a file without the block gets it appended"
      (is (= {:status :write, :desired written}
             (outcome "docs @writers\n" config false))))
    (testing "an up-to-date file is left alone, with or without --check"
      (is (= {:status :up-to-date} (outcome written config false)))
      (is (= {:status :up-to-date} (outcome written config true))))
    (testing "--check reports a stale file instead of writing it"
      (is (= {:status :stale} (outcome "docs @writers\n" config true))))
    (testing "problems stop the write, with or without --check"
      (doseq [check? [false true]]
        (is (= {:status   :problems
                :problems [{:type :no-codeowner, :module 'lib, :team "Gadget"}]}
               (outcome "docs @writers\n" '{lib {:team "Gadget", :codeowners true}} check?)))))
    (testing "config and file problems are reported together"
      (is (= [{:type :no-codeowner, :module 'lib, :team "Gadget"}
              {:type :shadowed-lines, :lines ["src/metabase/lib/x.clj @metabase/other"]}]
             (:problems (outcome "src/metabase/lib/x.clj @metabase/other\n"
                                 '{lib {:team "Gadget", :codeowners true}}
                                 false)))))
    (testing "config problems and broken markers are reported together"
      (is (= [:no-codeowner :broken-markers]
             (map :type (:problems (outcome (str @#'mage.modules/codeowners-begin-marker "\n")
                                            '{lib {:team "Gadget", :codeowners true}}
                                            false))))))
    (testing "a module with an unknown value is left out of the shadowed-line check"
      (is (= [{:type :unknown-value, :module 'lib, :value :test}]
             (:problems (outcome "src/metabase/lib/x.clj @metabase/other\n"
                                 '{lib {:team "Querying Platform", :codeowners :test}}
                                 false)))))))

(deftest codeowners-problem-message-test
  (testing "each problem names what is wrong and what to do"
    (are [problem expected] (str/includes? (#'mage.modules/codeowners-problem-message problem) expected)
      {:type :unknown-value, :module 'lib, :value :test}                 "lib sets :codeowners to :test. Use true"
      {:type :no-codeowner, :module 'lib, :team "Gadget"}                "its team \"Gadget\" has no \"codeowner\""
      {:type :bad-codeowner, :team "Gadget", :value "", :modules ['lib]} "so that lib can opt in"
      {:type :no-source, :module 'lib, :src-dir "src/metabase/lib"}      "has no code at src/metabase/lib."
      {:type :shadowed-lines, :lines ["a/b.clj @x"]}                     "Move them below the END marker:\n  a/b.clj @x"
      {:type :broken-markers, :begin 0, :end nil}                        "Fix the markers by hand.")))

(deftest codeowners-stanza-lines-test
  (testing "a header naming the module and team, then one owner line per pattern"
    (is (= ["# lib (Querying Platform)"
            "src/metabase/lib @metabase/qp"
            "src/metabase/lib.* @metabase/qp"]
           (#'mage.modules/codeowners-stanza-lines
            {:module    'lib
             :team      "Querying Platform"
             :handle    "@metabase/qp"
             :opted-in? true
             :patterns  ["src/metabase/lib" "src/metabase/lib.*"]}))))
  (testing "an unowned entry has no handle, and its header says it did not opt in"
    (is (= ["# lib.schema (UX West, not opted in)"
            "src/metabase/lib/schema"
            "src/metabase/lib/schema.*"]
           (#'mage.modules/codeowners-stanza-lines
            {:module    'lib.schema
             :team      "UX West"
             :handle    nil
             :opted-in? false
             :patterns  ["src/metabase/lib/schema" "src/metabase/lib/schema.*"]})))))

(deftest codeowners-splice-test
  (let [begin  @#'mage.modules/codeowners-begin-marker
        end    @#'mage.modules/codeowners-end-marker
        splice @#'mage.modules/splice-codeowners
        block  (str begin "\nnew/path @new\n" end)]
    (testing "a file without markers gets the block appended"
      (is (= (str "docs @writers\n\n" block "\n")
             (splice "docs @writers\n" block))))
    (testing "the marked region is replaced, keeping the text on both sides"
      (let [existing (str "# header\n\n" begin "\nold/path @old\n" end "\n\n# exceptions\nsrc/a.clj @owner\n")
            out      (splice existing block)]
        (is (= (str "# header\n\n" block "\n\n# exceptions\nsrc/a.clj @owner\n")
               out))
        (is (= out (splice out block))
            "splicing again changes nothing")))
    (testing "broken markers throw instead of splicing at the wrong place"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"has a broken generated block"
                            (splice (str "src/a.clj @owner\n" end "\n") block))))))

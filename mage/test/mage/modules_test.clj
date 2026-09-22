(ns mage.modules-test
  "Tests for the module graph and the driver analysis built on it.
   Run `mage -driver-analysis -h` to see what the analysis reports."
  (:require
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [dev.module-explorer :as module-explorer]
   [hooks.common.modules :as modules]
   [mage.color]
   [mage.modules]))

;; Referenced by core_test.clj to ensure namespace is loaded
(def keep-me :loaded)

;;; =============================================================================
;;; Driver analysis: the facts the CI gate decides on
;;;
;;; What CI does with them lives in .github/scripts/gate/drivers.ts, and is tested there.
;;; =============================================================================

(deftest driver-directory-names-map-to-test-jobs
  (testing "a driver directory maps to the driver keyword(s) whose jobs it feeds"
    (is (= [:bigquery] (get @#'mage.modules/driver-directory->drivers "bigquery-cloud-sdk"))
        "bigquery-cloud-sdk should map to [:bigquery]")
    (is (= [:mongo :mongo-ssl :mongo-sharded-cluster] (get @#'mage.modules/driver-directory->drivers "mongo"))
        "mongo should map to multiple test jobs")))

(deftest drivers-with-file-changes-reads-the-driver-directory
  (testing "only files under modules/drivers/<dir>/ name a driver"
    (is (= #{:snowflake}
           (@#'mage.modules/drivers-with-file-changes
            ["modules/drivers/snowflake/src/metabase/driver/snowflake.clj"
             "src/metabase/query_processor.clj"])))
    (is (= #{} (@#'mage.modules/drivers-with-file-changes ["deps.edn"])))))

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

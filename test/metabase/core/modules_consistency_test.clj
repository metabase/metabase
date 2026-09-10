(ns metabase.core.modules-consistency-test
  "Verifies that the three sites implementing namespace→module resolution stay
  in sync with each other.

  Metabase's modules-enforcement system resolves a namespace symbol (or file
  path) to a module symbol. This resolution is implemented in three places:

    1. `.clj-kondo/src/hooks/common/modules.clj`   — CANONICAL
       Runs inside clj-kondo's isolated classpath; the source-of-truth
       definition of the algorithm.

    2. `dev/src/dev/deps_graph.clj`                — dev mirror
       Runs in the dev Clojure classpath; used by the config generator
       and the staleness test.

    3. `mage/src/mage/modules.clj`                 — mage mirror (file-path based)
       Runs in the mage Babashka classpath; used by CI to determine
       affected modules from git-changed file paths.

  These three sites cannot share source code because they live in three
  different classpath contexts. Instead, they maintain the same algorithm
  by convention, backed by this test as a tripwire.

  The tests execute all three implementations against the same behavioral
  cases. If a case fails, update the mirrors together or add a case that
  captures the intentionally different file-path behavior."
  (:require
   [clojure.edn :as edn]
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.deps-graph]
   [metabase.test.util.dynamic-redefs :refer [with-dynamic-fn-redefs]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;; Mirror sites live in different classpaths in production, but in tests we can
;; load/resolve them directly and compare behavior on representative fixtures.
(load-file ".clj-kondo/src/hooks/common/modules.clj")

(defn- private-fn [ns-sym sym]
  (let [v (ns-resolve (find-ns ns-sym) sym)]
    (assert v (str ns-sym "/" sym " not found"))
    v))

(defn- working-executable? [executable]
  (try
    (zero? (:exit (shell/sh executable "--version")))
    (catch java.io.IOException _
      false)))

(defn- find-babashka-executable []
  (some #(when (working-executable? %) %)
        ["./bin/bb" "bb"]))

(def ^:private babashka-executable
  (delay (find-babashka-executable)))

(defn- babashka-available?
  []
  (some? (force babashka-executable)))

(defn- missing-babashka-failure
  "Message for a cross-check that cannot run because babashka is absent. These assertions are the only
  thing binding the mage mirror to the other two resolvers, so a missing `bb` fails loudly rather than
  passing silently: a tripwire that quietly degrades from three-way to two-way is worse than a red test."
  []
  (str "Cannot cross-check the mage resolver mirror: no working babashka at ./bin/bb or on PATH. "
       "Run any ./bin/mage task once to install it."))

(deftest babashka-executable-falls-back-to-path-test
  (with-dynamic-fn-redefs [working-executable? #(= % "bb")]
    (is (= "bb" (find-babashka-executable)))))

(defn- bb-mage-file->module [modules-config filename]
  (let [expr               (str "(do "
                                "(require 'mage.modules) "
                                "(let [build-prefix->module (ns-resolve 'mage.modules 'build-prefix->module) "
                                "      file->module (ns-resolve 'mage.modules 'file->module)] "
                                "  (prn ((deref file->module) ((deref build-prefix->module) "
                                (pr-str (list 'quote modules-config))
                                ") "
                                (pr-str filename)
                                "))))")
        {:keys [exit out err]} (shell/sh (force babashka-executable) "-e" expr)]
    (when-not (zero? exit)
      (throw (ex-info "Babashka mage.modules evaluation failed"
                      {:exit exit
                       :stderr err
                       :expr expr})))
    (edn/read-string (str/trim out))))

(defn- bb-mage-module->test-paths [modules-config module]
  (let [expr               (str "(do "
                                "(require 'mage.modules) "
                                "(let [module->test-paths (ns-resolve 'mage.modules 'module->test-paths)] "
                                "  (prn ((deref module->test-paths) "
                                (pr-str (list 'quote modules-config))
                                " "
                                (pr-str (list 'quote module))
                                "))))")
        {:keys [exit out err]} (shell/sh (force babashka-executable) "-e" expr)]
    (when-not (zero? exit)
      (throw (ex-info "Babashka mage.modules test-path evaluation failed"
                      {:exit exit
                       :stderr err
                       :expr expr})))
    (edn/read-string (str/trim out))))

(defn- bb-mage-updated-files->updated-modules [modules-config filenames]
  (let [expr               (str "(do "
                                "(require 'mage.modules) "
                                "(let [build-prefix->module (ns-resolve 'mage.modules 'build-prefix->module) "
                                "      updated-files->updated-modules (ns-resolve 'mage.modules 'updated-files->updated-modules)] "
                                "  (with-redefs [mage.modules/read-prefix->module (fn [] ((deref build-prefix->module) "
                                (pr-str (list 'quote modules-config))
                                "))] "
                                "    (prn ((deref updated-files->updated-modules) "
                                (pr-str filenames)
                                ")))))")
        {:keys [exit out err]} (shell/sh (force babashka-executable) "-e" expr)]
    (when-not (zero? exit)
      (throw (ex-info "Babashka mage.modules updated-files evaluation failed"
                      {:exit exit
                       :stderr err
                       :expr expr})))
    (edn/read-string (str/trim out))))

(deftest ^:parallel module-resolution-behavior-agrees-test
  (testing "Representative namespace/file-path cases resolve to the same module across all three sites"
    (let [hook-module        (private-fn 'hooks.common.modules 'module)
          dev-module         (private-fn 'dev.deps-graph 'module)
          config             {:metabase/modules
                              {'actions               {}
                               'actions.rest          {:ns-prefix "metabase.actions-rest"}
                               'queries               {}
                               'queries.rest          {:ns-prefix "metabase.queries-rest"}
                               'lib                   {}
                               'lib.schema            {}
                               'lib.be                {:ns-prefix "metabase.lib-be"}
                               'enterprise/transforms {}
                               'enterprise/transforms.python {}}}
          modules-config     (:metabase/modules config)
          dev-prefix->module (dev.deps-graph/build-prefix->module modules-config)
          cases              [{:ns 'metabase.actions-rest.api
                               :file "src/metabase/actions_rest/api.clj"
                               :want 'actions.rest}
                              {:ns 'metabase.queries-rest.middleware
                               :file "test/metabase/queries_rest/middleware_test.clj"
                               :want 'queries.rest}
                              {:ns 'metabase.lib.schema.util
                               :file "src/metabase/lib/schema/util.clj"
                               :want 'lib.schema}
                              {:ns 'metabase.lib.schema
                               :file "src/metabase/lib/schema.cljc"
                               :want 'lib.schema}
                              {:ns 'metabase.lib.schema-test
                               :file "test/metabase/lib/schema_test.cljc"
                               :want 'lib.schema}
                              {:ns 'metabase.lib.schema.config
                               :file "src/metabase/lib/schema/config.edn"
                               :want 'lib.schema}
                              {:ns 'metabase.lib-be.core
                               :file "src/metabase/lib_be/core.clj"
                               :want 'lib.be}
                              {:ns 'metabase.lib-bert.core
                               :file "src/metabase/lib_bert/core.clj"
                               :want 'lib-bert}
                              {:ns 'metabase.query-processor.middleware.permissions
                               :file "src/metabase/query_processor/middleware/permissions.clj"
                               :want 'query-processor}
                              {:ns 'metabase-enterprise.transforms.python.runner
                               :file "enterprise/backend/src/metabase_enterprise/transforms/python/runner.clj"
                               :want 'enterprise/transforms.python}]]
      (doseq [{:keys [ns file want]} cases]
        (testing (str ns " <-> " file)
          (is (= want (hook-module config ns)))
          (is (= want (dev-module dev-prefix->module ns)))
          (if (babashka-available?)
            ;; one subprocess per case, not one per assertion
            (let [mage-result (bb-mage-file->module modules-config file)]
              (is (= want mage-result))
              (is (= (hook-module config ns)
                     (dev-module dev-prefix->module ns)
                     mage-result)))
            (is false (missing-babashka-failure))))))))

(deftest ^:parallel visibility-behavior-agrees-test
  (testing (str "The dev mirror of the namability rule agrees with the canonical hook. "
                "A desync here corrupts `:uses :any` expansion in `expanded-module-uses`.")
    (let [hook-namable (private-fn 'hooks.common.modules 'namable-from?)
          base          {'outer        {}
                         'outer.a      {}
                         'outer.a.leaf {}
                         'outer.a.sib  {}
                         'outer.b      {}
                         'outer.b.deep {}
                         'unrelated    {}}
          pairs        [['unrelated 'outer]
                        ['outer.a 'outer.a.leaf]
                        ['outer.a.sib 'outer.a.leaf]
                        ['outer 'outer.a.leaf]
                        ['outer.b 'outer.a.leaf]
                        ['outer.b.deep 'outer.a.leaf]
                        ['unrelated 'outer.a.leaf]]]
      (doseq [[label config] [["unopened" base]
                              ["leaf exported by its parent"
                               (assoc-in base ['outer.a :module-exports] #{'outer.a.leaf})]
                              ["leaf exported all the way to the root"
                               (-> base
                                   (assoc-in ['outer.a :module-exports] #{'outer.a.leaf})
                                   (assoc-in ['outer :module-exports] #{'outer.a}))]]]
        (testing (str "\n" label)
          (doseq [[caller target] pairs]
            (testing (format "\n%s naming %s" caller target)
              ;; the hook reads modules out of a `:metabase/modules` wrapper; the dev mirror takes
              ;; the inner map directly.
              (is (= (boolean (hook-namable {:metabase/modules config} caller target))
                     (boolean (dev.deps-graph/module-namable-from? config caller target)))))))))))

;; The path tests below run against the real test tree rather than fixtures, because the property under
;; test is that resolution lands on paths that actually exist. They assert on the DIRECTORY a module's
;; tests resolve into, never on individual filenames, so renaming or adding a test file cannot break
;; them. What does break them is resolution moving a file to the wrong module, which is the point.

(defn- all-under?
  "True if `paths` is non-empty and every path is the module's own `<dir>_test.<ext>` file or sits
  under `<dir>/`. Non-emptiness matters: an empty set would satisfy `every?` vacuously and the
  assertion would prove nothing."
  [dir paths]
  (and (seq paths)
       (every? (fn [^String p]
                 (or (re-matches (re-pattern (str "\\Q" dir "\\E_test\\.\\w+")) p)
                     (.startsWith p (str dir "/"))))
               paths)))

(deftest ^:parallel dotted-module-test-paths-test
  (testing "Dotted modules resolve to the actual on-disk test paths for both default and explicit prefixes"
    (let [modules-config {'actions.rest {:ns-prefix "metabase.actions-rest"}
                          'lib.schema   {}}
          module->test-files (private-fn 'dev.deps-graph 'module->test-files)]
      (testing "dev.deps-graph finds both explicit-prefix and default nested-module tests"
        (is (all-under? "test/metabase/actions_rest"
                        (module->test-files modules-config 'actions.rest))
            "an explicit :ns-prefix resolves into the prefix's directory")
        (let [schema-tests (module->test-files modules-config 'lib.schema)]
          (is (all-under? "test/metabase/lib/schema" schema-tests)
              "a default-derived prefix resolves into the dotted module's directory")
          ;; Completeness signal. `all-under?` alone would still pass if discovery silently stopped
          ;; surfacing nested files and returned only the module's own `schema_test.cljc`, which is
          ;; the regression the old per-file assertions caught. Checking that both shapes appear
          ;; keeps that signal without pinning any filename.
          (is (some #(re-matches #"test/metabase/lib/schema_test\.\w+" %) schema-tests)
              "the module's own test file is discovered")
          (is (some #(.startsWith ^String % "test/metabase/lib/schema/") schema-tests)
              "and so are tests nested beneath it")))
      (if (babashka-available?)
        (testing "mage.modules emits the same directories"
          (is (all-under? "test/metabase/actions_rest"
                          (bb-mage-module->test-paths modules-config 'actions.rest)))
          (is (all-under? "test/metabase/lib/schema"
                          (bb-mage-module->test-paths modules-config 'lib.schema))))
        (is false (missing-babashka-failure))))))

(deftest ^:parallel parent-test-discovery-excludes-declared-child-tests-test
  (let [child-dir "test/metabase/query_processor/middleware/cache_backend"
        modules-config {'query-processor               {}
                        'query-processor.cache-backend {:ns-prefix "metabase.query-processor.middleware.cache-backend"}}
        module->test-files (private-fn 'dev.deps-graph 'module->test-files)]
    (testing "dev dependency tooling assigns a nested test only to its exact owner"
      (let [parent (module->test-files modules-config 'query-processor)
            child  (module->test-files modules-config 'query-processor.cache-backend)]
        (is (all-under? child-dir child)
            "the declared child owns the tests under its own prefix")
        (is (empty? (filter #(.startsWith ^String % (str child-dir "/")) parent))
            "and the parent claims none of them")))
    (if (babashka-available?)
      (testing "Mage affected-test paths assign a nested test only to its exact owner"
        (let [parent (bb-mage-module->test-paths modules-config 'query-processor)
              child  (bb-mage-module->test-paths modules-config 'query-processor.cache-backend)]
          (is (all-under? child-dir child))
          (is (empty? (filter #(.startsWith ^String % (str child-dir "/")) parent)))))
      (is false (missing-babashka-failure)))))

(deftest ^:parallel mage-affected-tests-are-jvm-loadable-test
  (if (babashka-available?)
    (let [paths (set (bb-mage-module->test-paths {'lib {}} 'lib))]
      ;; Assert the property, not one filename: naming `lib/js_test.cljs` meant the check silently
      ;; became a no-op the moment that file was renamed or deleted.
      (is (seq paths) "no paths resolved, so the exclusion below would hold vacuously")
      (is (empty? (filter #(str/ends-with? ^String % ".cljs") paths))
          "mage affected-test paths feed a JVM runner, so ClojureScript-only tests must not appear"))
    (is false (missing-babashka-failure))))

(deftest ^:parallel explicit-prefix-map-overloads-remain-pure-test
  (testing "dev.deps-graph path helpers honor caller-supplied prefix->module maps instead of recomputing live config"
    (let [deps        [{:module 'lib.schema.util
                        :deps   []
                        :filename "src/metabase/lib/schema/util/core.cljc"}]
          prefix->mod {"metabase.lib.schema.util" 'lib.schema.util}]
      (is (= #{"src/metabase/lib/schema/util/core.cljc"}
             (set (dev.deps-graph/test-filenames->relevant-source-filenames
                   deps
                   prefix->mod
                   ["test/metabase/lib/schema/util/core_test.cljc"]))))
      (is (= #{"test/metabase/lib/schema/util_test.cljc"}
             (set (dev.deps-graph/source-filenames->relevant-test-filenames
                   deps
                   {'lib.schema.util {}}
                   prefix->mod
                   ["src/metabase/lib/schema/util/core.cljc"])))))))

(deftest ^:parallel exact-dotted-module-test-files-round-trip-test
  (testing "Exact-file dotted-module tests resolve back to the dotted module"
    (let [deps        [{:module   'lib.schema
                        :deps     []
                        :filename "src/metabase/lib/schema.cljc"}
                       {:module   'lib
                        :deps     []
                        :filename "src/metabase/lib.clj"}]
          prefix->mod {"metabase.lib.schema" 'lib.schema}
          test-file   "test/metabase/lib/schema_test.cljc"]
      (is (= #{"src/metabase/lib/schema.cljc"}
             (set (dev.deps-graph/test-filenames->relevant-source-filenames
                   deps
                   prefix->mod
                   [test-file]))))
      (if (babashka-available?)
        (do
          (is (= 'lib.schema
                 (bb-mage-file->module {'lib.schema {}}
                                       test-file)))
          (is (= '#{lib.schema}
                 (bb-mage-updated-files->updated-modules {'lib.schema {}
                                                          'lib        {}}
                                                         [test-file]))))
        (is false (missing-babashka-failure))))))

(deftest ^:parallel log-team-attribution-agrees-with-deps-graph-test
  (testing (str "`metabase.util.log`'s team attribution is a FOURTH copy of namespace-to-module "
                "resolution, alongside the kondo hook, `dev.deps-graph` and `mage.modules`. It resolves "
                "a namespace to its module and then climbs to the nearest ancestor declaring `:team`. "
                "It cannot take an injected config, so the inheritance climb cannot be exercised on a "
                "fixture; what can be pinned is that it agrees with `dev.deps-graph` on the real "
                "config, so this copy cannot drift from the source of truth unnoticed.")
    (let [config      (dev.deps-graph/kondo-config)
          prefix->mod (dev.deps-graph/build-prefix->module config)
          ;; One namespace per module, derived from the config rather than hard-coded, so this cannot
          ;; rot against a rename and cannot quietly shrink to a handful of modules.
          samples     (for [m (sort (keys config))]
                        [m (symbol (dev.deps-graph/module-ns-prefix config m))])]
      (is (< 100 (count samples))
          "sampling every declared module, so a shrunken sample would mean the config failed to load")
      (doseq [[module ns-sym] samples]
        (testing (format "\n%s (%s)" ns-sym module)
          ;; log resolves the namespace itself, so compare against deps-graph doing both steps.
          (is (= (dev.deps-graph/module-team config ((private-fn 'dev.deps-graph 'module) prefix->mod ns-sym))
                 (log/ns->team* ns-sym))))))))

(ns metabase.core.modules-consistency-test
  "Cross-checks module resolution at classpath boundaries.

  Mage infers a namespace from each changed path and runs under Babashka, so
  these tests invoke it through `bb`. Logging ships in the application jar and
  cannot load the shared hook, so it keeps a small resolver copy."
  (:require
   [clojure.edn :as edn]
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.deps-graph]
   [hooks.common.modules :as modules]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private babashka
  (delay (some (fn [executable]
                 (try
                   (when (zero? (:exit (shell/sh executable "--version")))
                     executable)
                   (catch java.io.IOException _
                     nil)))
               ["./bin/bb" "bb"])))

(defn- bb-eval
  "Evaluate `form` with `mage.modules` loaded in Babashka."
  [form]
  ;; Missing Babashka must fail because this is the only cross-runtime check.
  (let [bb   (or @babashka
                 (throw (ex-info "No working babashka at ./bin/bb or on PATH. Run any ./bin/mage task once to install it."
                                 {})))
        expr (pr-str `(do (require 'mage.modules) (~'prn ~form)))
        {:keys [exit out err]} (shell/sh bb "-e" expr)]
    (when-not (zero? exit)
      (throw (ex-info "babashka evaluation failed" {:exit exit, :stderr err, :expr expr})))
    (edn/read-string out)))

(defn- mage-test-paths [modules-config module]
  (bb-eval `(#'mage.modules/module->test-paths '~modules-config '~module)))

(deftest ^:parallel mage-file-resolution-test
  (testing "Mage and the linter resolve equivalent files and namespaces to the same module"
    (let [config     '{actions                      {}
                       actions.rest                 {:ns-prefix "metabase.actions-rest"}
                       queries                      {}
                       queries.rest                 {:ns-prefix "metabase.queries-rest"}
                       lib                          {}
                       lib.schema                   {}
                       lib.be                       {:ns-prefix "metabase.lib-be"}
                       enterprise/transforms        {}
                       enterprise/transforms.python {}}
          cases      '[[metabase.actions-rest.api "src/metabase/actions_rest/api.clj" actions.rest]
                       [metabase.queries-rest.middleware-test "test/metabase/queries_rest/middleware_test.clj" queries.rest]
                       [metabase.lib.schema.util "src/metabase/lib/schema/util.clj" lib.schema]
                       [metabase.lib.schema "src/metabase/lib/schema.cljc" lib.schema]
                       [metabase.lib.schema-test "test/metabase/lib/schema_test.cljc" lib.schema]
                       [metabase.lib.schema.config "src/metabase/lib/schema/config.edn" lib.schema]
                       [metabase.lib-be.core "src/metabase/lib_be/core.clj" lib.be]
                       [metabase.lib-bert.core "src/metabase/lib_bert/core.clj" lib-bert]
                       [metabase.query-processor.middleware.permissions
                        "src/metabase/query_processor/middleware/permissions.clj" query-processor]
                       [metabase-enterprise.transforms.python.runner
                        "enterprise/backend/src/metabase_enterprise/transforms/python/runner.clj"
                        enterprise/transforms.python]]
          from-files (bb-eval `(mapv (partial #'mage.modules/file->module (modules/build-prefix->module '~config))
                                     ~(mapv second cases)))]
      (doseq [[[ns-symb file want] from-file] (map vector cases from-files)]
        (testing (str ns-symb " <-> " file)
          (is (= want
                 (modules/module {:metabase/modules config} ns-symb)
                 from-file)))))))

;; Use real directories but avoid fixed filenames, so ordinary test renames do
;; not break ownership checks.

(defn- all-under?
  "Whether `paths` is non-empty and each path belongs to `dir`'s test file or directory."
  [dir paths]
  (and (seq paths)
       (every? (fn [^String p]
                 (or (re-matches (re-pattern (str "\\Q" dir "\\E_test\\.\\w+")) p)
                     (.startsWith p (str dir "/"))))
               paths)))

(deftest ^:parallel dotted-module-test-paths-test
  (testing "Dotted modules find tests under default and custom prefixes"
    (let [modules-config '{actions.rest {:ns-prefix "metabase.actions-rest"}
                           lib.schema   {}}]
      (testing "dev.deps-graph finds both forms"
        (is (all-under? "test/metabase/actions_rest"
                        (#'dev.deps-graph/module->test-files modules-config 'actions.rest))
            "an explicit :ns-prefix resolves into the prefix's directory")
        (let [schema-tests (#'dev.deps-graph/module->test-files modules-config 'lib.schema)]
          (is (all-under? "test/metabase/lib/schema" schema-tests)
              "a default-derived prefix resolves into the dotted module's directory")
          ;; Check both file shapes; `all-under?` alone would accept either one.
          (is (some #(re-matches #"test/metabase/lib/schema_test\.\w+" %) schema-tests)
              "the module's own test file is discovered")
          (is (some #(.startsWith ^String % "test/metabase/lib/schema/") schema-tests)
              "and so are tests nested beneath it")))
      (testing "mage.modules emits the same directories"
        (is (all-under? "test/metabase/actions_rest" (mage-test-paths modules-config 'actions.rest)))
        (is (all-under? "test/metabase/lib/schema" (mage-test-paths modules-config 'lib.schema)))))))

(deftest ^:parallel parent-test-discovery-excludes-declared-child-tests-test
  (let [child-dir      "test/metabase/query_processor/middleware/cache_backend"
        modules-config '{query-processor               {}
                         query-processor.cache-backend {:ns-prefix "metabase.query-processor.middleware.cache-backend"}}
        in-child?      #(.startsWith ^String % (str child-dir "/"))]
    (testing "dev dependency tooling assigns a nested test only to its exact owner"
      (is (all-under? child-dir (#'dev.deps-graph/module->test-files modules-config 'query-processor.cache-backend)))
      (is (not-any? in-child? (#'dev.deps-graph/module->test-files modules-config 'query-processor))))
    (testing "Mage affected-test paths assign a nested test only to its exact owner"
      (is (all-under? child-dir (mage-test-paths modules-config 'query-processor.cache-backend)))
      (is (not-any? in-child? (mage-test-paths modules-config 'query-processor))))))

(deftest ^:parallel mage-affected-tests-are-jvm-loadable-test
  (let [paths (mage-test-paths '{lib {}} 'lib)]
    (is (seq paths) "no paths resolved, so the exclusion below would hold vacuously")
    (is (not-any? #(str/ends-with? ^String % ".cljs") paths)
        "mage affected-test paths feed a JVM runner, so ClojureScript-only tests must not appear")))

(deftest ^:parallel explicit-prefix-map-overloads-remain-pure-test
  (testing "path helpers use the supplied prefix map instead of live config"
    (let [deps        [{:module   'lib.schema.util
                        :deps     []
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
  (testing "a dotted module's top-level test file resolves back to that module"
    (let [deps [{:module   'lib.schema
                 :deps     []
                 :filename "src/metabase/lib/schema.cljc"}
                {:module   'lib
                 :deps     []
                 :filename "src/metabase/lib.clj"}]]
      (is (= #{"src/metabase/lib/schema.cljc"}
             (set (dev.deps-graph/test-filenames->relevant-source-filenames
                   deps
                   {"metabase.lib.schema" 'lib.schema}
                   ["test/metabase/lib/schema_test.cljc"])))))))

(deftest ^:parallel log-team-attribution-agrees-with-deps-graph-test
  (testing "logging and dev tooling assign the same team to every module"
    (let [config (dev.deps-graph/kondo-config)]
      (is (< 100 (count config)) "sampling every declared module, so a small config means it failed to load")
      (doseq [module (sort (keys config))
              :let   [ns-symb (symbol (modules/module-ns-prefix config module))]]
        (testing (str "\n" ns-symb)
          (is (= (dev.deps-graph/module-team config module)
                 (log/ns->team* ns-symb))))))))

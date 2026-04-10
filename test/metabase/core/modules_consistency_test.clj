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

  WHY THIS TEST EXISTS
  --------------------
  When we extend module resolution — for example, adding longest-prefix
  matching for nested sub-modules — it is dangerously easy to update only
  one or two of the three sites and leave the third broken. This test
  catches such drift by comparing the regex literals used for extraction
  across the three source files.

  APPROACH
  --------
  Because the three sites live in different classpath contexts, we cannot
  simply call each implementation and diff behavior. Instead we parse each
  source file as text, extract the regex literals referencing `metabase`,
  and assert that the kondo hook and `dev.deps-graph` share the same set
  of namespace-matching patterns.

  The mage site uses a different regex shape (file paths rather than
  namespace symbols), so we assert its patterns exist and reference the
  expected path fragments, without requiring byte-equality with the other
  two.

  IF THIS TEST FAILS
  ------------------
  Most likely, you edited one of the three sites without editing the others.
  Before fixing the test, decide whether the algorithm change is
  intentional — then apply the equivalent change to the other two sites
  and re-run the test."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.deps-graph]))

(set! *warn-on-reflection* true)

(def ^:private kondo-hook-path ".clj-kondo/src/hooks/common/modules.clj")
(def ^:private deps-graph-path "dev/src/dev/deps_graph.clj")
(def ^:private mage-modules-path "mage/src/mage/modules.clj")

;; Mirror sites live in different classpaths in production, but in tests we can
;; load/resolve them directly and compare behavior on representative fixtures.
(load-file ".clj-kondo/src/hooks/common/modules.clj")

(defn- private-fn [ns-sym sym]
  (let [v (ns-resolve (find-ns ns-sym) sym)]
    (assert v (str ns-sym "/" sym " not found"))
    v))

(def ^:private babashka-available
  (delay
    (try
      (zero? (:exit (shell/sh "bb" "--version")))
      (catch java.io.IOException _
        false))))

(defn- babashka-available?
  []
  (force babashka-available))

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
        {:keys [exit out err]} (shell/sh "bb" "-e" expr)]
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
        {:keys [exit out err]} (shell/sh "bb" "-e" expr)]
    (when-not (zero? exit)
      (throw (ex-info "Babashka mage.modules test-path evaluation failed"
                      {:exit exit
                       :stderr err
                       :expr expr})))
    (edn/read-string (str/trim out))))

(defn- regex-literals-in-file
  "Parse the file at `path` as text and return the seq of regex literal strings
  it contains.

  A regex literal here is the body of a `#\"...\"` form, without the enclosing
  `#\"` and `\"`. This is a deliberately naive lexer that does not handle
  escaped double-quotes inside a regex literal — none of our three target
  files use such literals, and if someone introduces one the test will need
  updating anyway."
  [path]
  (let [content (slurp (io/file path))
        matcher (re-matcher #"#\"([^\"]*)\"" content)]
    (loop [acc []]
      (if (.find matcher)
        (recur (conj acc (.group matcher 1)))
        acc))))

(defn- metabase-namespace-regexes
  "The subset of regex literals in `path` that match namespace symbols starting
  with `metabase` or `metabase-enterprise`. Used for cross-checking the
  namespace-based mapping sites (kondo hook and deps_graph)."
  [path]
  (->> (regex-literals-in-file path)
       (filter (fn [pat]
                 (or (str/starts-with? pat "^metabase\\.")
                     (str/starts-with? pat "^metabase-enterprise\\."))))
       set))

(deftest ^:parallel kondo-hook-and-deps-graph-regexes-agree-test
  (testing (str "The namespace→module regex literals in the kondo hook and dev.deps-graph "
                "must agree byte-for-byte. See this namespace's docstring for background.")
    (let [kondo-regexes      (metabase-namespace-regexes kondo-hook-path)
          deps-graph-regexes (metabase-namespace-regexes deps-graph-path)]
      (testing (format "\nkondo hook (%s) has regexes the deps_graph (%s) lacks:"
                       kondo-hook-path deps-graph-path)
        (is (empty? (into (sorted-set) (map str) (remove deps-graph-regexes kondo-regexes)))))
      (testing (format "\ndeps_graph (%s) has regexes the kondo hook (%s) lacks:"
                       deps-graph-path kondo-hook-path)
        (is (empty? (into (sorted-set) (map str) (remove kondo-regexes deps-graph-regexes)))))
      (testing "\nboth files must actually contain at least one namespace-matching regex"
        (is (seq kondo-regexes)
            "kondo hook has no metabase-namespace regexes — was the file moved or rewritten?")
        (is (seq deps-graph-regexes)
            "deps_graph has no metabase-namespace regexes — was the file moved or rewritten?")))))

(deftest ^:parallel mage-file-path-regexes-exist-test
  (testing (str "mage/modules/file->module uses file-path-based module extraction. "
                "This test ensures the expected path fragments are still referenced in "
                "the file so that accidental deletion or semantic drift is caught. "
                "See this namespace's docstring for background.")
    (let [content     (slurp (io/file mage-modules-path))
          regexes     (regex-literals-in-file mage-modules-path)
          joined      (str/join "\n" regexes)]
      (testing "\nfile path regex for `metabase/<module>/...` is present"
        (is (str/includes? joined "metabase/([^/]+)")
            (str "mage.modules/file->module should still reference the file-path pattern "
                 "`metabase/([^/]+)`. If you removed this pattern, either reintroduce it "
                 "or update this test to reflect the new extraction approach.")))
      (testing "\nfile path regex for `metabase_enterprise/<module>/...` is present"
        (is (str/includes? joined "metabase_enterprise/([^/]+)")
            (str "mage.modules/file->module should still reference the file-path pattern "
                 "`metabase_enterprise/([^/]+)`. If you removed this pattern, either "
                 "reintroduce it or update this test to reflect the new extraction approach.")))
      (testing "\nfile contains a reminder comment pointing at the canonical site"
        (is (str/includes? content "hooks/common/modules.clj")
            (str "mage/src/mage/modules.clj should contain a comment pointing at "
                 ".clj-kondo/src/hooks/common/modules.clj as the canonical source "
                 "of the module-resolution algorithm."))))))

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
                              {:ns 'metabase.lib-be.core
                               :file "src/metabase/lib_be/core.clj"
                               :want 'lib.be}
                              {:ns 'metabase-enterprise.transforms.python.runner
                               :file "enterprise/backend/src/metabase_enterprise/transforms/python/runner.clj"
                               :want 'enterprise/transforms.python}]]
      (doseq [{:keys [ns file want]} cases]
        (testing (str ns " <-> " file)
          (is (= want (hook-module config ns)))
          (is (= want (dev-module dev-prefix->module ns)))
          (if (babashka-available?)
            (do
              (is (= want (bb-mage-file->module modules-config file)))
              (is (= (hook-module config ns)
                     (dev-module dev-prefix->module ns)
                     (bb-mage-file->module modules-config file))))
            (is true "Skipping mage.modules resolution assertions because `bb` is unavailable")))))))

(deftest ^:parallel dotted-module-test-paths-test
  (testing "Dotted modules resolve to the actual on-disk test paths for both default and explicit prefixes"
    (let [modules-config {'actions.rest {:ns-prefix "metabase.actions-rest"}
                          'lib.schema   {}}
          module->test-files (private-fn 'dev.deps-graph 'module->test-files)]
      (testing "dev.deps-graph finds both explicit-prefix and default nested-module tests"
        (is (contains? (module->test-files modules-config 'actions.rest)
                       "test/metabase/actions_rest/api_test.clj"))
        (is (contains? (module->test-files modules-config 'lib.schema)
                       "test/metabase/lib/schema/util_test.cljc"))
        (is (contains? (module->test-files modules-config 'lib.schema)
                       "test/metabase/lib/schema_test.cljc")))
      (if (babashka-available?)
        (testing "mage.modules emits both exact-file and nested-directory test paths"
          (is (= #{"test/metabase/actions_rest"}
                 (set (bb-mage-module->test-paths modules-config 'actions.rest))))
          (is (= #{"test/metabase/lib/schema"
                   "test/metabase/lib/schema_test.cljc"}
                 (set (bb-mage-module->test-paths modules-config 'lib.schema)))))
        (is true "Skipping mage.modules path assertions because `bb` is unavailable")))))

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
                        :filename "src/metabase/lib/schema.cljc"}]
          prefix->mod {"metabase.lib.schema" 'lib.schema}
          test-file   "test/metabase/lib/schema_test.cljc"]
      (is (= #{"src/metabase/lib/schema.cljc"}
             (set (dev.deps-graph/test-filenames->relevant-source-filenames
                   deps
                   prefix->mod
                   [test-file]))))
      (if (babashka-available?)
        (is (= 'lib.schema
               (bb-mage-file->module {'lib.schema {}}
                                     test-file)))
        (is true "Skipping mage.modules exact-file assertions because `bb` is unavailable")))))

(deftest ^:parallel canonical-comments-present-test
  (testing "Each of the three mapping sites must carry a comment pointing at the others"
    (testing (format "\n%s contains the word CANONICAL" kondo-hook-path)
      (is (str/includes? (slurp (io/file kondo-hook-path)) "CANONICAL")
          (str "The kondo hook's `module` function docstring should include the word "
               "CANONICAL to mark it as the source-of-truth implementation.")))
    (testing (format "\n%s contains the word MIRROR" deps-graph-path)
      (is (str/includes? (slurp (io/file deps-graph-path)) "MIRROR")
          (str "The deps_graph `module` function docstring should include the word "
               "MIRROR to make its relationship to the kondo hook explicit.")))
    (testing (format "\n%s contains the word MIRROR" mage-modules-path)
      (is (str/includes? (slurp (io/file mage-modules-path)) "MIRROR")
          (str "The mage `file->module` function should include a MIRROR comment "
               "pointing at the canonical site.")))))

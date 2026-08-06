(ns metabase.core.modules-test
  "Tests that the modules config file is configured correctly."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.namespace.file :as ns.file]
   [clojure.tools.namespace.parse :as ns.parse]
   [dev.deps-graph]
   [dev.model-boundary-config]
   [metabase.util.json :as json]
   [rewrite-clj.node :as n]
   [rewrite-clj.parser :as r.parser]
   [rewrite-clj.zip :as z]))

(set! *warn-on-reflection* true)

(use-fixtures :once #(binding [dev.deps-graph/*parsed-file-cache* (atom {})]
                       (%)))

(defn- modules-config
  "Kondo modules config."
  []
  (-> (slurp ".clj-kondo/config/modules/config.edn")
      edn/read-string
      :metabase/modules))

(defn- teams
  "Set of valid string team names."
  []
  (into (sorted-set)
        (map :name)
        (-> (slurp ".github/team.json")
            (json/decode true)
            :teams)))

(def ^:private teams-to-reassign #{"Admin Webapp" "DashViz"})

(deftest all-modules-have-teams-test
  (testing "All modules should have a valid :team owner"
    (let [teams (teams)]
      (doseq [[module config] (modules-config)]
        (testing (format "\n'%s' module" module)
          (is (or (contains? teams (:team config))
                  (contains? teams-to-reassign (:team config)))
              "Should have a valid :team key"))))))

(defn- modules-config-zipper
  "Return a zipper pointing to the modules config map node (the value of the `:metabase/modules` key)."
  []
  (with-open [r (clojure.lang.LineNumberingPushbackReader. (java.io.FileReader. ".clj-kondo/config/modules/config.edn"))]
    (let [node               (r.parser/parse-all r)
          forms-zloc         (z/of-node node)
          top-level-map-zloc (z/find forms-zloc (fn [zloc]
                                                  (= (z/tag zloc) :map)))
          modules-key-zloc   (-> (z/down top-level-map-zloc)
                                 (z/find (fn [zloc]
                                           (and (n/keyword-node? (z/node zloc))
                                                (= (z/sexpr zloc) :metabase/modules)))))
          config-zloc       (z/find-next modules-key-zloc (fn [zloc]
                                                            (= (z/tag zloc) :map)))]
      config-zloc)))

(defn- module-names-in-file-order
  "Get the list of modules names as they appear in the config file."
  []
  (loop [modules [], zloc (z/down (modules-config-zipper))]
    (let [modules' (conj modules (z/sexpr zloc))
          zloc'    (-> zloc z/right z/right)]
      (if zloc'
        (recur modules' zloc')
        modules'))))

(defn- sort-module-names
  "Sort module names in order but sort the `enterprise/` modules last."
  [module-names]
  (sort-by (fn [module-name]
             [(if (str/starts-with? module-name "enterprise/")
                1
                0)
              module-name])
           module-names))

(deftest modules-should-be-sorted-by-name-test
  (testing "Modules configs should sorted by module name with enterprise/modules appearing last"
    (let [actual   (module-names-in-file-order)
          expected (sort-module-names actual)]
      (is (= expected
             actual)))))

(defn- do-each-module-config
  "Calls

    (f module-symbol module-config-zloc)

  For each module config in the Kondo module config file."
  [f]
  (loop [zloc (z/down (modules-config-zipper))]
    (let [module (z/sexpr zloc)
          config-zloc (z/right zloc)]
      (f module config-zloc)
      (when-let [zloc' (z/right config-zloc)]
        (recur zloc')))))

(deftest module-api-namespaces-should-be-sorted-test
  (testing "Module :api namespaces should be sorted"
    (do-each-module-config
     (fn [module config-zloc]
       (when-let [api-namespaces (-> config-zloc
                                     ;; into the map
                                     z/down
                                     ;; find the `:api` key
                                     (z/find (fn [zloc]
                                               (and (n/keyword-node? (z/node zloc))
                                                    (= (z/sexpr zloc) :api))))
                                     ;; find the value for the `:api` key (set of namespaces)
                                     z/right
                                     ;; get the namespaces in the set
                                     z/child-sexprs
                                     not-empty)]
         (testing (format "\n'%s' module" module)
           (is (= (sort api-namespaces)
                  api-namespaces))))))))

(deftest module-uses-should-be-sorted-test
  (testing "Module :uses namespaces should be sorted"
    (do-each-module-config
     (fn [module config-zloc]
       (when-let [uses (-> config-zloc
                           ;; into the map
                           z/down
                           ;; find the `:uses` key
                           (z/find (fn [zloc]
                                     (and (n/keyword-node? (z/node zloc))
                                          (= (z/sexpr zloc) :uses))))
                           ;; find the value for the `:uses` key (set of module names)
                           z/right
                           ;; get the namespaces in the set
                           z/child-sexprs
                           not-empty)]
         (testing (format "\n'%s' module" module)
           (is (= (sort-module-names uses)
                  uses))))))))

(deftest modules-config-up-to-date-test
  (testing (str "Please update .clj-kondo/config/modules/config.edn 🥰\n"
                "[Pro Tip: use (dev.deps-graph/print-kondo-config-diff) to see the changes you need to make in a nicer format]\n")
    (let [deps     (dev.deps-graph/dependencies)
          actual   (dev.deps-graph/kondo-config)
          expected (dev.deps-graph/generate-config deps actual)
          modules  (set/union (set (keys expected))
                              (set (keys actual)))]
      (doseq [module modules
              :let   [_ (testing (format "Remove %s" (pr-str module))
                          (is (seq (get expected module))))]
              k      [:api :uses]
              :let   [ks       [module k]
                      expected (get-in expected ks)
                      actual   (get-in actual ks)]
              :when  (not= actual :any)
              :let   [missing    (set/difference expected actual)
                      extraneous (set/difference actual expected)]]
        (testing (format "Add %s to %s\nused by %s"
                         (pr-str missing)
                         (pr-str ks)
                         (pr-str (case k
                                   :uses (reduce
                                          (partial merge-with set/union)
                                          {}
                                          (map #(dev.deps-graph/module-usages-of-other-module deps module %)
                                               missing))
                                   :api  (select-keys (dev.deps-graph/external-usages-by-namespace deps module) missing))))
          (is (empty? missing)))
        (testing (format "Remove %s from %s" (pr-str extraneous) (pr-str ks))
          (is (empty? extraneous)))))))

(deftest ^:parallel module-boundary-config-values-have-valid-types-test
  (testing "Module boundary keys use the values understood by the linter"
    (doseq [[module config] (dev.deps-graph/kondo-config)]
      (testing (format "\n%s" module)
        (is (or (nil? (:api config))
                (set? (:api config))
                (= :any (:api config)))
            ":api must be omitted, a set, or :any")
        (is (or (nil? (:uses config))
                (set? (:uses config))
                (= :any (:uses config)))
            ":uses must be omitted, a set, or :any")
        (is (or (nil? (:friends config))
                (set? (:friends config)))
            ":friends must be a set when present")))))

(deftest ^:parallel module-boundary-debt-matches-ratchets-test
  (testing "Module boundary anti-pattern counts match their exact ratchets"
    (let [actual   (dev.deps-graph/module-boundary-debt)
          ratchets (dev.deps-graph/module-boundary-ratchets)]
      (is (= (set (keys actual)) (set (keys ratchets)))
          "Every debt metric must have an exact committed ratchet")
      (doseq [[metric ratchet] ratchets
              :let [value (get actual metric)]]
        (testing (format "\n%s" metric)
          (is (= value ratchet)
              (if (< value ratchet)
                (format (str "%s improved from %d to %d. Run `./bin/mage modules-validate "
                             "--update-ratchets` and commit the lower value now.")
                        metric ratchet value)
                (format (str "%s increased from its ratchet of %d to %d. "
                             "Reduce the new boundary debt; the updater will not bless increases.")
                        metric ratchet value))))))))

(def ^:private config-derived-stat-keys
  "The module-stats keys derivable from the committed config-dir files alone. Only these are enforced
  exactly: PR CI checks out the merge preview with master, so scan-derived keys (SCC sizes, namespace
  counts, test blast) legitimately differ from any branch's committed baseline whenever master moves.
  They are still synced into module-stats.edn for PR-diff visibility."
  [:largest-api :module-count :total-api])

(deftest ^:parallel module-boundary-stats-match-committed-test
  (testing (str "Config-derived module surface stats match module-stats.edn. Unlike the ratchets these\n"
                "move in both directions by design — run `./bin/mage fix-modules-config` (or\n"
                "`modules-validate --update-ratchets`) and commit the new values; the PR diff is the\n"
                "review signal.")
    (let [actual    (dev.deps-graph/module-boundary-stats)
          committed (dev.deps-graph/committed-module-boundary-stats)]
      (is (= (set (keys actual)) (set (keys committed)))
          "module-stats.edn must carry the full stat shape, scan-derived keys included")
      (is (= (select-keys actual config-derived-stat-keys)
             (select-keys committed config-derived-stat-keys))))))

(deftest ^:parallel driver-test-overrides-not-stale-test
  (testing (str "Every driver-test exemption in driver-test-overrides.edn must still be justified by the\n"
                "graph: a declared module that a driver-triggering module transitively depends on. An entry\n"
                "that goes stale (renamed, removed, or no longer upstream of a trigger) does nothing and\n"
                "must be dropped — the set is a ratchet (:driver-test-exempt-modules) and may only shrink.")
    (let [config    (dev.deps-graph/kondo-config)
          declared  (set (keys config))
          deps      (dev.deps-graph/dependencies)
          full      (dev.deps-graph/full-dependencies deps)
          ;; mirrors the trigger set of mage.modules/driver-deps-affected?:
          ;; the union of default-modules-which-trigger-drivers and modules-triggering-cloud-drivers.
          ;; A trigger module's own entry is also meaningful: mage strips exemptions from the
          ;; changed set before computing what is affected, so it suppresses self-triggering.
          triggers  '[driver transforms query-processor
                      enterprise/transforms enterprise/transforms-python enterprise/workspaces]
          upstream  (into (set triggers) (mapcat #(get full %)) triggers)
          overrides (:exempt-modules (dev.deps-graph/driver-test-overrides))]
      (doseq [m (sort overrides)]
        (testing (format "\n%s" m)
          (is (contains? declared m)
              "exempts a module that is not declared in config.edn — rename or drop the entry")
          (is (contains? upstream m)
              "exempts a module no drivers-triggering module depends on — the entry is a no-op, drop it"))))))

(deftest ^:parallel module-boundary-ratchets-can-only-be-lowered-test
  (is (= {:debt 2}
         (dev.deps-graph/lowered-module-boundary-ratchets {:debt 3} {:debt 2})))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Refusing to increase"
                        (dev.deps-graph/lowered-module-boundary-ratchets {:debt 2} {:debt 3})))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"metrics do not match"
                        (dev.deps-graph/lowered-module-boundary-ratchets {:debt 2} {:other 1}))))

(deftest ^:parallel legacy-rest-module-debt-test
  (testing "-rest module symbols count as debt"
    (is (= 2
           (:legacy-rest-modules
            (dev.deps-graph/module-boundary-debt
             []
             {'actions-rest          {}
              'actions               {}
              'enterprise/users-rest {}}))))))

;;;; Classpath / namespace convention
;;;;
;;;; Asymmetric rules, matching how the classpath separation actually works
;;;; in Metabase:
;;;;
;;;;   - OSS source tree (`src/` and `test/`): namespaces must NOT use the
;;;;     `metabase-enterprise.*` prefix. That prefix is reserved for the EE
;;;;     classpath; using it in OSS would at best fail to build and at
;;;;     worst leak EE code into the OSS jar.
;;;;
;;;;   - EE source tree (`enterprise/backend/src/`): every namespace MUST
;;;;     use the `metabase-enterprise.*` prefix. Files in the EE source
;;;;     classpath should be EE code; anything else slipping in would
;;;;     suggest OSS code is being built as part of the EE jar.
;;;;
;;;;   - EE test tree (`enterprise/backend/test/`): intentionally NOT
;;;;     checked. OSS code that needs to be tested with premium features
;;;;     mocked (via `mt/with-premium-features` and friends) lives here
;;;;     because premium features don't exist on the OSS test classpath.
;;;;     Those test files keep their OSS-matching namespace (e.g.
;;;;     `metabase.notification.payload.execute-test`) because they're
;;;;     testing OSS code; mixing OSS-namespaced and EE-namespaced tests
;;;;     in the EE test tree is legitimate.
;;;;
;;;; This is the primary mechanism for enforcing the OSS/EE split — much
;;;; simpler than config-level encapsulation primitives because the
;;;; classpath separation is already doing the real work at build time.
;;;; These tests just surface the mistake earlier, with a clearer error
;;;; message than a build failure.

(def ^:private clojure-source-extensions
  #{".clj" ".cljc" ".cljs"})

(defn- clojure-source-file? [^java.io.File f]
  (and (.isFile f)
       (some #(str/ends-with? (.getName f) %) clojure-source-extensions)))

(defn- source-files-under [^String dir]
  (let [f (io/file dir)]
    (when (.exists f)
      (->> (file-seq f)
           (filter clojure-source-file?)))))

(defn- file->namespace-symbol
  "Read `file` and extract its namespace symbol from the `ns` form.
  Returns `nil` if the file has no `ns` declaration at all (e.g. data
  resources); throws with file context if the file cannot be read or
  parsed, so malformed sources fail validation instead of silently
  dropping out of the classpath checks."
  [file]
  (try
    (some-> (ns.file/read-file-ns-decl file)
            ns.parse/name-from-ns-decl)
    (catch Throwable e
      (throw (ex-info (str "Failed to read ns declaration from " file)
                      {:file (str file)}
                      e)))))

(def ^:private oss-classpath-roots
  ["src" "test"])

(def ^:private ee-classpath-roots
  ;; Only the source tree — NOT `enterprise/backend/test`. The EE test tree
  ;; legitimately contains OSS-namespaced test files for OSS code that needs
  ;; EE premium features mocked (e.g. `metabase.notification.payload.execute-test`
  ;; under `enterprise/backend/test/metabase/notification/payload/`). Those
  ;; tests can only run against the EE classpath because `mt/with-premium-features`
  ;; and friends don't work when EE isn't loaded. Narrow the strict check to
  ;; source only — the EE test tree is allowed to mix OSS and EE namespaces.
  ["enterprise/backend/src"])

(def ^:private ee-namespace-prefix
  "All EE namespaces start with this string (followed by a dot)."
  "metabase-enterprise")

(defn- ee-namespace? [ns-symb]
  (let [s (str ns-symb)]
    (or (= s ee-namespace-prefix)
        (str/starts-with? s (str ee-namespace-prefix ".")))))

(deftest ^:parallel oss-classpath-forbids-enterprise-namespaces-test
  (testing (str "OSS source files under " (pr-str oss-classpath-roots) " must not declare "
                "namespaces in the `metabase-enterprise.*` tree. That prefix is reserved "
                "for the EE classpath (enterprise/backend/{src,test}/). An OSS file using "
                "an EE namespace would at best fail to build against the OSS classpath and "
                "at worst leak EE code into the OSS jar.")
    (doseq [root oss-classpath-roots
            ^java.io.File file (source-files-under root)
            :let [ns-symb (file->namespace-symbol file)]
            :when ns-symb]
      (testing (format "\n%s" (.getPath file))
        (is (not (ee-namespace? ns-symb))
            (format (str "File %s has namespace %s, which starts with `%s`. That prefix "
                         "is reserved for the EE classpath. Move the file to "
                         "enterprise/backend/%s/ if it's actually EE code, or rename "
                         "its namespace if it's OSS code.")
                    (.getPath file)
                    ns-symb
                    ee-namespace-prefix
                    root))))))

(deftest ^:parallel ee-classpath-requires-enterprise-namespaces-test
  (testing (str "Every source file under " (pr-str ee-classpath-roots) " must have a "
                "namespace in the `metabase-enterprise.*` tree. The EE classpath is "
                "reserved for EE code; anything else slipping in would mean (a) an OSS "
                "module is being built as part of the EE jar, or (b) the naming "
                "convention has drifted.")
    (doseq [root ee-classpath-roots
            ^java.io.File file (source-files-under root)
            :let [ns-symb (file->namespace-symbol file)]
            :when ns-symb]
      (testing (format "\n%s" (.getPath file))
        (is (ee-namespace? ns-symb)
            (format (str "File %s has namespace %s, which does not start with `%s`. "
                         "Files in the EE classpath must use the `%s.*` prefix. "
                         "If this file is actually OSS code, move it to src/ or test/ instead.")
                    (.getPath file)
                    ns-symb
                    ee-namespace-prefix
                    ee-namespace-prefix))))))

(defn- rest-module?
  "True for deprecated `-rest` module symbols."
  [module]
  (str/ends-with? (str module) "-rest"))

(defn- routes-module?
  "True for route aggregators, which are allowed to assemble REST routes."
  [module]
  (str/ends-with? (str module) "-routes"))

(defn- core-module?
  "True for OSS and EE core initializer modules."
  [module]
  (= (name module) "core"))

(defn- allowed-rest-consumer?
  "Whether `module` may depend on REST modules."
  [module]
  ((some-fn rest-module? routes-module? core-module?) module))

(deftest ^:parallel rest-module-recognition-test
  (are [module] (rest-module? module)
    'queries-rest
    'enterprise/queries-rest)
  (is (not (rest-module? 'queries))))

(deftest do-not-use-rest-modules-in-other-modules-test
  (doseq [[module {:keys [uses], :as _config}] (dev.deps-graph/kondo-config)
          :when                                (not (allowed-rest-consumer? module))
          used-module                          (when (set? uses)
                                                 uses)]
    (is (not (rest-module? used-module))
        (format "Do not use REST modules (%s) in non-REST modules (%s) -- move things from %s to %s if needed"
                used-module
                module
                used-module
                (symbol (str/replace (str used-module) #"-rest$" ""))))))

;;;; Model boundary tests

(deftest model-boundaries-test
  (testing "Model boundary enforcement\n"
    (let [ownership    (dev.deps-graph/model-ownership)
          known-models (set (keys ownership))
          config       (modules-config)
          violations   (dev.deps-graph/model-boundary-violations (dev.deps-graph/kondo-config))]
      (testing "No model boundary violations"
        (doseq [{:keys [file module model defining-module violation-type]} violations]
          (testing (format "\n%s (module %s) references %s (defined in %s) — %s violation"
                           file module model (or defining-module "unknown") (name violation-type))
            (is (nil? violation-type)))))
      (testing ":model-exports and :model-imports reference valid models"
        (doseq [[module module-config] config
                config-key [:model-exports :model-imports]
                :when (set? (get module-config config-key))
                model (get module-config config-key)]
          (testing (format "\n'%s' %s %s should be a known model" module config-key model)
            (is (contains? known-models model)))))
      (testing ":model-exports only lists models owned by the module"
        (doseq [[module module-config] config
                :when                  (set? (:model-exports module-config))
                model                  (:model-exports module-config)]
          (testing (format "\n'%s' exports %s (owned by %s)" module model (get ownership model))
            (is (= module (get ownership model)))))))))

(deftest model-config-not-stale-test
  (testing "Model exports and imports should not list models that are unused.\n"
    (let [{computed-exports :model-exports
           computed-imports :model-imports} (dev.model-boundary-config/compute-model-boundaries)
          config (modules-config)]
      (doseq [[config-key computed direction] [[:model-exports computed-exports "exports"]
                                               [:model-imports computed-imports "imports"]]
              [module module-config]           config
              :when                            (set? (get module-config config-key))
              :let                             [needed     (get computed module #{})
                                                configured (get module-config config-key)
                                                stale      (set/difference configured needed)]
              :when                            (seq stale)]
        (testing (format "\n'%s' %s models that aren't used — remove them from %s."
                         module direction config-key)
          (is (empty? (sort stale))))))))

(deftest model-exports-sorted-test
  (testing "Module :model-exports should be sorted"
    (do-each-module-config
     (fn [module config-zloc]
       (when-let [exports (-> config-zloc
                              z/down
                              (z/find (fn [zloc]
                                        (and (n/keyword-node? (z/node zloc))
                                             (= (z/sexpr zloc) :model-exports))))
                              z/right
                              z/child-sexprs
                              not-empty)]
         (testing (format "\n'%s' module :model-exports" module)
           (is (= (sort exports)
                  exports))))))))

(deftest model-imports-sorted-test
  (testing "Module :model-imports should be sorted"
    (do-each-module-config
     (fn [module config-zloc]
       (when-let [imports (-> config-zloc
                              z/down
                              (z/find (fn [zloc]
                                        (and (n/keyword-node? (z/node zloc))
                                             (= (z/sexpr zloc) :model-imports))))
                              z/right
                              z/child-sexprs
                              not-empty)]
         (testing (format "\n'%s' module :model-imports" module)
           (is (= (sort imports)
                  imports))))))))

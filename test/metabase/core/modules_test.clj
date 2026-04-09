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

(deftest ^:parallel all-modules-have-teams-test
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

(deftest ^:parallel modules-should-be-sorted-by-name-test
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

(deftest ^:parallel module-api-namespaces-should-be-sorted-test
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

(deftest ^:parallel module-uses-should-be-sorted-test
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

(deftest ^:parallel modules-config-up-to-date-test
  (testing (str "Please update .clj-kondo/config/modules/config.edn 🥰\n"
                "[Pro Tip: use (dev.deps-graph/print-kondo-config-diff) to see the changes you need to make in a nicer format]\n")
    ;; Compute dependencies with awareness of the declared modules and their
    ;; `:ns-prefix`es, so nested modules (e.g. `lib.schema` as a child of
    ;; `lib`, or `lib.be` with an explicit :ns-prefix "metabase.lib-be")
    ;; resolve via longest-prefix matching at segment boundaries.
    (let [actual      (dev.deps-graph/kondo-config)
          prefix->mod (dev.deps-graph/build-prefix->module actual)
          deps        (dev.deps-graph/dependencies prefix->mod)
          expected    (dev.deps-graph/generate-config deps actual)
          modules     (set/union (set (keys expected))
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

(defn- declared-modules-set
  "Set of declared module symbols from the kondo config (the outer keys)."
  [config]
  (set (keys config)))

(defn- top-level-ancestor
  "Return the topmost ancestor of module `m` (or `m` itself if it's already
  top-level). Used for subtree-membership checks. Honors the `enterprise/X`
  shorthand when `declared` is provided."
  [declared m]
  (or (last (dev.deps-graph/module-ancestor-chain declared m)) m))

(defn- same-subtree?
  "True if `caller` and `target` share a top-level ancestor — i.e., they're
  both descendants of the same top-level module (or one of them is the
  top-level ancestor of the other)."
  [declared caller target]
  (= (top-level-ancestor declared caller) (top-level-ancestor declared target)))

(defn- top-level-oss-module?
  "True if `m` is a top-level OSS module symbol — no namespace part and a
  name with no dots. Mirror of `hooks.common.modules/top-level-oss-module?`."
  [m]
  (and (nil? (namespace m))
       (not (str/includes? (name m) "."))))

(defn- open-children*
  "Mirror of `hooks.common.modules/open-children`. Returns the `:open` set
  for `parent` including the auto-opened `enterprise/X` counterpart when
  `parent` is a top-level OSS module with a declared EE counterpart."
  [config parent]
  (let [explicit (set (get-in config [parent :open]))
        ee-child (when (top-level-oss-module? parent)
                   (let [candidate (symbol "enterprise" (name parent))]
                     (when (contains? config candidate)
                       candidate)))]
    (cond-> explicit
      ee-child (conj ee-child))))

(defn- externally-referenceable?
  "True if `target` may be named in the `:uses` of a module outside its
  top-level subtree. Equivalent to: every ancestor in the chain from
  target up to top-level is `:open`ed by its parent (and the top-level
  ancestor is implicitly externally referenceable). Mirror of the
  `externally-visible?` helper in the kondo hook."
  [config target]
  (let [declared (declared-modules-set config)]
    (loop [m target]
      (if-let [p (dev.deps-graph/module-parent declared m)]
        (if (contains? (open-children* config p) m)
          (recur p)
          false)
        true))))

(defn- can-be-named-by?
  "True if `caller` is permitted to put `target` in its `:uses` declaration
  under the strict module model. Permitted iff:
    - they share a top-level subtree (anyone in the same subtree can name
      anyone else in the subtree), OR
    - `target` is externally referenceable (top-level OR `:open`ed all the
      way from the root).

  Uses the declared-modules set (from the config) so that the `enterprise/X`
  shorthand is honored: `enterprise/X` is treated as a child of the OSS
  module `X` when `X` is declared."
  [config caller target]
  (let [declared (declared-modules-set config)]
    (or (= caller target)
        (same-subtree? declared caller target)
        (externally-referenceable? config target))))

(deftest ^:parallel uses-references-must-be-namable-test
  (testing (str "Every entry in a module's `:uses` must be a module that the caller is "
                "allowed to name. Outside-of-subtree callers may only name modules that "
                "are externally referenceable (top-level OR `:open`ed by every ancestor "
                "from the root). Same-subtree callers may name any module in the subtree.")
    (let [config   (dev.deps-graph/kondo-config)
          declared (declared-modules-set config)]
      (doseq [[caller cfg] config
              :let          [uses (:uses cfg)]
              :when         (set? uses)
              target        uses
              ;; Skip references to modules that aren't actually declared
              ;; (these will be caught by the staleness test as a separate
              ;; concern; here we only check naming validity for declared
              ;; targets).
              :when         (contains? config target)]
        (testing (format "\n[%s :uses %s]" (pr-str caller) (pr-str target))
          (is (can-be-named-by? config caller target)
              (format
               (str "%s declares :uses #{%s} but cannot name %s under the strict module model. "
                    "Either: (a) move %s into %s's top-level subtree (currently %s vs %s), or "
                    "(b) ensure %s is externally referenceable by adding it to its parent's "
                    ":open set (and recursively up to the top-level).")
               caller target target
               target caller
               (top-level-ancestor declared caller)
               (top-level-ancestor declared target)
               target)))))))

(deftest ^:parallel ns-prefix-uniqueness-test
  (testing (str "Every module has a unique effective :ns-prefix (explicit via :ns-prefix "
                "config key or derived from the module name). Two modules sharing the same "
                "prefix would create ambiguity in namespace→module resolution, so this test "
                "enforces uniqueness across the whole config including implicit defaults.")
    (let [config           (dev.deps-graph/kondo-config)
          effective-prefix (fn [m]
                             (or (get-in config [m :ns-prefix])
                                 (dev.deps-graph/default-ns-prefix m)))
          by-prefix        (group-by effective-prefix (keys config))]
      (doseq [[prefix modules] by-prefix
              :when            (> (count modules) 1)]
        (testing (format "\nprefix %s is claimed by multiple modules: %s"
                         (pr-str prefix)
                         (pr-str (sort modules)))
          (is (= 1 (count modules))
              (format "Modules %s share :ns-prefix %s. Either give them distinct explicit :ns-prefix values, or rename one so its default prefix doesn't collide."
                      (pr-str (sort modules))
                      (pr-str prefix))))))))

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
  Returns `nil` if the file has no recognizable `ns` declaration (e.g.
  scratch files, data resources)."
  [file]
  (try
    (some-> (ns.file/read-file-ns-decl file)
            ns.parse/name-from-ns-decl)
    (catch Throwable _ nil)))

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
            file (source-files-under root)
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
            file (source-files-under root)
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
  "True if `module` is a REST module. Under the nested-modules scheme, rest
  modules are dotted children of their base module (e.g. `queries.rest`
  nested under `queries`) — we identify them by the `.rest` suffix on the
  module name string."
  [module]
  (str/ends-with? (str module) ".rest"))

(deftest ^:parallel do-not-use-rest-modules-in-other-modules-test
  (doseq [[module {:keys [uses], :as _config}] (dev.deps-graph/kondo-config)
          :when                                (not (rest-module? module))
          used-module                          (when (set? uses)
                                                 uses)]
    (is (not (rest-module? used-module))
        (format "Do not use -rest modules (%s) in non-rest modules (%s) -- move things from %s to %s if needed"
                used-module
                module
                used-module
                (symbol (str/replace used-module #"-rest$" ""))))))

;;;; Model boundary tests

(deftest ^:parallel model-boundaries-test
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

(deftest ^:parallel model-config-not-stale-test
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

(deftest ^:parallel model-exports-sorted-test
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

(deftest ^:parallel model-imports-sorted-test
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

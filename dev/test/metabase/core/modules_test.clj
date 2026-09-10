(ns metabase.core.modules-test
  "Tests that the modules config file is configured correctly."
  (:require
   [clojure.edn :as edn]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
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
  (testing "All modules should have a valid effective :team owner"
    (let [teams  (teams)
          config (dev.deps-graph/expanded-kondo-config (modules-config))]
      (doseq [[module config] config]
        (testing (format "\n'%s' module" module)
          (is (or (contains? teams (:team config))
                  (contains? teams-to-reassign (:team config)))
              "Should have a valid :team key"))))))

(deftest ^:parallel expanded-kondo-config-test
  (let [config {'parent               {:team "Parent"}
                'parent.child         {:ns-prefix "metabase.legacy-child"}
                'parent.child.leaf    {:team "Leaf"}
                'enterprise/parent    {}
                'enterprise/standalone {:team "Enterprise"}}
        expanded (dev.deps-graph/expanded-kondo-config config)]
    (testing "children inherit team ownership from the closest configured ancestor"
      (is (= "Parent" (get-in expanded ['parent.child :team])))
      (is (= 'parent (dev.deps-graph/module-team-source config 'parent.child))))
    (testing "an explicit child team overrides its ancestors"
      (is (= "Leaf" (get-in expanded ['parent.child.leaf :team])))
      (is (= 'parent.child.leaf (dev.deps-graph/module-team-source config 'parent.child.leaf))))
    (testing "declared enterprise companions inherit from their OSS parent"
      (is (= "Parent" (get-in expanded ['enterprise/parent :team])))
      (is (= 'parent (dev.deps-graph/module-team-source config 'enterprise/parent))))
    (testing "standalone enterprise modules keep their own ownership"
      (is (= "Enterprise" (get-in expanded ['enterprise/standalone :team])))
      (is (= 'enterprise/standalone
             (dev.deps-graph/module-team-source config 'enterprise/standalone))))
    (testing "config-only defaults are materialized"
      (is (= "metabase.legacy-child" (get-in expanded ['parent.child :ns-prefix])))
      (is (= '#{metabase.legacy-child.api metabase.legacy-child.core metabase.legacy-child.init}
             (get-in expanded ['parent.child :api])))
      (is (= #{} (get-in expanded ['parent.child :uses])))
      (is (= #{} (get-in expanded ['parent.child :friends])))
      (is (= '#{enterprise/parent} (get-in expanded ['parent :module-exports])))))
  (testing "wildcards expand to their effective config and source-aware values"
    (let [config   {'caller        {:uses :any}
                    'parent        {:module-exports #{'parent.open}}
                    'parent.hidden {}
                    'parent.open   {}
                    'public        {:api :any}}
          deps     [{:module 'public :namespace 'metabase.public.alpha}
                    {:module 'public :namespace 'metabase.public.beta}]
          expanded (dev.deps-graph/expanded-kondo-config config deps)]
      (is (= '#{parent parent.open public}
             (get-in expanded ['caller :uses])))
      (is (= '#{metabase.public.alpha metabase.public.beta}
             (get-in expanded ['public :api]))))))

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

(defn- in-subtree?
  "True if `m` is `root` or one of its descendants. Honors the `enterprise/X`
  shorthand when `declared` is provided."
  [declared root m]
  (or (= root m)
      (boolean (some #(= root %) (dev.deps-graph/module-ancestor-chain declared m)))))

(defn- top-level-oss-module?
  "True if `m` is a top-level OSS module symbol — no namespace part and a
  name with no dots. Mirror of `hooks.common.modules/top-level-oss-module?`."
  [m]
  (and (nil? (namespace m))
       (not (str/includes? (name m) "."))))

(defn- open-children*
  "Mirror of `hooks.common.modules/open-children`. Returns the `:module-exports` set
  for `parent` including the auto-opened `enterprise/X` counterpart when
  `parent` is a top-level OSS module with a declared EE counterpart."
  [config parent]
  (let [explicit (set (get-in config [parent :module-exports]))
        ee-child (when (top-level-oss-module? parent)
                   (let [candidate (symbol "enterprise" (name parent))]
                     (when (contains? config candidate)
                       candidate)))]
    (cond-> explicit
      ee-child (conj ee-child))))

(defn- visibility-root
  "The module whose subtree `target` is private to, or `nil` if `target` may be
  named from anywhere. Walk up from `target` to the nearest ancestor that does
  NOT `:module-exports` the module below it on the path; `nil` means the chain
  reached top-level unobstructed. Mirror of the `visibility-root` helper in the
  kondo hook."
  [config target]
  (let [declared (declared-modules-set config)]
    (loop [m target]
      (when-let [p (dev.deps-graph/module-parent declared m)]
        (if (contains? (open-children* config p) m)
          (recur p)
          p)))))

(defn- externally-referenceable?
  "True if `target` may be named in the `:uses` of any module at all, wherever
  it sits in the tree. Equivalent to: every ancestor in the chain from target
  up to top-level is `:module-exports`ed by its parent (and the top-level
  ancestor is implicitly externally referenceable) — i.e. `target` has no
  `visibility-root`. Mirror of the `externally-visible?` helper in the kondo
  hook."
  [config target]
  (nil? (visibility-root config target)))

(defn- can-be-named-by?
  "True if `caller` is permitted to put `target` in its `:uses` declaration
  under the strict module model. Permitted iff:
    - `target` is externally referenceable (top-level OR `:module-exports`ed all
      the way from the root), OR
    - `caller` is inside the subtree of `target`'s `visibility-root` — the
      nearest ancestor that keeps `target` private. Note this is the *nearest*
      such ancestor, not the top-level one: sharing a top-level ancestor is not
      on its own enough to name a deeply-private module.

  Uses the declared-modules set (from the config) so that the `enterprise/X`
  shorthand is honored: `enterprise/X` is treated as a child of the OSS
  module `X` when `X` is declared.

  Mirror of `namable-from?` in `.clj-kondo/src/hooks/common/modules.clj`; the
  two are meant to agree."
  [config caller target]
  (let [declared (declared-modules-set config)]
    (or (= caller target)
        (externally-referenceable? config target)
        (in-subtree? declared (visibility-root config target) caller))))

(deftest ^:parallel uses-references-must-be-namable-test
  (testing (str "Every entry in a module's `:uses` must be a module that the caller is "
                "allowed to name. A nested module is namable from the subtree of the nearest "
                "ancestor that does not `:module-exports` it; outside that subtree it is namable "
                "only if it is externally referenceable (top-level OR `:module-exports`ed by "
                "every ancestor from the root).")
    (let [config (dev.deps-graph/kondo-config)]
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
                    "%s is private to the %s subtree, and %s is outside it. Either: (a) move %s "
                    "into that subtree, or (b) widen %s's visibility by adding it to its parent's "
                    ":module-exports set (and recursively up, as far as it needs to go).")
               caller target target
               target (visibility-root config target) caller
               caller target)))))))

(deftest ^:parallel can-be-named-by?-test
  (testing (str "Naming scope is the subtree of the nearest ancestor that does not export the "
                "module below it on the path — not the whole top-level subtree. Mirrors "
                "`namable-from?` in the kondo hook; the two must agree.")
    (let [config {'outer        {}
                  'outer.a      {}
                  'outer.a.leaf {}
                  'outer.a.sib  {}
                  'outer.b      {}
                  'outer.b.deep {}
                  'unrelated    {}}]
      (testing "top-level modules are namable from anywhere"
        (is (true? (can-be-named-by? config 'unrelated 'outer))))
      (testing "an unopened leaf is namable only from its nearest non-exporting ancestor's subtree"
        (is (true?  (can-be-named-by? config 'outer.a 'outer.a.leaf)))
        (is (true?  (can-be-named-by? config 'outer.a.sib 'outer.a.leaf)))
        (is (false? (can-be-named-by? config 'outer 'outer.a.leaf)))
        (is (false? (can-be-named-by? config 'outer.b 'outer.a.leaf))
            "sharing the top-level module `outer` is not enough")
        (is (false? (can-be-named-by? config 'outer.b.deep 'outer.a.leaf)))
        (is (false? (can-be-named-by? config 'unrelated 'outer.a.leaf))))
      (testing "exporting the leaf widens the scope to the whole `outer` subtree, but no further"
        (let [config (assoc-in config ['outer.a :module-exports] #{'outer.a.leaf})]
          (is (true?  (can-be-named-by? config 'outer 'outer.a.leaf)))
          (is (true?  (can-be-named-by? config 'outer.b.deep 'outer.a.leaf)))
          (is (false? (can-be-named-by? config 'unrelated 'outer.a.leaf)))))
      (testing "exporting the whole chain makes the leaf namable from anywhere"
        (let [config (-> config
                         (assoc-in ['outer.a :module-exports] #{'outer.a.leaf})
                         (assoc-in ['outer :module-exports] #{'outer.a}))]
          (is (true? (can-be-named-by? config 'unrelated 'outer.a.leaf))))))))

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

(deftest ^:parallel nested-modules-have-declared-parents-test
  (testing "Every syntactically nested module has a declared direct parent"
    (let [config   (dev.deps-graph/kondo-config)
          declared (declared-modules-set config)]
      (doseq [module declared
              :let   [parent (dev.deps-graph/module-parent declared module)]
              :when  parent]
        (testing (format "\n%s is nested under %s" module parent)
          (is (contains? declared parent)
              (format "Declare parent module %s before declaring nested module %s."
                      parent
                      module)))))))

(deftest ^:parallel module-exports-are-declared-direct-children-test
  (testing "Every :module-exports entry names a declared direct child"
    (let [config   (dev.deps-graph/kondo-config)
          declared (declared-modules-set config)]
      (doseq [[parent module-config] config
              child                  (:module-exports module-config)]
        (testing (format "\n[%s :module-exports %s]" parent child)
          (is (contains? declared child)
              (format "Exported child %s is not a declared module." child))
          (is (= parent (dev.deps-graph/module-parent declared child))
              (format "%s may only export direct children; %s has parent %s."
                      parent
                      child
                      (dev.deps-graph/module-parent declared child))))))))

(defn- rest-module?
  "True for canonical nested `.rest` modules and deprecated `-rest` compatibility symbols."
  [module]
  (let [module-name (str module)]
    (or (str/ends-with? module-name "-rest")
        (str/ends-with? module-name ".rest"))))

(defn- routes-module?
  "True for route aggregators, which are allowed to assemble REST routes."
  [module]
  (let [module-name (str module)]
    (or (str/ends-with? module-name "-routes")
        (str/ends-with? module-name ".routes"))))

(defn- core-module?
  "True for OSS and EE core initializer modules."
  [module]
  (= (name module) "core"))

(defn- allowed-rest-consumer?
  "Whether `module` may depend on REST modules."
  [module]
  ((some-fn rest-module? routes-module? core-module?) module))

(deftest ^:parallel rest-module-recognition-test
  ;; Deprecated symbols must remain recognizable until they are removed, or they would bypass the guard.
  (are [module] (rest-module? module)
    'queries-rest
    'queries.rest
    'enterprise/queries-rest
    'enterprise/queries.rest)
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
                (symbol (str/replace (str used-module) #"(?:-rest|\.rest)$" ""))))))

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

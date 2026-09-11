(ns metabase.core.modules-test
  "Tests that the modules config file is configured correctly."
  (:require
   [clojure.edn :as edn]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.deps-graph]
   [dev.model-boundary-config]
   [hooks.common.modules :as modules]
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
    (let [teams  (teams)
          config (modules-config)]
      (doseq [module (keys config)
              :let   [team (dev.deps-graph/module-team config module)]]
        (testing (format "\n'%s' module" module)
          (is (or (contains? teams team)
                  (contains? teams-to-reassign team))
              "Should have a valid :team key"))))))

(deftest ^:parallel module-team-test
  (let [config '{parent                {:team "Parent"}
                 parent.child          {}
                 parent.child.leaf     {:team "Leaf"}
                 enterprise/parent     {}
                 enterprise/standalone {:team "Enterprise"}}]
    (are [module team] (= team (dev.deps-graph/module-team config module))
      'parent.child          "Parent"      ; inherited from the nearest configured ancestor
      'parent.child.leaf     "Leaf"        ; an explicit team overrides its ancestors
      'enterprise/parent     "Parent"      ; an EE companion inherits from its OSS parent
      'enterprise/standalone "Enterprise")))

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
          expected (dev.deps-graph/generate-config deps (dev.deps-graph/kondo-config))
          actual   (dev.deps-graph/kondo-config)
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

(deftest ^:parallel uses-references-must-be-namable-test
  (testing "every module named in :uses is visible to the caller"
    (let [config (dev.deps-graph/kondo-config)]
      (doseq [[caller {:keys [uses]}] config
              :when                   (set? uses)
              target                  uses
              ;; The staleness test reports undeclared targets.
              :when                   (contains? config target)]
        (testing (format "\n[%s :uses %s]" caller target)
          (is (nil? (modules/namability-error config caller target))))))))

(deftest ^:parallel ns-prefixes-test
  (let [config (dev.deps-graph/kondo-config)]
    (testing "explicit prefixes are strings under a Metabase namespace root"
      (doseq [[module {:keys [ns-prefix]}] config
              :when                          (some? ns-prefix)]
        (is (and (string? ns-prefix)
                 (re-find #"^metabase(?:-enterprise)?\." ns-prefix))
            (format "Module %s has :ns-prefix %s." module (pr-str ns-prefix)))))
    (testing "effective prefixes are unique"
      (doseq [[prefix claimants] (group-by #(modules/module-ns-prefix config %) (keys config))
              :when              (> (count claimants) 1)]
        (is (= 1 (count claimants))
            (format "Modules %s share :ns-prefix %s." (pr-str (sort claimants)) (pr-str prefix)))))))

(deftest ^:parallel nested-modules-have-declared-parents-test
  (testing "every nested module has a declared direct parent"
    (let [config (dev.deps-graph/kondo-config)]
      (doseq [module (keys config)
              :let   [parent (modules/parent-module config module)]
              :when  parent]
        (testing (format "\n%s is nested under %s" module parent)
          (is (contains? config parent)
              (format "Declare parent module %s before declaring nested module %s."
                      parent
                      module)))))))

(deftest ^:parallel module-exports-are-declared-direct-children-test
  (testing "every :module-exports entry names a declared direct child"
    (let [config (dev.deps-graph/kondo-config)]
      (doseq [[parent module-config] config
              child                  (:module-exports module-config)]
        (testing (format "\n[%s :module-exports %s]" parent child)
          (is (contains? config child)
              (format "Exported child %s is not a declared module." child))
          (is (= parent (modules/parent-module config child))
              (format "%s may only export direct children; %s has parent %s."
                      parent
                      child
                      (modules/parent-module config child))))))))

(deftest ^:parallel rest-children-are-exported-by-their-parent-test
  (testing "every `.rest` child is in its parent's :module-exports, since api-routes names it from outside the subtree"
    (let [config   (dev.deps-graph/kondo-config)
          children (sort (filter #(str/ends-with? (name %) ".rest") (keys config)))]
      (is (seq children) "no `.rest` children, so the check below would hold vacuously")
      (doseq [child children
              :let  [parent (modules/parent-module config child)]]
        (testing (str "\n" child)
          (is (contains? (set (get-in config [parent :module-exports])) child)))))))

(defn- rest-module? [module]
  (re-find #"[.-]rest$" (str module)))

(deftest do-not-use-rest-modules-in-other-modules-test
  (doseq [[module {:keys [uses], :as _config}] (dev.deps-graph/kondo-config)
          :when                                (not (rest-module? module))
          used-module                          (when (set? uses)
                                                 uses)]
    (is (not (rest-module? used-module))
        (format "Do not use -rest modules (%s) in non-rest modules (%s) -- move things from %s to %s if needed"
                used-module
                module
                used-module
                (symbol (str/replace used-module #"[.-]rest$" ""))))))

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

;;;; Module boundary analysis

(deftest ^:parallel strongly-connected-components-test
  (let [graph {:a #{:b}
               :b #{:a :c}
               :c #{}
               :d #{:e}
               :e #{:f}
               :f #{:d}
               :g #{:h}}]
    (is (= #{#{:a :b} #{:c} #{:d :e :f} #{:g} #{:h}}
           (set (dev.deps-graph/strongly-connected-components graph))))
    (is (= [#{:d :e :f} #{:a :b}]
           (dev.deps-graph/cyclic-components graph)))))

(deftest ^:parallel module-boundary-config-values-have-valid-types-test
  (testing "Module boundary keys have the shapes the ratchet counts expect"
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

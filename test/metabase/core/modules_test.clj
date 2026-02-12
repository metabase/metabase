(ns metabase.core.modules-test
  "Tests that the modules config file is configured correctly."
  (:require
   [clojure.edn :as edn]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.deps-graph]
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

(defn- rest-module? [module]
  (str/ends-with? module "-rest"))

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

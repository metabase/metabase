(ns metabase.core.modules-test
  "Tests that the modules config file is configured correctly."
  (:require
   [clojure.edn :as edn]
   [clojure.string :as str]
   [clojure.test :refer :all]
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

(deftest ^:parallel all-modules-have-teams-test
  (testing "All modules should have a valid :team owner"
    (let [teams (teams)]
      (doseq [[module config] (modules-config)]
        (testing (format "\n'%s' module" module)
          (is (contains? teams (:team config))
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

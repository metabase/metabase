(ns metabase.dev.module-metrics-test
  (:require
   [clojure.test :refer :all]
   [dev.deps-graph]
   [dev.module-metrics :as module-metrics]))

(def ^:private deps
  [{:namespace 'metabase.a.core
    :filename  "src/metabase/a/core.clj"
    :module    'a
    :deps      [{:namespace 'metabase.b.core :module 'b}
                {:namespace 'metabase.c.api :module 'c}]}
   {:namespace 'metabase.a.api
    :filename  "src/metabase/a/api.clj"
    :module    'a
    :deps      []}
   {:namespace 'metabase.b.core
    :filename  "src/metabase/b/core.clj"
    :module    'b
    :deps      [{:namespace 'metabase.c.api :module 'c}]}
   {:namespace 'metabase.c.api
    :filename  "src/metabase/c/api.clj"
    :module    'c
    :deps      []}
   {:namespace 'metabase.d.core
    :filename  "src/metabase/d/core.clj"
    :module    'd
    :deps      [{:namespace 'metabase.a.api :module 'a}
                {:namespace 'metabase.c.api :module 'c}]}])

(def ^:private config
  {'a {:api     #{'metabase.a.api}
       :uses    #{'b 'c}
       :friends #{'d}}
   'b {:api  #{'metabase.b.core}
       :uses #{'c}}
   'c {:api #{'metabase.c.api}}
   'd {:api  #{}
       :uses #{'a 'c}}})

(def ^:private module->test-files
  {'a #{"test/metabase/a/a_core_test.clj"}
   'b #{"test/metabase/b/b_core_test.clj"}
   'c #{"test/metabase/c/c_api_test.clj"}
   'd #{"test/metabase/d/d_core_test.clj"}})

(def ^:private direct-deps
  {'a #{'b 'c}
   'b #{'c}
   'c #{}
   'd #{'a 'c}})

(defn- source-file->module [filename]
  (some (fn [{file :filename
              module :module}]
          (when (= file filename)
            module))
        deps))

(defn- transitive-dependents [module]
  (loop [seen #{}
         frontier #{module}]
    (let [next-frontier (into #{}
                              (comp (mapcat (fn [candidate]
                                              (keep (fn [[dependent dep-modules]]
                                                      (when (contains? dep-modules candidate)
                                                        dependent))
                                                    direct-deps)))
                                    (remove seen))
                              frontier)]
      (if (empty? next-frontier)
        seen
        (recur (into seen next-frontier) next-frontier)))))

(defn- relevant-test-files [source-filenames]
  (into (sorted-set)
        (mapcat (fn [source-filename]
                  (let [module (source-file->module source-filename)]
                    (mapcat module->test-files
                            (conj (transitive-dependents module) module)))))
        source-filenames))

(deftest metrics-test
  (with-redefs [dev.deps-graph/source-filenames->relevant-test-filenames
                (fn [_deps _config _prefix->mod source-filenames]
                  (relevant-test-files source-filenames))]
    (let [metrics     (module-metrics/metrics deps config)
          metrics-by-module (into {} (map (juxt :module identity)) metrics)]
      (testing "blast radius metrics prioritize downstream impact and test reruns"
        (is (= {:num-direct-deps 0
                :num-transitive-deps 0
                :num-direct-dependents 3
                :num-transitive-dependents 3
                :max-dependency-depth 0
                :num-downstream-modules-affected 3
                :num-downstream-source-files-affected 4
                :num-affected-source-files 5
                :num-test-files-affected 4}
               (select-keys (get metrics-by-module 'c)
                            [:num-direct-deps
                             :num-transitive-deps
                             :num-direct-dependents
                             :num-transitive-dependents
                             :max-dependency-depth
                             :num-downstream-modules-affected
                             :num-downstream-source-files-affected
                             :num-affected-source-files
                             :num-test-files-affected]))))
      (testing "config and graph metrics stay available alongside the blast radius counts"
        (is (= {:top-level? true
                :num-direct-deps 2
                :num-transitive-deps 2
                :num-transitive-namespaces-reachable 2
                :num-direct-dependents 1
                :num-transitive-dependents 1
                :avg-dependency-path-length 1.0
                :leaf? false
                :root? false
                :num-namespaces 2
                :num-lines 0
                :num-externally-used-namespaces 0
                :num-declared-api-namespaces 1
                :num-derived-api-namespaces 0
                :num-unexpected-api-namespaces 0
                :num-undeclared-api-namespaces 0
                :num-declared-friends 1
                :num-friend-exposed-namespaces 1
                :num-direct-uses 2
                :percent-of-repo-source-files-affected 0.6
                :percent-of-repo-test-files-affected 0.5}
               (select-keys (get metrics-by-module 'a)
                            [:top-level?
                             :num-direct-deps
                             :num-transitive-deps
                             :num-transitive-namespaces-reachable
                             :num-direct-dependents
                             :num-transitive-dependents
                             :avg-dependency-path-length
                             :leaf?
                             :root?
                             :num-namespaces
                             :num-lines
                             :num-externally-used-namespaces
                             :num-declared-api-namespaces
                             :num-derived-api-namespaces
                             :num-unexpected-api-namespaces
                             :num-undeclared-api-namespaces
                             :num-declared-friends
                             :num-friend-exposed-namespaces
                             :num-direct-uses
                             :percent-of-repo-source-files-affected
                             :percent-of-repo-test-files-affected])))))))

(deftest repo-metrics-test
  (with-redefs [dev.deps-graph/source-filenames->relevant-test-filenames
                (fn [_deps _config _prefix->mod source-filenames]
                  (relevant-test-files source-filenames))]
    (is (= {:num-module-nodes 4
            :num-direct-edges 5
            :avg-out-degree 1.25
            :max-in-degree 3
            :top-decile-fan-in-share 0.6
            :num-leaf-modules 1
            :num-root-modules 1
            :num-top-level-modules 4
            :num-modules-in-2cycles 0
            :num-2cycle-edges 0
            :num-nontrivial-sccs 0
            :num-modules-in-any-scc 0
            :largest-scc-size 1
            :sum-squared-scc-sizes 4
            :namespaces-in-cyclic-modules 0
            :frac-namespaces-in-cyclic-modules 0.0
            :num-friend-edges 1
            :num-modules-with-friends 1
            :friend-exposed-namespaces 1
            :privileged-internal-access-paths 1
            :encapsulation-index 0.8
            :total-declared-api-namespaces 3
            :api-surface-ratio 0.6
            :num-undeclared-api-leaks 0
            :namespaces-per-module {:min 1 :p10 1 :p25 1 :mean 1.25 :median 1 :p90 2 :max 2 :total 5}
            :lines-per-module {:min 0 :p10 0 :p25 0 :mean 0.0 :median 0 :p90 0 :max 0 :total 0}
            :transitive-namespaces-reachable-per-module {:min 0 :p10 0 :p25 0 :mean 1.75 :median 1 :p90 4 :max 4 :total 7}
            :num-source-files 5
            :num-test-files 4
            :avg-tests-rerun-per-changed-source-file 2.4
            :median-tests-rerun-per-changed-source-file 2
            :frac-source-files-rerunning-majority-of-tests 0.4
            :avg-downstream-modules-affected-per-changed-source-file 1.4}
           (module-metrics/repo-metrics deps config)))))

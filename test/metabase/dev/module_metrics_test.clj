(ns metabase.dev.module-metrics-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.deps-graph]
   [dev.module-metrics :as module-metrics]
   [metabase.test :as mt]))

(def ^:private deps
  [{:namespace 'metabase.a.core
    :filename  "src/metabase/a/core.clj"
    :module    'a
    :deps      [{:namespace 'metabase.b.core, :module 'b}
                {:namespace 'metabase.c.api,  :module 'c}]}
   {:namespace 'metabase.a.api
    :filename  "src/metabase/a/api.clj"
    :module    'a
    :deps      []}
   {:namespace 'metabase.b.core
    :filename  "src/metabase/b/core.clj"
    :module    'b
    :deps      [{:namespace 'metabase.c.api, :module 'c}]}
   {:namespace 'metabase.c.api
    :filename  "src/metabase/c/api.clj"
    :module    'c
    :deps      []}
   {:namespace 'metabase.d.core
    :filename  "src/metabase/d/core.clj"
    :module    'd
    :deps      [{:namespace 'metabase.a.api, :module 'a}
                {:namespace 'metabase.c.api, :module 'c}]}])

(def ^:private config
  {'a {:api     #{'metabase.a.api}
       :uses    #{'b 'c}
       :friends #{'d}}
   'b {:api     #{'metabase.b.core}
       :uses    #{'c}}
   'c {:api     #{'metabase.c.api}}
   'd {:api     #{}
       :uses    #{'a 'c}}})

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

(deftest ^:parallel metrics-test
  (mt/with-dynamic-fn-redefs [dev.deps-graph/source-filenames->relevant-test-filenames
                              (fn [_deps _config _prefix->mod source-filenames]
                                (relevant-test-files source-filenames))]
    (let [metrics           (module-metrics/metrics deps config)
          metrics-by-module (into {} (map (juxt :module identity)) metrics)]
      (testing "blast radius metrics prioritize downstream impact and test reruns"
        (is (= {:dependencies {:direct-count             0
                               :transitive-count         0
                               :reachable-namespace-count 0
                               :max-depth                0}
                :dependents   {:direct-count             3
                               :transitive-count         3}
                :cycles       {:component-size           1
                               :in-largest-component?     false}
                :blast-radius {:source-file-count         5
                               :test-file-count           4}}
               (select-keys (get metrics-by-module 'c)
                            [:dependencies :dependents :cycles :blast-radius]))))
      (testing "config and graph metrics stay available alongside the blast radius counts"
        (is (= {:top-level?    true
                :dependencies {:direct-count                 2
                               :transitive-count             2
                               :reachable-namespace-count    2
                               :max-depth                    1}
                :dependents   {:direct-count                 1
                               :transitive-count             1}
                :size         {:namespace-count              2
                               :line-count                   0}
                :api          {:declared-namespace-count     1
                               :used-namespace-count         0
                               :noncanonical-namespace-count 0
                               :undeclared-namespace-count   0}
                :friends      {:count                        1
                               :exposed-namespace-count      1}
                :blast-radius {:source-file-count            3
                               :test-file-count              2}}
               (select-keys (get metrics-by-module 'a)
                            [:top-level?
                             :dependencies
                             :dependents
                             :size
                             :api
                             :friends
                             :blast-radius])))))))

(deftest ^:parallel repo-metrics-test
  (mt/with-dynamic-fn-redefs [dev.deps-graph/source-filenames->relevant-test-filenames
                              (fn [_deps _config _prefix->mod source-filenames]
                                (relevant-test-files source-filenames))]
    (is (= {:graph         {:module-count                            4
                            :top-level-module-count                  4
                            :edge-count                              5
                            :mean-out-degree                         1.25
                            :max-in-degree                           3
                            :top-decile-in-degree-share              0.6}
            :cycles        {:cyclic-module-count                     0
                            :largest-component-module-count          0
                            :cyclic-namespace-count                  0
                            :cyclic-namespace-ratio                  0.0}
            :encapsulation {:friend-edge-count                       1
                            :friend-exposed-namespace-count          1
                            :privileged-access-path-count            1
                            :api-namespace-count                     3
                            :api-surface-ratio                       0.6
                            :undeclared-api-namespace-count          0}
            :size          {:namespace-count                         5
                            :line-count                              0
                            :namespaces-per-module
                            {:p25 1, :mean 1.25, :median 1, :p90 2, :max 2}
                            :lines-per-module
                            {:p25 0, :mean 0.0,  :median 0, :p90 0, :max 0}
                            :reachable-namespaces-per-module
                            {:p25 0, :mean 1.75, :median 1, :p90 4, :max 4}}
            :blast-radius  {:source-file-count                       5
                            :test-file-count                         4
                            :mean-test-files-per-source-file         2.4
                            :majority-test-suite-source-file-ratio   0.4
                            :mean-downstream-modules-per-source-file 1.4}}
           (module-metrics/repo-metrics deps config)))))

(deftest ^:parallel empty-repo-metrics-test
  (let [metrics (module-metrics/repo-metrics [] {})]
    (is (= {:module-count                0
            :top-level-module-count      0
            :edge-count                  0
            :mean-out-degree             0.0
            :max-in-degree               0
            :top-decile-in-degree-share 0.0}
           (:graph metrics)))
    (is (= {:cyclic-module-count            0
            :largest-component-module-count 0
            :cyclic-namespace-count         0
            :cyclic-namespace-ratio         0.0}
           (:cycles metrics)))
    (is (= {:p25 0, :mean 0.0, :median 0, :p90 0, :max 0}
           (get-in metrics [:size :namespaces-per-module])))
    (is (= 0.0 (get-in metrics [:blast-radius :mean-test-files-per-source-file])))))

(deftest ^:parallel csv-test
  (mt/with-dynamic-fn-redefs [dev.deps-graph/source-filenames->relevant-test-filenames
                              (fn [_deps _config _prefix->mod source-filenames]
                                (relevant-test-files source-filenames))]
    (let [header (first (str/split-lines (with-out-str (module-metrics/csv deps config))))]
      (is (str/includes? header "dependencies.direct-count"))
      (is (str/includes? header "api.declared-namespace-count"))
      (is (str/includes? header "blast-radius.test-file-count")))))

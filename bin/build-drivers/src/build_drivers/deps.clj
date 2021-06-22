(ns build-drivers.deps
  (:require [clojure.set :as set]
            [clojure.tools.deps.alpha :as deps]
            [clojure.tools.deps.alpha.tree :as tree]
            [colorize.core :as colorize]
            [metabuild-common.core :as u]))

(defn- edn []
  (deps/merge-edns ((juxt :root-edn :project-edn) (deps/find-edn-maps))))

(defn- libs [aliases]
  (let [edn      (edn)
        combined (deps/combine-aliases edn aliases)]
    (deps/resolve-deps (deps/tool edn combined) (assoc combined :trace true))))

(defn- libs-tree [aliases]
  (let [libs (libs aliases)
        tree (tree/trace->tree (-> libs meta :trace))]
    (:children tree)))

(defn- dep-children [tree dep]
  (set (keys (get-in tree [dep :children]))))

(defn- dep-descendants
  ([tree dep]
   (dep-descendants (get-in tree [dep :children])))

  ([children-tree]
   (transduce
    (map (fn [[dep tree]]
           (into #{dep} (dep-descendants (:children tree)))))
    set/union
    #{}
    children-tree)))

(defn provided-deps [provided-aliases top-level-provided-deps]
  (let [tree (libs-tree provided-aliases)]
    (transduce
     (map (fn [top-level-dep]
            (dep-descendants tree top-level-dep)))
     set/union
     #{}
     (cons 'org.clojure/clojure top-level-provided-deps))))

(defn needed-deps [aliases]
  (provided-deps aliases (keys (:deps (edn)))))

(defn unprovided-deps [jar-aliases provided-aliases top-level-provided-deps]
  (let [provided (provided-deps provided-aliases top-level-provided-deps)
        needed   (needed-deps jar-aliases)]
    (set/difference needed provided)))

(defn- deps-diff [jar-aliases provided-aliases top-level-provided-deps]
  (let [#_jar-deps      #_(needed-deps jar-aliases)
        #_provided-deps #_(provided-deps provided-aliases top-level-provided-deps)
        unprovided-deps (unprovided-deps jar-aliases provided-aliases top-level-provided-deps)]
    (letfn [(print-deps [deps]
              (doseq [dep (sort deps)]
                (u/announce "    %s" dep)))]
      (u/announce (colorize/red "These dependencies are required, but not provided:"))
      (print-deps unprovided-deps)
      ;; (u/announce (colorize/yellow "These dependencies are provided, but not required:"))
      ;; (print-deps only-in-provided)
      ;; (u/announce (colorize/green "These dependencies are required, but ARE provided:"))
      ;; (print-deps in-both)
      unprovided-deps
      #_diff)))

(defn reducible-deps [jar-aliases provided-aliases top-level-provided-deps]
  (let [merged-basis  (merge (:libs (basis jar-aliases))
                             (:libs (basis provided-aliases)))
        required-deps (deps-diff jar-aliases provided-aliases top-level-provided-deps)]
    (u/announce (colorize/yellow (format "required-deps: %s" (pr-str required-deps)))) ; NOCOMMIT
    (select-keys merged-basis required-deps)))

(defn x []
  (reducible-deps nil #{:build} '[metabase/metabase-core org.clojure/clojure]))

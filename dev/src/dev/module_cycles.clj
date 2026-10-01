(ns dev.module-cycles
  "Named cyclic clusters of the module require graph.

  `.clj-kondo/config/modules/cycle-clusters.edn` maps each cluster's name to an anchor module, and the cluster
  holding the anchor carries the name. Membership is computed, never recorded, so a cluster growing or
  shrinking needs no edit.
  Every cluster has exactly one anchor: two anchors in one cluster mean two named clusters merged, a cluster with
  none is a new cycle or the unnamed half of a split, and an anchor in no cluster names a cycle that is gone.
  People choose the names, so the file changes only when the set of clusters does."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [dev.deps-graph :as deps-graph]))

(set! *warn-on-reflection* true)

(def clusters-file
  "The cluster names, relative to the repo root."
  ".clj-kondo/config/modules/cycle-clusters.edn")

;;;; =============================================================================
;;;; Reading the names
;;;; =============================================================================

(defn- read-form
  "The one EDN form in the file at `path`.
  An empty file or a second form is an error rather than an empty map, which would leave every cycle unnamed."
  [path]
  (with-open [reader (java.io.PushbackReader. (io/reader path))]
    (let [eof  (Object.)
          form (edn/read {:eof eof} reader)]
      (when (identical? eof form)
        (throw (ex-info (str path " is empty; expected a map of cluster name to anchor module")
                        {:file path})))
      (when-not (identical? eof (edn/read {:eof eof} reader))
        (throw (ex-info (str path " holds more than one form; expected one map")
                        {:file path})))
      form)))

(defn validate-anchors
  "`anchors` when it maps simple-symbol cluster names to module symbols, no module anchoring two names.
  Throws otherwise."
  [anchors]
  (when-not (map? anchors)
    (throw (ex-info (str clusters-file " must hold a map of cluster name to anchor module, not " (pr-str anchors))
                    {:anchors anchors})))
  (doseq [[cluster-name anchor] anchors]
    (when-not (simple-symbol? cluster-name)
      (throw (ex-info (format "%s is not a cluster name; names are simple symbols" (pr-str cluster-name))
                      {:cluster cluster-name})))
    (when-not (symbol? anchor)
      (throw (ex-info (format "%s must be anchored by a module symbol, not %s" cluster-name (pr-str anchor))
                      {:cluster cluster-name, :anchor anchor}))))
  (doseq [[anchor names] (group-by val anchors)
          :when (< 1 (count names))]
    (throw (ex-info (format "%s anchors more than one cluster: %s" anchor (str/join ", " (sort (map key names))))
                    {:anchor anchor, :clusters (sort (map key names))})))
  anchors)

(defn read-anchors
  "Parsed and validated contents of the file at `path`, [[clusters-file]] by default."
  ([]
   (read-anchors clusters-file))
  ([path]
   (when-not (.exists (io/file path))
     (throw (ex-info (str path " is missing") {:file path})))
   (validate-anchors (read-form path))))

;;;; =============================================================================
;;;; Naming clusters
;;;; =============================================================================

(defn- degree
  "How many edges of `graph` inside `cluster` touch `module`."
  [graph cluster module]
  (+ (count (filter cluster (get graph module)))
     (count (filter #(contains? (get graph %) module) cluster))))

(defn propose
  "A name and anchor for an unnamed `cluster` of `graph`, avoiding the names in `taken`.
  The anchor is the member with the most edges inside the cluster, ties broken alphabetically, and the name is
  derived from it: `sync` gives `sync-knot`, `enterprise/transforms.python` gives
  `enterprise-transforms-python-knot`."
  [graph cluster taken]
  (let [anchor     (first (sort-by (juxt #(- (degree graph cluster %)) str) cluster))
        stem       (str (str/replace (str anchor) #"[/.]" "-") "-knot")
        candidates (cons stem (map #(str stem "-" %) (iterate inc 2)))]
    {:name   (symbol (first (remove (comp (set taken) symbol) candidates)))
     :anchor anchor}))

(defn- module-list
  "`modules`, sorted, on one line, truncated so one large cluster cannot bury the rest of the report."
  [modules]
  (let [sorted (sort modules)
        shown  (take 8 sorted)]
    (str (str/join ", " shown)
         (when (< (count shown) (count sorted))
           (format " (and %d more)" (- (count sorted) (count shown)))))))

(defn- shortest-path
  "The shortest chain of requires from `from` to `to` that stays inside `cluster`, as a vector of modules."
  [graph cluster from to]
  (loop [frontier [[from]]
         seen     #{from}]
    (when-let [[path & more] (seq frontier)]
      (let [here (peek path)]
        (if (= here to)
          path
          (let [nexts (remove seen (filter cluster (sort (get graph here))))]
            (recur (into (vec more) (map #(conj path %)) nexts)
                   (into seen nexts))))))))

(defn- merge-message [graph cluster anchors-in]
  (let [[[name-a anchor-a] [name-b anchor-b]] anchors-in
        chain #(str/join " -> " (shortest-path graph cluster %1 %2))]
    (str/join
     "\n"
     [(format "%s merged into one cycle of %d modules."
              (str/join " and " (map first anchors-in)) (count cluster))
      (str "  This undoes the work that kept them apart, and the merged tangle is hard to cut apart again."
           " Please find another way.")
      (format "  %s reaches %s through %s" name-a name-b (chain anchor-a anchor-b))
      (format "  %s reaches %s through %s" name-b name-a (chain anchor-b anchor-a))
      (str "  The require that joined them is most likely on one of these chains, probably one your change added."
           " Cut it, for example by moving the code that needs it, or by inverting the dependency with an event or"
           " a multimethod.")
      (str "  Only if there is truly no way around it: remove all but one of the names from "
           clusters-file " and explain why in the PR.")])))

(defn- requires-within
  "The requires between members of `cluster`, as `from -> to` lines, which show why it is a cycle.
  Nil for a cluster too large to list them usefully."
  [graph cluster]
  (when (<= (count cluster) 10)
    (for [from (sort cluster)
          to   (sort (filter cluster (get graph from)))]
      (str "    " from " -> " to))))

(defn- unnamed-message [graph cluster {:keys [name anchor]}]
  (str/join
   "\n"
   (concat
    [(format "A cluster without a name: %d modules, %s." (count cluster) (module-list cluster))]
    (when-let [lines (seq (requires-within graph cluster))]
      (cons "  It is a cycle through these requires:" lines))
    [(str "  If your change split a cluster in two, that is a real improvement: thank you."
          " You get to name the new one.")
     (str "  Names follow a space theme, with some link to what the cluster does. For ideas, ask your agent to use"
          " the name-module-cycle skill in .claude/skills/name-module-cycle.")
     (format "  Then add a line like `%s %s` to %s. Any member can be the anchor." name anchor clusters-file)
     "  If this is a brand new cycle instead, break it rather than naming it."])))

(defn- dissolved-message [cluster-name anchor]
  (str/join
   "\n"
   [(format "%s is no longer a cycle: %s is not in any cluster. Nice work." cluster-name anchor)
    (format "  Remove its line from %s to retire the name." clusters-file)]))

(defn problems
  "Messages for every way the cyclic clusters of `graph` and `anchors` disagree, empty when each cluster holds
  exactly one anchor and each anchor is a module in a cluster.
  `modules` is every configured module."
  [graph modules anchors]
  (let [clusters  (deps-graph/cyclic-components graph)
        anchor->n (into {} (map (juxt val key)) anchors)
        anchors-in (fn [cluster] (sort (keep (fn [m] (when-let [n (anchor->n m)] [n m])) cluster)))
        in-any    (into #{} cat clusters)
        unnamed   (filter (comp empty? anchors-in) clusters)
        proposals (first (reduce (fn [[acc taken] cluster]
                                   (let [p (propose graph cluster taken)]
                                     [(conj acc [cluster p]) (conj taken (:name p))]))
                                 [[] (set (keys anchors))]
                                 unnamed))]
    (concat
     (for [cluster clusters
           :let    [named (anchors-in cluster)]
           :when   (< 1 (count named))]
       (merge-message graph cluster named))
     (for [[cluster proposal] proposals]
       (unnamed-message graph cluster proposal))
     (for [[cluster-name anchor] (sort-by key anchors)
           :when (not (contains? in-any anchor))]
       (if (contains? modules anchor)
         (dissolved-message cluster-name anchor)
         (format "%s is anchored on %s, which is not a module. Anchor it on another module of the cluster in %s."
                 cluster-name anchor clusters-file))))))

;;;; =============================================================================
;;;; The repository
;;;; =============================================================================

(defn report
  "What CI says about the current tree: the [[problems]] between the module require graph and
  [[clusters-file]]."
  []
  (let [config (deps-graph/kondo-config)]
    (vec (problems (deps-graph/module-dependencies (deps-graph/dependencies))
                   (set (keys config))
                   (read-anchors)))))

(defn print-clusters
  "Print every cyclic cluster of the module require graph with its name, anchor, teams and full membership, for
  choosing a name. Run it with `clojure -X:dev dev.module-cycles/print-clusters`."
  [_]
  (let [config    (deps-graph/kondo-config)
        graph     (deps-graph/module-dependencies (deps-graph/dependencies))
        anchors   (read-anchors)
        anchor->n (into {} (map (juxt val key)) anchors)]
    ;; Unnamed clusters first: they are the ones someone is here to name.
    (doseq [cluster (sort-by #(boolean (some anchor->n %)) (deps-graph/cyclic-components graph))
            :let    [named (sort (keep (fn [m] (when-let [n (anchor->n m)] [n m])) cluster))]]
      (println (if (seq named)
                 (str/join " + " (map (fn [[n m]] (format "%s (anchor %s)" n m)) named))
                 (let [{:keys [name anchor]} (propose graph cluster (keys anchors))]
                   (format "unnamed (placeholder %s, anchor %s)" name anchor))))
      (println (format "  %d modules, teams: %s" (count cluster)
                       (str/join ", " (sort (distinct (keep #(get-in config [% :team]) cluster))))))
      (doseq [module (sort cluster)]
        (println (str "  " module)))
      (when-let [lines (and (empty? named) (seq (requires-within graph cluster)))]
        (println "  requires:")
        (run! println lines))
      (println))))

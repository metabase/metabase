(ns dev.module-cycles
  "Named cyclic clusters of the module require graph.

  The file at [[cycle-names/clusters-file]] names each cluster by an anchor module.
  The cluster holding the anchor carries the name.
  Membership is computed, never recorded, so a cluster can grow or shrink without an edit.
  Every cluster must hold exactly one anchor.
  Two anchors in one cluster mean two named clusters merged.
  A cluster without one is a new cycle or the unnamed half of a split.
  An anchor in no cluster names a cycle that is gone."
  (:require
   [clojure.string :as str]
   [dev.deps-graph :as deps-graph]
   [dev.module-cycle-names :as cycle-names]
   [dev.module-graph :as module-graph]
   [hooks.common.modules :as modules]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;;; =============================================================================
;;;; Finding problems
;;;; =============================================================================

(defn- degree
  "How many edges of `graph` inside `cluster` touch `module`."
  [graph cluster module]
  (+ (count (filter cluster (get graph module)))
     (count (filter #(contains? (get graph %) module) cluster))))

(defn propose
  "A placeholder `{:name :anchor}` for an unnamed `cluster` of `graph`, avoiding the names in `taken`.
  Nil when no member of the cluster is among `modules`.
  The anchor is the member among `modules` with the most requires inside the cluster, ties broken alphabetically.
  The name comes from the anchor, so `enterprise/transforms.python` gives `enterprise-transforms-python-knot`."
  [graph modules cluster taken]
  (when-let [members (seq (filter modules cluster))]
    (let [anchor (first (sort-by (juxt #(- (degree graph cluster %)) str) members))
          stem   (str (str/replace (str anchor) #"[/.]" "-") "-knot")
          names  (cons stem (map #(str stem "-" %) (iterate inc 2)))]
      {:name   (symbol (first (remove (comp (set taken) symbol) names)))
       :anchor anchor})))

(defn- proposals
  "Map each of the `unnamed` clusters to its [[propose]] result, no two placeholders sharing a name."
  [graph modules anchors unnamed]
  (first (reduce (fn [[acc taken] cluster]
                   (let [p (propose graph modules cluster taken)]
                     [(assoc acc cluster p) (cond-> taken p (conj (:name p)))]))
                 [{} (set (keys anchors))]
                 unnamed)))

(defn- shortest-path
  "The shortest chain of requires from `from` to `to` that stays inside `cluster`, as a vector of modules."
  [graph cluster from to]
  (loop [frontier (conj clojure.lang.PersistentQueue/EMPTY [from])
         seen     #{from}]
    (when-let [path (peek frontier)]
      (if (= (peek path) to)
        path
        (let [nexts (remove seen (filter cluster (sort (get graph (peek path)))))]
          (recur (into (pop frontier) (map #(conj path %)) nexts)
                 (into seen nexts)))))))

(defn- requires-within
  "The requires between members of `cluster`, as sorted `[from to]` pairs."
  [graph cluster]
  (vec (for [from (sort cluster)
             to   (sort (filter cluster (get graph from)))]
         [from to])))

(defn- names-in
  "A function of a cluster returning the `[name anchor]` pairs inside it, sorted by name.
  Only anchors among `modules` count."
  [modules anchors]
  (let [anchor->name (u/for-map [[cluster-name anchor] anchors
                                 :when (modules anchor)]
                       [anchor cluster-name])]
    (fn [cluster]
      (sort (for [module cluster
                  :let  [cluster-name (anchor->name module)]
                  :when cluster-name]
              [cluster-name module])))))

(defn- merge-problem
  "The `:merge` problem for `cluster`, which holds the `named` `[name anchor]` pairs."
  [graph cluster named]
  (let [[[name-a anchor-a] & others] named]
    {:type    :merge
     :cluster cluster
     :names   (mapv first named)
     :chains  (vec (for [[name-b anchor-b] others
                         [from to from-anchor to-anchor] [[name-a name-b anchor-a anchor-b]
                                                          [name-b name-a anchor-b anchor-a]]]
                     {:from from, :to to, :path (shortest-path graph cluster from-anchor to-anchor)}))}))

(defn problems
  "Every way the cyclic clusters of `graph` disagree with the cluster names in `anchors`, as maps keyed by `:type`.
  Empty when each cluster holds exactly one anchor, and each anchor is among `modules` and in a cluster.

  - `:merge`, two or more named clusters in one cycle: `:cluster`, `:names`, and `:chains` of `{:from :to :path}`
    linking the first name's anchor to each other's, both ways
  - `:unnamed`, a cluster with no name: `:cluster`, its `:requires` as `[from to]` pairs, and a [[propose]]
    `:proposal`, nil when none of its modules is among `modules`
  - `:anchor-left`, a name whose anchor is in no cycle: `:name`, `:anchor`
  - `:undeclared-anchor`, a name anchored on a module not among `modules`: `:name`, `:anchor`"
  [graph modules anchors]
  (let [components   (module-graph/cyclic-components graph)
        clusters     (map (juxt identity (names-in modules anchors)) components)
        in-any       (into #{} cat components)
        undeclared   (into #{} (remove modules) (vals anchors))
        ;; A cluster holding an undeclared anchor already has a name waiting on it, so it gets only that problem.
        unnamed      (keep (fn [[cluster named]]
                             (when (and (empty? named) (not-any? undeclared cluster))
                               cluster))
                           clusters)
        placeholders (proposals graph modules anchors unnamed)]
    (vec (concat
          (for [[cluster named] clusters
                :when (< 1 (count named))]
            (merge-problem graph cluster named))
          (for [cluster unnamed]
            {:type     :unnamed
             :cluster  cluster
             :requires (requires-within graph cluster)
             :proposal (placeholders cluster)})
          (keep (fn [[cluster-name anchor]]
                  (cond
                    (not (modules anchor))  {:type :undeclared-anchor, :name cluster-name, :anchor anchor}
                    (not (in-any anchor))   {:type :anchor-left, :name cluster-name, :anchor anchor}))
                (sort-by key anchors))))))

;;;; =============================================================================
;;;; Messages
;;;; =============================================================================

(defn- module-list
  "The sorted `modules` on one line, cut off after eight."
  [modules]
  (let [sorted (sort modules)
        shown  (take 8 sorted)]
    (str (str/join ", " shown)
         (when (< (count shown) (count sorted))
           (format " (and %d more)" (- (count sorted) (count shown)))))))

(defn- requires-lines
  "The `requires` of `cluster` as indented `from -> to` lines, or nil for a cluster of more than ten modules."
  [cluster requires]
  (when (<= (count cluster) 10)
    (for [[from to] requires]
      (str "    " from " -> " to))))

(defn- merge-lines [{:keys [cluster names chains]}]
  (concat
   [(format "%s merged into one cycle of %d modules." (str/join " and " names) (count cluster))
    (str "  This undoes the work that kept them apart, and the merged tangle is hard to cut apart again."
         " Please find another way.")]
   (for [{:keys [from to path]} chains]
     (format "  %s reaches %s through %s" from to (str/join " -> " path)))
   [(str "  The require that joined them is most likely on one of these chains, probably one your change added."
         " Cut it, for example by moving the code that needs it, or by inverting the dependency with an event or"
         " a multimethod.")
    (str "  If instead only an anchor moved, and the cluster it left is still a cycle, anchor that name on a module"
         " still in it.")
    (str "  Only if there is truly no way around it: remove all but one of the names from "
         cycle-names/clusters-file " and explain why in the PR.")]))

(defn- unnamed-lines [{:keys [cluster requires proposal]}]
  (concat
   [(format "A cluster without a name: %d modules, %s." (count cluster) (module-list cluster))]
   (when-let [lines (seq (requires-lines cluster requires))]
     (cons "  It is a cycle through these requires:" lines))
   [(str "  If your change split a cluster in two, that is a real improvement: thank you."
         " You get to name the new one.")
    (str "  Names follow a space theme, with some link to what the cluster does. For ideas, ask your agent to use"
         " the name-module-cycle skill in .claude/skills/name-module-cycle.")
    (if-let [{:keys [name anchor]} proposal]
      (format "  Then add a line like `%s %s` to %s. Any declared member can be the anchor." name anchor
              cycle-names/clusters-file)
      (str "  None of its modules is declared in .clj-kondo/config/modules/config.edn yet. Add an entry with a :team"
           " for each, run `./bin/mage fix-modules-config` to fill in the rest, then anchor the name on one of them."))
    "  If this is a brand new cycle instead, break it rather than naming it."]))

(defn- anchor-left-lines [{cluster-name :name, :keys [anchor]}]
  [(format "%s is anchored on %s, which is no longer in any cycle." cluster-name anchor)
   (str "  If the rest of the cluster is still a cycle, reported above without a name, keep the name and anchor it"
        " on one of its modules instead.")
   (format "  Otherwise the cycle is gone. Nice work. Remove its line from %s to retire the name."
           cycle-names/clusters-file)])

(defn- undeclared-anchor-lines [{cluster-name :name, :keys [anchor]}]
  [(format (str "%s is anchored on %s, which is not a declared module. Declare it in"
                " .clj-kondo/config/modules/config.edn, or anchor the name on a declared module in %s.")
           cluster-name anchor cycle-names/clusters-file)])

(defn message
  "The failure message for one of the [[problems]]."
  [problem]
  (str/join "\n" ((case (:type problem)
                    :merge             merge-lines
                    :unnamed           unnamed-lines
                    :anchor-left       anchor-left-lines
                    :undeclared-anchor undeclared-anchor-lines)
                  problem)))

;;;; =============================================================================
;;;; The repository
;;;; =============================================================================

(defn- repository
  "The module config, require graph, configured modules and cluster names of the current tree."
  []
  (let [config (deps-graph/kondo-config)]
    {:config  config
     :graph   (deps-graph/module-dependencies (deps-graph/dependencies (modules/build-prefix->module config)))
     :modules (set (keys config))
     :anchors (cycle-names/read-anchors)}))

(defn report
  "The failure messages for the [[problems]] between the current tree's module graph and [[cycle-names/clusters-file]]."
  []
  (let [{:keys [graph modules anchors]} (repository)]
    (mapv message (problems graph modules anchors))))

(defn print-clusters
  "Print every cyclic cluster of the module require graph with its name, anchor, teams and members, unnamed first.
  Run it with `clojure -X:dev dev.module-cycles/print-clusters`."
  [_]
  (let [{:keys [config graph modules anchors]} (repository)
        named-in     (names-in modules anchors)
        ;; Unnamed clusters first: they are the ones someone is here to name.
        clusters     (sort-by #(boolean (seq (named-in %))) (module-graph/cyclic-components graph))
        placeholders (proposals graph modules anchors (remove (comp seq named-in) clusters))]
    (doseq [cluster clusters
            :let    [named (named-in cluster)]]
      (println (if (seq named)
                 (str/join " + " (map (fn [[n m]] (format "%s (anchor %s)" n m)) named))
                 (if-let [{:keys [name anchor]} (placeholders cluster)]
                   (format "unnamed (placeholder %s, anchor %s)" name anchor)
                   "unnamed (no declared module to anchor on)")))
      (println (format "  %d modules, teams: %s" (count cluster)
                       (str/join ", " (sort (distinct (keep #(get-in config [% :team]) cluster))))))
      (doseq [module (sort cluster)]
        (println (str "  " module)))
      (when-let [lines (and (empty? named) (seq (requires-lines cluster (requires-within graph cluster))))]
        (println "  requires:")
        (run! println lines))
      (println))))

(ns dev.module-cycles
  "Named cyclic clusters of the module require graph.

  The file at [[clusters-file]] names each cluster by an anchor module: the cluster holding it carries the name.
  Membership is computed, never recorded, so a cluster can grow or shrink without an edit.
  Every cluster must hold exactly one anchor.
  Two anchors in one cluster mean two named clusters merged.
  A cluster without one is a new cycle or the unnamed half of a split.
  An anchor in no cluster names a cycle that is gone."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [dev.deps-graph :as deps-graph]
   [hooks.common.modules :as modules]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def clusters-file
  "The file of cluster names, relative to the repo root."
  ".clj-kondo/config/modules/cycle-clusters.edn")

;;;; =============================================================================
;;;; Reading the names
;;;; =============================================================================

(defn- read-form
  "The one EDN form in the file at `path`. Throws when the file is empty or holds a second form."
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
  "Return `anchors` if it maps simple-symbol names to module symbols, no module anchoring two; throw otherwise."
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

(defn- module-list
  "The sorted `modules` on one line, cut off after eight."
  [modules]
  (let [sorted (sort modules)
        shown  (take 8 sorted)]
    (str (str/join ", " shown)
         (when (< (count shown) (count sorted))
           (format " (and %d more)" (- (count sorted) (count shown)))))))

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

(defn- merge-message
  "The failure for the named clusters that merged into `cluster`, given as `[name anchor]` pairs sorted by name."
  [graph cluster named]
  (let [[[name-a anchor-a] & others] named
        chain #(str/join " -> " (shortest-path graph cluster %1 %2))]
    (str/join
     "\n"
     (concat
      [(format "%s merged into one cycle of %d modules." (str/join " and " (map first named)) (count cluster))
       (str "  This undoes the work that kept them apart, and the merged tangle is hard to cut apart again."
            " Please find another way.")]
      (mapcat (fn [[name-b anchor-b]]
                [(format "  %s reaches %s through %s" name-a name-b (chain anchor-a anchor-b))
                 (format "  %s reaches %s through %s" name-b name-a (chain anchor-b anchor-a))])
              others)
      [(str "  The require that joined them is most likely on one of these chains, probably one your change added."
            " Cut it, for example by moving the code that needs it, or by inverting the dependency with an event or"
            " a multimethod.")
       (str "  If instead only an anchor moved, and the cluster it left is still a cycle, anchor that name on a module"
            " still in it.")
       (str "  Only if there is truly no way around it: remove all but one of the names from "
            clusters-file " and explain why in the PR.")]))))

(defn- requires-within
  "The requires between members of `cluster` as `from -> to` lines, or nil for a cluster of more than ten modules."
  [graph cluster]
  (when (<= (count cluster) 10)
    (for [from (sort cluster)
          to   (sort (filter cluster (get graph from)))]
      (str "    " from " -> " to))))

(defn- unnamed-message [graph cluster proposal]
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
     (if-let [{:keys [name anchor]} proposal]
       (format "  Then add a line like `%s %s` to %s. Any declared member can be the anchor." name anchor
               clusters-file)
       (str "  None of its modules is declared in .clj-kondo/config/modules/config.edn yet. Add an entry with a :team"
            " for each, run `./bin/mage fix-modules-config` to fill in the rest, then anchor the name on one of them."))
     "  If this is a brand new cycle instead, break it rather than naming it."])))

(defn- dissolved-message [cluster-name anchor]
  (str/join
   "\n"
   [(format "%s is anchored on %s, which is no longer in any cycle." cluster-name anchor)
    (str "  If the rest of the cluster is still a cycle, reported above without a name, keep the name and anchor it"
         " on one of its modules instead.")
    (format "  Otherwise the cycle is gone. Nice work. Remove its line from %s to retire the name." clusters-file)]))

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

(defn- proposals
  "Map each of the `unnamed` clusters to its [[propose]] result, no two placeholders sharing a name."
  [graph modules anchors unnamed]
  (first (reduce (fn [[acc taken] cluster]
                   (let [p (propose graph modules cluster taken)]
                     [(assoc acc cluster p) (cond-> taken p (conj (:name p)))]))
                 [{} (set (keys anchors))]
                 unnamed)))

(defn problems
  "Failure messages for every way the cyclic clusters of `graph` disagree with the cluster names in `anchors`.
  Empty when each cluster holds exactly one anchor, and each anchor is among `modules` and in a cluster."
  [graph modules anchors]
  (let [components   (deps-graph/cyclic-components graph)
        clusters     (map (juxt identity (names-in modules anchors)) components)
        in-any       (into #{} cat components)
        undeclared   (into #{} (remove modules) (vals anchors))
        ;; A cluster holding an undeclared anchor already has a name waiting on it, so it gets only that message.
        unnamed      (keep (fn [[cluster named]]
                             (when (and (empty? named) (not-any? undeclared cluster))
                               cluster))
                           clusters)
        placeholders (proposals graph modules anchors unnamed)]
    (concat
     (for [[cluster named] clusters
           :when (< 1 (count named))]
       (merge-message graph cluster named))
     (for [cluster unnamed]
       (unnamed-message graph cluster (placeholders cluster)))
     (keep (fn [[cluster-name anchor]]
             (cond
               (not (modules anchor))
               (format (str "%s is anchored on %s, which is not a declared module. Declare it in"
                            " .clj-kondo/config/modules/config.edn, or anchor the name on a declared module in %s.")
                       cluster-name anchor clusters-file)

               (not (in-any anchor))
               (dissolved-message cluster-name anchor)))
           (sort-by key anchors)))))

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
     :anchors (read-anchors)}))

(defn report
  "The [[problems]] between the current tree's module require graph and [[clusters-file]]."
  []
  (let [{:keys [graph modules anchors]} (repository)]
    (vec (problems graph modules anchors))))

(defn print-clusters
  "Print every cyclic cluster of the module require graph with its name, anchor, teams and members, unnamed first.
  Run it with `clojure -X:dev dev.module-cycles/print-clusters`."
  [_]
  (let [{:keys [config graph modules anchors]} (repository)
        named-in     (names-in modules anchors)
        ;; Unnamed clusters first: they are the ones someone is here to name.
        clusters     (sort-by #(boolean (seq (named-in %))) (deps-graph/cyclic-components graph))
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
      (when-let [lines (and (empty? named) (seq (requires-within graph cluster)))]
        (println "  requires:")
        (run! println lines))
      (println))))

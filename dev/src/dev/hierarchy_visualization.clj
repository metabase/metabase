(ns dev.hierarchy-visualization
  "Render Clojure hierarchies as text trees or graph-description languages."
  {:clj-kondo/config '{:linters {:discouraged-var {clojure.core/println {:level :off}}}}}
  (:require
   [clojure.string :as str]))

(defn- ordered-hierarchy?
  [hierarchy]
  (boolean (:metabase.util.ordered-hierarchy/ordered? (meta hierarchy))))

(defn- node-set
  [hierarchy]
  (let [parents  (:parents hierarchy)
        children (:children hierarchy)]
    (into #{}
          (concat (keys parents)
                  (mapcat seq (vals parents))
                  (keys children)
                  (mapcat seq (vals children))))))

(defn- invert-parents
  [parents]
  (reduce-kv (fn [children child parent-set]
               (reduce (fn [children parent]
                         (update children parent (fnil conj []) child))
                       children
                       parent-set))
             {}
             parents))

(defn- ordered-children
  [hierarchy]
  ;; Ordered hierarchies store children newest-first; visualizations follow derivation order.
  (update-vals (:children hierarchy) #(vec (reverse %))))

(defn- ordered-node-order
  [hierarchy children nodes]
  (let [roots (remove #(seq (get-in hierarchy [:parents %]))
                      (keys (:children hierarchy)))]
    (letfn [(visit [{:keys [seen] :as state} node]
              (if (contains? seen node)
                state
                (reduce visit
                        (-> state
                            (update :seen conj node)
                            (update :nodes conj node))
                        (get children node))))]
      ;; Nodes unreachable from a root only occur in malformed hierarchies; sort them so output stays stable.
      (:nodes (reduce visit {:seen #{}, :nodes []} (concat roots (sort-by pr-str nodes)))))))

(defn hierarchy->graph
  "Returns the direct relationships in `hierarchy` as `:nodes`, `:roots`, and `:children`.

  Ordered hierarchies retain their derivation order.
  Regular Clojure hierarchies are ordered by `pr-str` unless `:sort-by` supplies another node sort key.
  Transitive `:ancestors` and `:descendants` relationships are ignored."
  ([hierarchy]
   (hierarchy->graph hierarchy nil))
  ([hierarchy {:keys [sort-by]}]
   (let [ordered?     (ordered-hierarchy? hierarchy)
         node-set     (node-set hierarchy)
         sort-key     (or sort-by (when-not ordered? pr-str))
         order-nodes  (fn [nodes]
                        (cond->> nodes
                          sort-key (clojure.core/sort-by sort-key)
                          true vec))
         raw-children (if ordered?
                        (ordered-children hierarchy)
                        (invert-parents (:parents hierarchy)))
         nodes        (order-nodes (if ordered?
                                     (ordered-node-order hierarchy raw-children node-set)
                                     node-set))
         children     (into {}
                            (map (fn [node]
                                   [node (order-nodes (get raw-children node))]))
                            nodes)
         roots        (->> nodes
                           (remove #(seq (get-in hierarchy [:parents %])))
                           order-nodes)]
     {:nodes nodes, :roots roots, :children children})))

(defn- toposort-nodes
  "Returns the nodes reachable from `roots` in leaves-to-roots order, as a depth-first post-order walk.

  `children` and `roots` already carry the hierarchy's tie-break order, so this only fixes the direction.
  `nodes` is a fallback traversal order: a malformed hierarchy can strand nodes in a cycle or leave them
  unreachable from any root, and they still have to appear somewhere."
  [roots children nodes]
  (letfn [(visit [{:keys [path seen] :as state} node]
            (if (or (contains? seen node) (contains? path node))
              state
              (as-> state $
                (update $ :path conj node)
                (reduce visit $ (get children node))
                (update $ :path disj node)
                (update $ :seen conj node)
                (update $ :sorted conj node))))]
    (:sorted (reduce visit {:path #{}, :seen #{}, :sorted []} (concat roots nodes)))))

(defn nodes
  "Returns every node in `hierarchy` as a flat vector.

  `:order` is `:topological` (the default) or `:alphabetical`.
  Topological order runs leaves-to-roots, so a node always precedes its parents, matching
  [[metabase.util.ordered-hierarchy/sorted-tags]].
  Ordered hierarchies break ties by derivation order, and others break them by `:sort-by`.

  Options are `:order` and `:sort-by`."
  ([hierarchy]
   (nodes hierarchy nil))
  ([hierarchy {:keys [order sort-by] :or {order :topological}}]
   (case order
     :alphabetical (vec (clojure.core/sort-by (or sort-by pr-str) (node-set hierarchy)))
     :topological  (let [{graph-nodes :nodes, :keys [children roots]} (hierarchy->graph hierarchy {:sort-by sort-by})]
                     (toposort-nodes roots children graph-nodes))
     (throw (ex-info (format "Unsupported node order: %s" order)
                     {:order order, :allowed #{:alphabetical :topological}})))))

(defn print-nodes
  "Prints each node of `hierarchy` on its own line and returns nil.

  Takes [[nodes]]'s options, plus `:label-fn`."
  ([hierarchy]
   (print-nodes hierarchy nil))
  ([hierarchy {:keys [label-fn] :or {label-fn pr-str} :as options}]
   ;; This function exists specifically for interactive REPL output; logging would add unwanted formatting and context.
   (println (if-let [labels (seq (map (comp str label-fn) (nodes hierarchy options)))]
              (str/join "\n" labels)
              "(empty hierarchy)"))))

(def ^:private unicode-tree-style
  {:branch      "├── "
   :last-branch "└── "
   :vertical    "│   "
   :space       "    "
   :ellipsis    "…"
   :shared      " ↩"
   :cycle       " ↻"})

(def ^:private ascii-tree-style
  {:branch      "|-- "
   :last-branch "`-- "
   :vertical    "|   "
   :space       "    "
   :ellipsis    "..."
   :shared      " (shown above)"
   :cycle       " (cycle)"})

(defn tree-str
  "Returns a root-to-leaf tree representation of `hierarchy`.

  Because a hierarchy can be a DAG, a node is expanded only at its first occurrence by default.
  Later occurrences are marked with `↩`.
  Set `:repeat-shared?` to expand shared subtrees each time.
  `:max-depth` counts the roots as depth 0.
  `:max-nodes` limits the number of rendered node occurrences.

  Options are `:label-fn`, `:sort-by`, `:ascii?`, `:repeat-shared?`, `:max-depth`, and `:max-nodes`."
  ([hierarchy]
   (tree-str hierarchy nil))
  ([hierarchy {:keys [ascii? label-fn max-depth max-nodes repeat-shared? sort-by]
               :or   {label-fn pr-str, max-nodes 100}}]
   (let [{:keys [children nodes roots]} (hierarchy->graph hierarchy {:sort-by sort-by})
         style                         (if ascii? ascii-tree-style unicode-tree-style)
         seen                          (volatile! #{})
         rendered-count                (volatile! 0)
         stopped?                      (volatile! false)
         label                         #(str (label-fn %))]
     (cond
       (empty? nodes)
       "(empty hierarchy)"

       (empty? roots)
       "(hierarchy has no roots)"

       :else
       (letfn [(connector [{:keys [branch last-branch]} last? root?]
                 (if root?
                   ""
                   (if last? last-branch branch)))
               (truncation-line [prefix last? root?]
                 (str prefix (connector style last? root?) (:ellipsis style)))
               (visit [node prefix last? root? depth path]
                 (cond
                   @stopped?
                   []

                   (and max-nodes (>= @rendered-count max-nodes))
                   (do (vreset! stopped? true)
                       [(truncation-line prefix last? root?)])

                   :else
                   ;; `derive` prevents cycles, but hierarchy values are ordinary maps that can be manually
                   ;; constructed or malformed. Detect cycles defensively so visualization cannot recurse forever.
                   (let [cycle?       (contains? path node)
                         shared?      (and (not repeat-shared?) (contains? @seen node))
                         line          (str prefix
                                            (connector style last? root?)
                                            (label node)
                                            (cond cycle?  (:cycle style)
                                                  shared? (:shared style)
                                                  :else   ""))
                         child-nodes   (get children node)
                         child-prefix  (str prefix
                                            (if root?
                                              ""
                                              (if last? (:space style) (:vertical style))))]
                     (vswap! rendered-count inc)
                     (if (or cycle? shared?)
                       [line]
                       (do
                         (vswap! seen conj node)
                         (cond
                           (and max-depth (>= depth max-depth) (seq child-nodes))
                           [line (truncation-line child-prefix true false)]

                           :else
                           (into [line]
                                 (mapcat (fn [[index child]]
                                           (visit child
                                                  child-prefix
                                                  (= index (dec (count child-nodes)))
                                                  false
                                                  (inc depth)
                                                  (conj path node))))
                                 (map-indexed vector child-nodes))))))))]
         (->> roots
              (map-indexed (fn [index root]
                             (visit root "" (= index (dec (count roots))) true 0 #{})))
              (keep seq)
              (interpose [""])
              (apply concat)
              (str/join "\n")))))))

(defn print-tree
  "Prints [[tree-str]] for `hierarchy` and returns nil."
  ([hierarchy]
   (print-tree hierarchy nil))
  ([hierarchy options]
   ;; This function exists specifically for interactive REPL output; logging would add unwanted formatting and context.
   (println (tree-str hierarchy options))))

(defn- node-ids
  [nodes]
  (zipmap nodes (map #(str "n" %) (range))))

(defn- normalize-newlines
  [s]
  (str/replace (str s) #"\r\n?" "\n"))

(defn- dot-escape
  [s]
  (str/escape (normalize-newlines s) {\\ "\\\\", \" "\\\"", \newline "\\n"}))

(defn- validate-direction
  [requested allowed default]
  (let [direction (or requested default)]
    (when-not (contains? allowed direction)
      (throw (ex-info (format "Unsupported graph direction: %s" direction)
                      {:direction direction :allowed allowed})))
    direction))

(defn- graph-lines
  [hierarchy sort-by label-fn node-line edge-line]
  (let [{:keys [children nodes]} (hierarchy->graph hierarchy {:sort-by sort-by})
        ids                      (node-ids nodes)]
    (concat
     (map (fn [node]
            (node-line (ids node) (label-fn node)))
          nodes)
     (mapcat (fn [parent]
               (map (fn [child]
                      (edge-line (ids parent) (ids child)))
                    (get children parent)))
             nodes))))

(defn dot-str
  "Returns a Graphviz DOT description of `hierarchy`.

  Options are `:label-fn`, `:sort-by`, and `:direction` (`\"TB\"`, `\"BT\"`, `\"LR\"`, or `\"RL\"`)."
  ([hierarchy]
   (dot-str hierarchy nil))
  ([hierarchy {:keys [direction label-fn sort-by]
               :or   {label-fn pr-str}}]
   (let [direction (validate-direction direction #{"TB" "BT" "LR" "RL"} "TB")
         lines     (graph-lines hierarchy
                                sort-by
                                label-fn
                                #(format "  %s [label=\"%s\"];" %1 (dot-escape %2))
                                #(format "  %s -> %s;" %1 %2))]
     (str/join "\n"
               (concat ["digraph hierarchy {" (str "  rankdir=" direction ";")]
                       lines
                       ["}"])))))

(defn- mermaid-escape
  [s]
  (-> (normalize-newlines s)
      (str/replace "&" "&amp;")
      (str/replace "\"" "&quot;")
      (str/replace "<" "&lt;")
      (str/replace ">" "&gt;")
      (str/replace "\n" "<br/>")))

(defn mermaid-str
  "Returns a Mermaid flowchart description of `hierarchy`.

  Options are `:label-fn`, `:sort-by`, and `:direction` (`\"TD\"`, `\"TB\"`, `\"BT\"`, `\"LR\"`, or `\"RL\"`)."
  ([hierarchy]
   (mermaid-str hierarchy nil))
  ([hierarchy {:keys [direction label-fn sort-by]
               :or   {label-fn pr-str}}]
   (let [direction (validate-direction direction #{"TD" "TB" "BT" "LR" "RL"} "TD")
         lines     (graph-lines hierarchy
                                sort-by
                                label-fn
                                #(format "  %s[\"%s\"]" %1 (mermaid-escape %2))
                                #(format "  %s --> %s" %1 %2))]
     (str/join "\n"
               (concat [(str "flowchart " direction)]
                       lines)))))

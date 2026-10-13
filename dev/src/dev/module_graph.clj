(ns dev.module-graph
  "Cycle analysis for a dependency graph given as `node -> #{successor}`.

  Plain Clojure only: `dev.deps-graph` uses it in a dev REPL, and `dev.module-explorer` under Babashka.")

(defn- graph-nodes [graph]
  (into (set (keys graph)) (mapcat val) graph))

(defn strongly-connected-components
  "Return the strongly connected components of `graph` as a vector of sets.
  A node outside every cycle comes back as a singleton set."
  [graph]
  ;; Tarjan's algorithm, kept recursive because that reads better than an explicit stack of frames.
  ;; Each node on the search path costs a level of recursion, so the worst case is one level per node.
  ;; As of 2026-09-11 the 206-module graph peaks at 40 levels; the default 2 MB thread stack fits about 2,600.
  (letfn [(pop-component [state root]
            (loop [state state, component #{}]
              (let [node      (peek (:stack state))
                    state     (-> state
                                  (update :stack pop)
                                  (update :on-stack disj node))
                    component (conj component node)]
                (if (= node root)
                  (update state :components conj component)
                  (recur state component)))))
          (visit [state node]
            (let [node-index (:next-index state)
                  state      (-> state
                                 (assoc-in [:index node] node-index)
                                 (assoc-in [:lowlink node] node-index)
                                 (update :next-index inc)
                                 (update :stack conj node)
                                 (update :on-stack conj node))
                  state      (reduce (fn [state successor]
                                       (cond
                                         (not (contains? (:index state) successor))
                                         (let [state (visit state successor)]
                                           (update-in state [:lowlink node]
                                                      min
                                                      (get-in state [:lowlink successor])))

                                         (contains? (:on-stack state) successor)
                                         (update-in state [:lowlink node]
                                                    min
                                                    (get-in state [:index successor]))

                                         :else
                                         state))
                                     state
                                     (get graph node))]
              (cond-> state
                (= (get-in state [:lowlink node]) (get-in state [:index node]))
                (pop-component node))))]
    (:components
     (reduce (fn [state node]
               (cond-> state
                 (not (contains? (:index state) node)) (visit node)))
             {:components []
              :index      {}
              :lowlink    {}
              :next-index 0
              :on-stack   #{}
              :stack      []}
             (sort (graph-nodes graph))))))

(defn cyclic-components
  "Non-singleton [[strongly-connected-components]], largest first; ties sort by first member."
  [graph]
  (->> (strongly-connected-components graph)
       (filter #(> (count %) 1))
       (sort-by (fn [component] [(- (count component)) (first (sort component))]))
       vec))

(defn- component-edges
  "The `[from to]` edges of `graph` with both ends in `component`, sorted."
  [graph component]
  (vec (sort (for [from  component
                   to    (get graph from)
                   :when (and (not= from to) (contains? component to))]
               [from to]))))

(defn- strong-bridges
  "The `edges` of a strongly connected component whose removal leaves it no longer strongly connected."
  [edges]
  ;; Removing `a -> b` breaks the component exactly when `b` is no longer reachable from `a`:
  ;; every other path that used the edge can detour through the remaining route from `a` to `b`.
  (let [successors (reduce (fn [acc [from to]] (update acc from (fnil conj []) to)) {} edges)
        reachable? (fn [[from to :as skipped]]
                     (loop [stack [from], seen #{from}]
                       (if-let [node (peek stack)]
                         (if (= node to)
                           true
                           (let [next-nodes (remove #(or (seen %) (= [node %] skipped)) (successors node))]
                             (recur (into (pop stack) next-nodes) (into seen next-nodes))))
                         false)))]
    (filterv (complement reachable?) edges)))

(defn cycle-metrics
  "How tangled a strongly connected `component` of `graph` is.

  - `:size`           nodes in the component
  - `:edges`          edges inside it
  - `:density`        edges over the n(n-1) possible, so 1.0 means every pair depends on each other
  - `:cycle-rank`     edges - nodes + 1: independent cycles, and at most the edges to cut to break them all
  - `:strong-bridges` sorted edges whose removal leaves the component no longer strongly connected"
  [graph component]
  (let [n     (count component)
        edges (component-edges graph component)
        m     (count edges)]
    {:size           n
     :edges          m
     :density        (if (> n 1) (double (/ m (* n (dec n)))) 0.0)
     :cycle-rank     (if (> n 1) (inc (- m n)) 0)
     :strong-bridges (strong-bridges edges)}))

(defn cycles
  "Each cycle in `graph`, largest first: its sorted `:modules` plus its [[cycle-metrics]]."
  [graph]
  (mapv (fn [component]
          (assoc (cycle-metrics graph component) :modules (vec (sort component))))
        (cyclic-components graph)))

(ns metabase-enterprise.workspaces.dag
  (:require
   [clojure.set :as set]
   [flatland.ordered.map :as ordered-map]
   [metabase.util :as u]))

;; TODO handle shadowing / execution of transforms that depend on checkout out models

(defn- related [t id]
  (keyword (str (name t) (subs (name id) 1))))

(def ^:private x->t (partial related :t))

(defn- is? [t id] (= (name t) (str (first (name id)))))

(defn- lexico [id]
  (let [n (name id)]
    [(parse-long (subs n 1))
     ({\x 1 \t 2 \m 3} (first n))]))

(defn- expand-shorthand
  "As shorthand we can use transforms in the place of their induced tables.
   This function expands the graph to insert the induced tables, and replace the corresponding references."
  [{:keys [dependencies] :as graph}]
  (assoc graph :dependencies
         (let [xs (set (filter #(is? :x %) (concat (keys dependencies) (mapcat val dependencies))))]
           (into (sorted-map-by #(compare (lexico %1) (lexico %2)))
                 (merge (zipmap (map x->t xs) (map vector xs))
                        (into {} (filter (comp #(is? :t %) key)) dependencies)
                        (update-vals
                         (into {} (remove (comp #(is? :t %) key)) dependencies)
                         (fn [deps] (->> deps
                                         (map (fn [id]
                                                (if (is? :x id)
                                                  (x->t id)
                                                  id)))
                                         (sort-by lexico)
                                         (vec)))))))))

(def ^:private example-shorthand
  {:check-outs   #{:x3 :m6 :m10 :m13}
   :dependencies {:x3  [:x1 :t2]
                  :x4  [:x3]
                  :m6  [:x4 :t5]
                  :m10 [:t9]
                  :x11 [:m10]
                  :m12 [:x11]
                  :m13 [:x11 :m12]}})

(def ^:private example
  {:check-outs   #{:x3 :m6 :m10 :m13}
   :dependencies {:t1  [:x1]
                  :x3  [:t1 :t2]
                  :t3  [:x3]
                  :x4  [:t3]
                  :t4  [:x4]
                  :m6  [:t4 :t5]
                  :m10 [:t9]
                  :x11 [:m10]
                  :t11 [:x11]
                  :m12 [:t11]
                  :m13 [:t11 :m12]}})

(comment (= example (expand-shorthand example-shorthand)))

(defn- children [dependencies]
  (reduce
   (fn [acc [child parents]]
     (reduce (fn [acc p] (update acc p u/conjv child)) acc parents))
   (sorted-map-by #(compare (lexico %1) (lexico %2)))
   dependencies))

(comment
  (children (:dependencies example)))

(defn- ->ts [ids]
  (into #{}
        (keep (fn [id]
                (cond (is? :t id) id
                      (is? :x id) (x->t id))))
        ids))

;; naive dfs toposort

(defn- toposort-visit [node child->parents visited result]
  (cond
    (visited node) [visited result]
    :else (let [parents (child->parents node [])
                [visited' result'] (reduce (fn [[v r] p]
                                             (toposort-visit p child->parents v r))
                                           [(conj visited node) result]
                                           parents)]
            [visited' (conj result' node)])))

(defn- toposort-dfs [child->parents]
  ;; we assume the graph contains the degenerate nodes as keys with empty parent lists
  (let [all-nodes (set (keys child->parents))]
    (loop [visited   #{}
           result    []
           remaining all-nodes]
      (if (empty? remaining)
        result
        (let [node (first remaining)
              [visited' result'] (toposort-visit node child->parents visited result)]
          (recur visited' result' (disj remaining node)))))))

(defn- toposort-map [child->parents]
  (let [child->parents (if (map? child->parents) child->parents (into {} child->parents))]
    (into (ordered-map/ordered-map)
          (keep (fn [n] (when-let [deps (get child->parents n)] [n deps])))
          (toposort-dfs child->parents))))

;; naive version - calculate above and below, and take intersection

;; safety
(def ^:private max-iterations 100)

(defn- path-induced-subgraph [{:keys [check-outs dependencies] :as _graph}]
  (let [->parents  dependencies
        ->children (children dependencies)]
    (loop [iteration  1
           below      check-outs
           above      check-outs
           seen-down? check-outs
           seen-up?   check-outs
           to-descend check-outs
           to-ascend  check-outs]
      (if (and (empty? to-descend) (empty? to-ascend))
        ;; Inputs are all the external tables that we depend on.
        ;; NOTE: if there is a chain of models, we assume that ->parent here maps all the way to the source table
        (let [nodes    (set/intersection above below)
              entities (remove #(is? :t %) nodes)
              tables   (sort-by lexico (filter #(is? :t %) nodes))]
          {:check-outs   (sort-by lexico check-outs)
           :inputs       (sort-by lexico (remove nodes (->ts (mapcat ->parents check-outs))))
           :tables       tables
           :transforms   (sort-by lexico (filter #(is? :x %) nodes))
           :entities     (sort-by lexico entities)
           :dependencies (apply dissoc
                                (toposort-map
                                 (for [n nodes]
                                   [n (vec (filter nodes (get dependencies n)))]))
                                tables)})
        (if (> iteration max-iterations)
          {:error "max iterations exceeded"}
          (let [next-down (into #{} (comp (mapcat ->children) (remove seen-down?)) to-descend)
                next-up   (into #{} (comp (mapcat ->parents) (remove seen-up?)) to-ascend)]
            (recur (inc iteration)
                   (into below next-down)
                   (into above next-up)
                   (into seen-down? next-down)
                   (into seen-up? next-up)
                   next-down
                   next-up)))))))

(comment
  (path-induced-subgraph example))

;; (path-induced-subgraph example) =>
{:check-outs   '(:x3 :m6 :m10 :m12),
 ;; these are all the external tables that we will need ro access to
 :inputs       '(:t1 :t2 :t5 :t9),
 ;; these are all the tables we need to "shadow" in the workspace schema (previously called outputs)
 :tables       '(:t3 :t4 :t11),
 ;; these are all the transforms we need to execute when running the workspace (replaces "downstream")
 :transforms   '(:x3 :x4 :x11)
 ;; these are the appdb entities that need to be shadowed with "_workspace" versions.
 ;; this excludes the tables, which I'm assuming will be handled separately via sync.
 ;; we might change our mind here and just manually create the metadata along with
 ;; the other entities, if that's easier.
 :entities     '(:x3 :x4 :m6 :m10 :x11 :t11 :m12)
 ;; a mapping from entities that we copy to their dependencies within the subgraph
 ;; they may have other dependencies outside the subgraph, but we ignore these
 ;; as they don't need to be remapped
 :dependencies {:x3  []
                :x4  [:t3]
                :m6  [:t4]
                :m10 []
                :x11 [:m10]
                :m12 [:t11]}}

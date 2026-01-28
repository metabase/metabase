(ns metabase-enterprise.workspaces.dag-abstract
  "Abstract graph solver using shorthand notation for testing.

   Shorthand uses keywords like :x1, :t2, :m3 where:
   - :x<n> is a transform
   - :t<n> is a table (source/generated)
   - :m<n> is a model (card)"
  (:require
   [clojure.set :as set]
   [flatland.ordered.map :as ordered-map]
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.util :as u]))

;;;; Shorthand notation helpers

(defn- related [t id]
  (keyword (str (name t) (subs (name id) 1))))

(def ^:private x->t (partial related :t))

(defn is?
  "Check if id is of type t (e.g., (is? :x :x1) => true)."
  [t id]
  (= (name t) (str (first (name id)))))

(defn- lexico [id]
  (let [n (name id)
        prefix (when (keyword? id) (first n))]
    (if-let [type-order ({\x 1 \t 2 \m 3} prefix)]
      ;; Standard shorthand keyword like :x1, :t2 - sort by number then type
      [(parse-long (subs n 1)) type-order]
      ;; Real table string reference - sort after all standard keywords
      [Long/MAX_VALUE n])))

(defn expand-shorthand
  "As shorthand, we can use transforms in the place of their induced tables.
   This function expands the graph to insert the induced tables, and replace the corresponding references."
  [dependencies]
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
                                  (vec))))))))

;;;; Graph traversal helpers

(defn- children [dependencies]
  (reduce
   (fn [acc [child parents]]
     (reduce (fn [acc p] (update acc p u/conjv child)) acc parents))
   (sorted-map-by #(compare (lexico %1) (lexico %2)))
   dependencies))

(defn- ->ts [ids]
  (into #{}
        (keep (fn [id]
                (cond (is? :t id) id
                      (is? :x id) (x->t id))))
        ids))

;;;; Toposort

(defn- toposort-map [child->parents]
  (let [child->parents (if (map? child->parents) child->parents (into {} child->parents))]
    (into (ordered-map/ordered-map)
          (keep (fn [n] (when-let [deps (get child->parents n)] [n deps])))
          (ws.u/toposort-dfs child->parents))))

;;;; Abstract path-induced subgraph solver

(def ^:private max-iterations 100)

(defn path-induced-subgraph
  "Abstract solver for path-induced subgraph using shorthand notation."
  [{:keys [check-outs dependencies] :as _graph}]
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

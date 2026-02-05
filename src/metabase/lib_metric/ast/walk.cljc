(ns metabase.lib-metric.ast.walk
  "Functions for walking and transforming AST nodes.")

(defn node?
  "Returns true if x is an AST node (map with :node/type key)."
  [x]
  (and (map? x) (contains? x :node/type)))

(defn filter-node?
  "Returns true if x is a filter AST node."
  [x]
  (and (node? x)
       (when-let [ns (namespace (:node/type x))]
         (= ns "filter"))))

(defn source-node?
  "Returns true if x is a source AST node (metric or measure)."
  [x]
  (and (node? x)
       (when-let [ns (namespace (:node/type x))]
         (= ns "source"))))

(defn dimension-ref-node?
  "Returns true if x is a dimension reference node."
  [x]
  (and (node? x) (= :ast/dimension-ref (:node/type x))))

(defn walk
  "Walk AST, calling inner on child nodes and outer on the result.
   Similar to clojure.walk/walk but AST-aware."
  [inner outer ast]
  (outer
   (cond
     (not (node? ast)) ast

     ;; Compound filter nodes with :children
     (#{:filter/and :filter/or} (:node/type ast))
     (update ast :children #(mapv inner %))

     ;; Negation filter with single :child
     (= :filter/not (:node/type ast))
     (update ast :child inner)

     ;; Leaf filter nodes - walk into :dimension
     (filter-node? ast)
     (cond-> ast
       (:dimension ast) (update :dimension inner))

     ;; Root node - walk source, filter, group-by, dimensions, and mappings
     (= :ast/root (:node/type ast))
     (cond-> ast
       (:filter ast)     (update :filter inner)
       (:source ast)     (update :source inner)
       (:group-by ast)   (update :group-by #(mapv inner %))
       (:dimensions ast) (update :dimensions #(mapv inner %))
       (:mappings ast)   (update :mappings #(mapv inner %)))

     ;; Source nodes with filters
     (#{:source/metric :source/measure} (:node/type ast))
     (cond-> ast
       (:filters ast) (update :filters inner))

     ;; All other nodes have no child nodes to walk
     :else ast)))

(defn postwalk
  "Walk AST depth-first, applying f to each node after recursing into children."
  [f ast]
  (walk (partial postwalk f) f ast))

(defn prewalk
  "Walk AST applying f to each node before recursing into children."
  [f ast]
  (walk (partial prewalk f) identity (f ast)))

(defn collect
  "Collect all nodes matching predicate, walking the entire AST."
  [pred ast]
  (let [results (atom [])]
    (postwalk (fn [node]
                (when (pred node)
                  (swap! results conj node))
                node)
              ast)
    @results))

(defn collect-dimension-refs
  "Collect all dimension reference nodes in AST."
  [ast]
  (collect dimension-ref-node? ast))

(defn collect-by-type
  "Collect all nodes of a specific :node/type."
  [node-type ast]
  (collect #(= node-type (:node/type %)) ast))

(defn transform
  "Transform all nodes matching predicate using transform-fn.
   Uses postwalk to ensure children are transformed before parents."
  [pred transform-fn ast]
  (postwalk (fn [node]
              (if (pred node)
                (transform-fn node)
                node))
            ast))

(defn transform-by-type
  "Transform all nodes of a specific :node/type using transform-fn."
  [node-type transform-fn ast]
  (transform #(= node-type (:node/type %)) transform-fn ast))

(defn find-first
  "Find the first node matching predicate, or nil if not found."
  [pred ast]
  (first (collect pred ast)))

(defn count-nodes
  "Count all nodes matching predicate."
  [pred ast]
  (count (collect pred ast)))

(defn replace-node
  "Replace nodes matching predicate with replacement value."
  [pred replacement ast]
  (transform pred (constantly replacement) ast))

(defn remove-filters
  "Remove all filter nodes matching predicate from compound filters.
   For :filter/and and :filter/or, filters out matching children.
   For :filter/not, replaces with nil if child matches."
  [pred ast]
  (postwalk
   (fn [node]
     (cond
       (not (node? node))
       node

       (#{:filter/and :filter/or} (:node/type node))
       (let [filtered-children (filterv #(not (pred %)) (:children node))]
         (case (count filtered-children)
           0 nil
           1 (first filtered-children)
           (assoc node :children filtered-children)))

       (= :filter/not (:node/type node))
       (if (pred (:child node))
         nil
         node)

       :else node))
   ast))

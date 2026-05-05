(ns metabase.lib-metric.ast.walk
  "Functions for walking and transforming AST nodes."
  (:require
   [metabase.lib-metric.ast.type :as ast.type]
   [metabase.util.performance :as perf]))

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

(defmulti walk-node
  "Walk a single AST node, calling inner on child nodes.
   Returns the walked node (before outer is applied)."
  {:arglists '([inner node])}
  (fn [_inner node] (:node/type node))
  :hierarchy #'ast.type/ast-hierarchy)

(defmethod walk-node :filter/compound
  [inner ast]
  (update ast :children #(perf/mapv inner %)))

(defmethod walk-node :filter/not
  [inner ast]
  (update ast :child inner))

(defmethod walk-node :filter/comparison [inner ast] (cond-> ast (:dimension ast) (update :dimension inner)))
(defmethod walk-node :filter/between    [inner ast] (cond-> ast (:dimension ast) (update :dimension inner)))
(defmethod walk-node :filter/string     [inner ast] (cond-> ast (:dimension ast) (update :dimension inner)))
(defmethod walk-node :filter/null       [inner ast] (cond-> ast (:dimension ast) (update :dimension inner)))
(defmethod walk-node :filter/in         [inner ast] (cond-> ast (:dimension ast) (update :dimension inner)))
(defmethod walk-node :filter/temporal   [inner ast] (cond-> ast (:dimension ast) (update :dimension inner)))

(defmethod walk-node :ast/dimension-expression
  [inner ast]
  (update ast :dimension inner))

(defmethod walk-node :filter/inside
  [inner ast]
  (cond-> ast
    (:lat-dimension ast) (update :lat-dimension inner)
    (:lon-dimension ast) (update :lon-dimension inner)))

;; Expression leaf — walk into the nested AST
(defmethod walk-node :expression/leaf
  [inner ast]
  (update ast :ast inner))

;; Expression constant — no children to walk
(defmethod walk-node :expression/constant
  [_inner ast]
  ast)

;; Expression arithmetic — walk into children
(defmethod walk-node :expression/arithmetic
  [inner ast]
  (update ast :children #(perf/mapv inner %)))

(defmethod walk-node :ast/source-query
  [inner ast]
  (cond-> ast
    (:filter ast)     (update :filter inner)
    (:source ast)     (update :source inner)
    (:group-by ast)   (update :group-by #(perf/mapv inner %))
    (:dimensions ast) (update :dimensions #(perf/mapv inner %))
    (:mappings ast)   (update :mappings #(perf/mapv inner %))))

(defmethod walk-node :ast/root
  [inner ast]
  (update ast :expression inner))

(defmethod walk-node :source/any
  [inner ast]
  (cond-> ast
    (:filters ast) (update :filters inner)))

(defmethod walk-node :default
  [_inner ast]
  ast)

(defn walk
  "Walk AST, calling inner on child nodes and outer on the result.
   Similar to clojure.walk/walk but AST-aware."
  [inner outer ast]
  (outer
   (if (node? ast)
     (walk-node inner ast)
     ast)))

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

(defmulti ^:private remove-filters-node
  "Remove matching filter children from a node. Returns the transformed node."
  {:arglists '([pred node])}
  (fn [_pred node] (:node/type node))
  :hierarchy #'ast.type/ast-hierarchy)

(defmethod remove-filters-node :filter/compound
  [pred node]
  (let [filtered-children (filterv #(and (some? %) (not (pred %))) (:children node))]
    (case (count filtered-children)
      0 nil
      1 (first filtered-children)
      (assoc node :children filtered-children))))

(defmethod remove-filters-node :filter/not
  [pred node]
  (if (pred (:child node))
    nil
    node))

(defmethod remove-filters-node :default
  [_pred node]
  node)

(defn remove-filters
  "Remove all filter nodes matching predicate from compound filters.
   For :filter/and and :filter/or, filters out matching children.
   For :filter/not, replaces with nil if child matches."
  [pred ast]
  (postwalk
   (fn [node]
     (if (node? node)
       (remove-filters-node pred node)
       node))
   ast))

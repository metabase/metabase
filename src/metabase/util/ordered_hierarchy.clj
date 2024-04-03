;;; A specialization of Clojure hierarchies that preserves the ordering of insertions.
(ns metabase.util.ordered-hierarchy
  (:refer-clojure :exclude [ancestors derive descendants make-hierarchy parents])
  (:require
   [flatland.ordered.set :refer [ordered-set]]
   [medley.core :as m]))

(declare derive)

(defn- derive-children
  [h [parent & children]]
  (reduce (fn [h child]
            (cond
              (keyword? child) (derive h child parent)
              (vector? child) (let [grandchild (first child)]
                                (assert (not (and (contains? (:parents h) grandchild) (rest child)))
                                        (format "You may only list a %s's children at its first occurrence"
                                                grandchild))
                                (derive-children (derive h grandchild parent)
                                                 child))))
          h
          children))

(defn- derive-basis [h basis]
  (cond (vector? basis) (derive-children h basis)
        :else (throw (ex-info (str "Unsupported type for ordered-hierarchy: " (type basis))
                              {:h h :basis basis}))))

(defn make-hierarchy
  "Similar to [[clojure.core/make-hierarchy]], but the returned hierarchy has well-defined orderings for its sets.

  Can take arguments to be treated as roots, defined using hiccup syntax.

  !! WARNING !!
  Using [[clojure.core/derive]] with this will corrupt the ordering - you must use the implementation from this ns."
  ([]
   (-> (clojure.core/make-hierarchy)
       (with-meta {::ordered? true})))
  ([& bases]
   (reduce derive-basis (make-hierarchy) bases)))

(defn ancestors
  "Returns the immediate and indirect parents of tag, as established via derive. Earlier derivations are shown first.
   This method is just a proxy, it exists only to prevent accidentally using the global hierarchy."
  [h tag]
  (clojure.core/ancestors h tag))

(defn descendants
  "Returns the immediate and indirect children of tag, as established via derive. Earlier derivations are shown later.
   This method is just a proxy, it exists only to prevent accidentally using the global hierarchy."
  [h tag]
  (clojure.core/descendants h tag))

(defn parents
  "Returns the immediate parents of tag, as established via derive. Earlier derivations are shown first.
   This method is just a proxy, it exists only to prevent accidentally using the global hierarchy."
  [h tag]
  (clojure.core/parents h tag))

(defn children
  "Returns the immediate children of tag, as established via derive. Later derivations are shown first."
  [h tag]
  (-> h :children tag))

(defn- toposort-visit [g state n]
  (let [{:keys [processing processed]} state]
    (when (contains? processing n)
      (throw (ex-info "Cycle in graph" {:cause      ::cyclic-graph
                                        :cycle-node n
                                        :state      state
                                        :graph      g})))
    (if (contains? processed n)
      state
      (let [children   (get g n)
            init-state (update state :processing conj n)
            post-state (reduce (partial toposort-visit g)
                               init-state
                               ;; Iterate in reverse as that gives us oldest to newest
                               (reverse children))]
        (-> post-state
            (update :processed conj n)
            (update :processing disj n))))))

(defn- toposort
  "Use Trajan's DPS method to return an ordered set of nodes where every node is preceded by all its children, and
  those children are likewise enumerated in the order they were registered as children of that node."
  [roots graph]
  (->> roots
       (reduce (partial toposort-visit graph)
               {:processing #{}
                :processed  (ordered-set)})
       :processed))

(defn sorted-tags
  "An ordered set of all tags within the hierarchy, topologically sorted from the leaves up, and following the edges
  according to the order they were added in."
  [h]
  (let [roots (reduce disj
                      (into (ordered-set) (keys (:children h)))
                      (keys (:parents h)))]
    (toposort roots (:children h))))

(defn- calculate-derived-fields [h]
  (let [ts          (sorted-tags h)
        re-sort     (fn [m sorted] (m/map-vals #(into (ordered-set) (filter % sorted)) m))
        ancestors   (re-sort (:ancestors h) ts)
        descendants (re-sort (:descendants h) (reverse ts))]
    (assoc h
      :sorted-tags ts
      :ancestors ancestors
      :descendants descendants)))

(defn derive
  "Establishes a parent/child relationship between two keyword tags, similar to [[clojure.core/derive]].
  Where it differs is that the order in which we derive keys is significant - it determines the order in which we return
  its parents. Ancestors are returned according to a toposort, and descendants are returned in the opposite order."
  [h tag parent]
  (assert (not= tag parent))
  (assert (keyword tag))
  (assert (keyword? parent))
  (assert (::ordered? (meta h)) "This operation requires an ordered hierarchy.")

  (let [tp (:parents h)
        tc (:children h)]
    (if (contains? (tp tag) parent)
      h
      (-> (assoc h :parents (update tp tag #(or % (ordered-set))))
          (clojure.core/derive tag parent)
          (assoc :children (update tc parent #(into (ordered-set tag) %)))
          calculate-derived-fields
          (with-meta {::ordered? true})))))

(defn- first-common-tag
  "Given two ordered sets corresponding to ancestors of two tags in a hierarchy, return the first ancestor of tag-a
  which is also an ancestor of tag-b.
  Returns nil if there is no such intersection."
  [ancestors-a ancestors-b]
  ;; I suspect this is not commutative, so this ordering is important - we care more about being close to tag-a.
  (some ancestors-b ancestors-a))

(defn first-common-ancestor
  "Given two tags, return the first tag in the ancestral lineage of tag-a that's also in the ancestral lineage of tag-b.
  Returns nil if there is no common ancestor.

  NOTE: this is very similar to the notion of a Least Common Ancestor in a graph, but I'm not sure that its result
        will always satisfy that property. We also want to emphasize the way it relates to the total ordering, hence
        using different terminology."
  [h tag-a tag-b]
  (let [ancestors-a (ancestors h tag-a)
        ancestors-b (ancestors h tag-b)]
    (cond
      (nil? tag-a) tag-b
      (nil? tag-b) tag-a
      (= tag-a tag-b) tag-a
      ;; This ordering is important - we want first ancestor of tag-a that is common, even if there are common
      ;; ancestor which are closer to tag-b.
      (contains? ancestors-b tag-a) tag-a
      (contains? ancestors-a tag-b) tag-b
      :else (first-common-tag ancestors-a ancestors-b))))

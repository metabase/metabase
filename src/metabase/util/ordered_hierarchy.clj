;;; A specialization of Clojure hierarchies that preserves the ordering of insertions.
(ns metabase.util.ordered-hierarchy
  (:refer-clojure :exclude [ancestors derive descendants make-hierarchy parents])
  (:require
   [flatland.ordered.map :refer [ordered-map]]
   [flatland.ordered.set :refer [ordered-set]]))

(declare calculate-derived-fields derive)

(defn- known-tag?
  [h tag]
  (or (contains? (:parents h) tag)
      (contains? (:children h) tag)))

(defn- check-first-occurrence!
  [h [tag & children :as basis]]
  (when (and (known-tag? h tag) (seq children))
    (throw (ex-info (format "Children of %s may only be listed at its first occurrence" tag)
                    {:basis basis :tag tag}))))

(defn- register-parent
  [h parent]
  (if (contains? (:children h) parent)
    h
    (assoc h :children (assoc (:children h) parent nil))))

(defn- derive-children
  [h [parent & children :as basis]]
  (when-not (keyword? parent)
    (throw (ex-info "Hierarchy vectors must begin with a keyword tag"
                    {:basis basis})))
  (let [h (register-parent h parent)]
    (if (seq children)
      (reduce (fn [h child]
                (cond
                  (keyword? child)
                  (derive h child parent)

                  (vector? child)
                  (let [grandchild (first child)]
                    (when-not (keyword? grandchild)
                      (throw (ex-info "Hierarchy vectors must begin with a keyword tag"
                                      {:basis child})))
                    (check-first-occurrence! h child)
                    (derive-children (derive h grandchild parent) child))

                  :else
                  (throw (ex-info "Hierarchy children must be keywords or vectors"
                                  {:basis basis :child child}))))
              h
              children)
      (calculate-derived-fields h))))

(defn- derive-basis [h basis]
  (when-not (vector? basis)
    (throw (ex-info (str "Hierarchy basis must be a vector, got " (type basis))
                    {:basis basis})))
  (check-first-occurrence! h basis)
  (derive-children h basis))

(defn make-hierarchy
  "Creates a hierarchy whose sets have deterministic iteration order.

  Each optional basis uses Hiccup-style syntax: `[parent child [child grandchild ...] ...]`.

  Always use [[derive]] to extend the result.
  [[clojure.core/derive]] does not maintain this namespace's custom fields or metadata."
  ([]
   (-> (clojure.core/make-hierarchy)
       (assoc :children (ordered-map)
              :sorted-tags (ordered-set))
       (vary-meta assoc ::ordered? true)))
  ([& bases]
   (reduce derive-basis (make-hierarchy) bases)))

(defn ancestors
  "Returns the immediate and indirect parents of `tag` in leaves-to-roots topological order.

  This function deliberately requires a hierarchy argument, preventing accidental use of Clojure's global hierarchy."
  [h tag]
  (clojure.core/ancestors h tag))

(defn descendants
  "Returns the immediate and indirect children of `tag` in reverse topological order.

  This function deliberately requires a hierarchy argument, preventing accidental use of Clojure's global hierarchy."
  [h tag]
  (clojure.core/descendants h tag))

(defn parents
  "Returns the immediate parents of `tag` in derivation order.

  This function deliberately requires a hierarchy argument, preventing accidental use of Clojure's global hierarchy."
  [h tag]
  (clojure.core/parents h tag))

(defn children
  "Returns the immediate children of `tag` in reverse derivation order."
  [h tag]
  (get-in h [:children tag]))

(defn- toposort-visit [graph state node]
  (let [{:keys [processing processed]} state]
    (when (contains? processing node)
      (throw (ex-info "Cycle in graph" {:cause      ::cyclic-graph
                                        :cycle-node node
                                        :state      state
                                        :graph      graph})))
    (if (contains? processed node)
      state
      (let [children   (get graph node)
            init-state (update state :processing conj node)
            post-state (reduce (partial toposort-visit graph)
                               init-state
                               ;; Children are stored newest-first; visit them in derivation order.
                               (reverse children))]
        (-> post-state
            (update :processed conj node)
            (update :processing disj node))))))

(defn- toposort
  "Performs a depth-first topological sort.
  Children precede their parents, and sibling ties follow derivation order."
  [roots graph]
  (->> roots
       (reduce (partial toposort-visit graph)
               {:processing #{}
                :processed  (ordered-set)})
       :processed))

(defn- calculate-sorted-tags
  [h]
  (let [roots (reduce disj
                      (into (ordered-set) (keys (:children h)))
                      (keys (:parents h)))]
    (toposort roots (:children h))))

(defn sorted-tags
  "Returns all tags in leaves-to-roots topological order, using derivation order to break ties."
  [h]
  (or (:sorted-tags h)
      (calculate-sorted-tags h)))

(defn- calculate-derived-fields [h]
  (let [ts          (calculate-sorted-tags h)
        re-sort     (fn [m order] (update-vals m #(into (ordered-set) (filter % order))))
        ancestors   (re-sort (:ancestors h) ts)
        descendants (re-sort (:descendants h) (reverse ts))]
    (assoc h
           :sorted-tags ts
           :ancestors ancestors
           :descendants descendants)))

(defn derive
  "Establishes a parent/child relationship between two keyword tags.

  Direct parents retain derivation order.
  Ancestors use leaves-to-roots topological order, and descendants use the reverse order."
  [h tag parent]
  (assert (not= tag parent) "A tag cannot derive from itself.")
  (assert (keyword? tag) "Tag must be a keyword.")
  (assert (keyword? parent) "Parent must be a keyword.")
  (assert (::ordered? (meta h)) "This operation requires an ordered hierarchy.")

  (let [parent-map (:parents h)
        child-map  (:children h)]
    (if (contains? (parent-map tag) parent)
      h
      (-> (assoc h :parents (update parent-map tag #(or % (ordered-set))))
          (clojure.core/derive tag parent)
          (assoc :children (update child-map parent #(into (ordered-set tag) %)))
          calculate-derived-fields
          (with-meta (assoc (meta h) ::ordered? true))))))

(defn first-common-ancestor
  "Returns the first shared ancestor of `tag-a` and `tag-b` in the hierarchy's leaves-to-roots topological order.

  Each tag counts as its own ancestor.
  If either tag is nil, returns the other tag.
  Returns nil when there is no common ancestor."
  [h tag-a tag-b]
  (cond
    (nil? tag-a) tag-b
    (nil? tag-b) tag-a
    (= tag-a tag-b) tag-a
    ;; Tags with no ancestors, including tags absent from the hierarchy, come back as nil.
    :else (let [ancestors-a (or (ancestors h tag-a) #{})
                ancestors-b (or (ancestors h tag-b) #{})]
            (cond
              (contains? ancestors-b tag-a) tag-a
              (contains? ancestors-a tag-b) tag-b
              :else (some ancestors-b ancestors-a)))))

;;; A specialization of Clojure hierarchies that preserves the ordering of insertions.
(ns metabase.util.ordered-hierarchy
  (:refer-clojure :exclude [ancestors derive descendants make-hierarchy parents])
  (:require
   [flatland.ordered.set :refer [ordered-set]]))

(defn make-hierarchy
  "Similar to [[clojure.core/make-hierarchy]], but the returned hierarchy will supports ordered derivations.

  !! WARNING !!
  Using [[clojure.core/derive]] with this will corrupt the ordering - you must use the implementation from this ns."
  []
  (vary-meta (clojure.core/make-hierarchy) assoc ::ordered? true))

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

(defn parent
  "Determine the most specific parent node. Nil for a root node."
  [h child]
  (first (parents h child)))

(defn children
  "Returns the immediate children of tag, as established via derive. Later derivations are shown first."
  [h tag]
  (-> h :children tag))

(defn tags
  "An unordered set of all the tags within a given hierarchy. This will work with regular hierarchies too."
  [h]
  (into (set (keys (:parents h))) (keys (:children h))))

(defn- bfs [h ->next tag]
  (loop [up-next (list tag)
         visited (ordered-set)]
    (if (empty? up-next)
      visited
      (let [next-tags (mapcat (partial ->next h) up-next)]
        (recur next-tags (into visited next-tags))))))

(defn- map-to-vals [f ks]
  (zipmap ks (map f ks)))

(defn derive
  "Establishes a parent/child relationship between two keyword tags, similar to [[clojure.core/derive]].
  Where it differs is that the order in which we derive keys is significant - it determines the order in which we return
  its parents. Ancestors are returned according to a breadth first traversal of these parents, with duplicates removed,
  and descendants are likewise returned in the opposite order."
  [h tag parent]
  (assert (not= tag parent))
  (assert (keyword tag))
  (assert (keyword? parent))
  (assert (::ordered? (meta h)) "This operation requires an ordered hierarchy.")

  (let [tp (:parents h)
        tc (:children h)
        ta (:ancestors h)]
    (if (contains? (tp tag) parent)
      h
      (do (when (contains? (ta tag) parent)
            (throw (Exception. (print-str tag "already has" parent "as ancestor"))))
          (when (contains? (ta parent) tag)
            (throw (Exception. (print-str "Cyclic derivation:" parent "has" tag "as ancestor"))))

          (let [h  (assoc h
                     :parents (update tp tag #(conj (or % (ordered-set)) parent))
                     :children (update tc parent #(into (ordered-set tag) %)))
                ts (tags h)]
            (with-meta
             ;; This could be optimized by being selective over which tags are updated, and performing incremental
             ;; updates to the corresponding sets. We're doing it this way purely for simplicity.
             (assoc h
               :ancestors (map-to-vals (partial bfs h parents) ts)
               :descendants (map-to-vals (partial bfs h children) ts))
             {::ordered? true}))))))

(defn- first-common-tag
  "Given two ordered sets corresponding to ancestor in a hierarchy, return the first ancestor of tag-a which is also an
  ancestor of tag-b.
  Returns nil if there is no such intersection."
  [ancestors-a ancestors-b]
  ;; I suspect this is not commutative, so this ordering is important - we care more about being close to tag-a.
  (some ancestors-b ancestors-a))

(defn first-common-ancestor
  "Given two tags, return the first \"ancestor\" of the first tag which is also an \"ancestor\" of tag-b.
  We use a more relaxed definition of \"ancestor\" here than usual, which includes the tag itself.
  Returns nil if there is no common ancestor."
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

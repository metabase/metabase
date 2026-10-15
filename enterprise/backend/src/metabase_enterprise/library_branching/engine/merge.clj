(ns metabase-enterprise.library-branching.engine.merge
  "The three-way merge of snapshots: a rule per item, then a structural check of the result."
  (:refer-clojure :exclude [merge])
  (:require
   [metabase-enterprise.library-branching.engine.validate :as validate]
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(defn- merge-item
  "The merged content of item `id` from its contents `b`, `o` and `t` (nil: no content), or ::conflict."
  [decisions id b o t]
  (cond
    (= o t)                                                 o
    (= o b)                                                 t
    (= t b)                                                 o
    (and (contains? decisions id) (= (get decisions id) o)) o
    :else                                                   ::conflict))

(defn- changed?
  [x b id]
  (not= (get x id) (get b id)))

(defn- involved
  "The items that structural finding `finding` is about."
  [{:keys [rule id place ids ref]}]
  (case rule
    (:place-inside :kind-fits :namespace)   [id place]
    (:refs-closed :ref-kind)                [id (second ref)]
    (:acyclic :unique-key :nested-identity) (sort snapshot/compare-identities ids)
    (:root :area-root)                      [id]))

(defn- pair
  "`[i j]`: two different items of `ids`, `i` changed in `o` and `j` changed in `t` against `b`; nil when there are
  none."
  [b o t ids]
  (first (for [i ids, j ids
               :when (and (not= i j) (changed? o b i) (changed? t b j))]
           [i j])))

(defn- violations
  [b o t m opts]
  (mapv (fn [finding]
          (let [[i j] (pair b o t (involved finding))]
            (assoc finding :ours i :theirs j)))
        (validate/validate m opts)))

(defn merge
  "The three-way merge of snapshots `o` (ours) and `t` (theirs) from their base `b`. A value of `b` can be
  `:unknown`, a base that equals no content (the base of an identity in the trash of an instance with no base).

  Per item: if `o` and `t` agree, or only one side changed it against `b`, the result takes that content; a delete is
  no content. So an item with an unknown base takes the content of `o` and `t` when they agree, and is a conflict
  when they differ. `decisions` is `{identity content}`, the person's keep-mine decisions: a decision holds while its
  content equals the item's content in `o`, and takes it. Any other item is a conflict. Then the result gets the
  structural check of `validate`, with `opts`.

  Returns `{:ok m}`, or `{:conflicts [...] :violations [...]}`:
  - a conflict is `{:id i :base b(i) :ours o(i) :theirs t(i)}`, in the order of the identities;
  - a violation is a finding of `validate` with `:ours i` and `:theirs j`, two different items that the finding is
    about, `i` changed in `o` and `j` in `t` (for a key clash, two items with the key). With well-formed inputs and
    no conflict, these always exist; otherwise they can be nil. With conflicts, the check runs on the result in which
    each conflicted item has its content of `o`."
  ([b o t decisions]
   (merge b o t decisions {}))
  ([b o t decisions opts]
   (let [ids       (sort snapshot/compare-identities (distinct (concat (keys b) (keys o) (keys t))))
         results   (map (fn [id] [id (merge-item decisions id (get b id) (get o id) (get t id))]) ids)
         conflicts (into [] (keep (fn [[id r]]
                                    (when (= ::conflict r)
                                      {:id id :base (get b id) :ours (get o id) :theirs (get t id)})))
                         results)
         tentative (into {} (keep (fn [[id r]]
                                    (when-some [content (if (= ::conflict r) (get o id) r)]
                                      [id content])))
                         results)
         found     (violations b o t tentative opts)]
     (if (and (empty? conflicts) (empty? found))
       {:ok tentative}
       {:conflicts conflicts :violations found}))))

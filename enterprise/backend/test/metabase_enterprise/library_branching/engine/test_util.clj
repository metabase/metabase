(ns metabase-enterprise.library-branching.engine.test-util
  "Generators of related snapshots for the tests of the merge and the plan.

  A base, a local and a remote snapshot share their identities: each comes from one well-formed universe by a list of
  edits, and every edit keeps a snapshot well formed. So a merge test sees items that one side or both sides created,
  deleted, renamed, moved and changed. The edits are random choices, so test.check shrinks them directly."
  (:require
   [clojure.set :as set]
   [clojure.test.check.generators :as gen]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.test-util :as lb.tu]))

(set! *warn-on-reflection* true)

(defn eid
  "A 21-character entity id that starts with `prefix`, padded with `_`."
  [prefix]
  (apply str prefix (repeat (- 21 (count prefix)) \_)))

(defn item
  "An item of `kind` named `item-name` at `place`, with references `refs` and no attributes."
  ([kind item-name place]
   (item kind item-name place #{}))
  ([kind item-name place refs]
   {:kind kind :name item-name :place place :refs (set refs) :attrs {}}))

(defn sorted-ids
  "The identities of snapshot `s`, in the order of [[snapshot/compare-identities]]."
  [s]
  (sort snapshot/compare-identities (keys s)))

(defn- nth-of
  [xs k]
  (when (seq xs)
    (nth xs (mod k (count xs)))))

(defn subtree
  "The set of `id` and every item of `s` whose chain of places reaches `id`."
  [s id]
  (let [children (group-by :place (map (fn [[i it]] (assoc it ::id i)) s))]
    (loop [todo [id], seen #{}]
      (if-let [[x & more] (seq todo)]
        (if (seen x)
          (recur more seen)
          (recur (into (vec more) (map ::id (get children x))) (conj seen x)))
        seen))))

(defn- keep-refs
  "Item `it` with only the references that close in `s`."
  [s it]
  (update it :refs #(into #{} (filter (fn [[_ target]] (or (lb.tu/env-target? target) (contains? s target)))) %)))

(defn- delete-edit
  [s id]
  (let [gone (subtree s id)
        s    (apply dissoc s gone)]
    (update-vals s #(keep-refs s %))))

(defn- move-edit
  [s id k]
  (let [kind       (:kind (get s id))
        below      (subtree s id)
        containers (filter (fn [c] (and (not (below c))
                                        (contains? (get snapshot/may-contain (:kind (get s c)) #{}) kind)))
                           (sorted-ids s))]
    (assoc-in s [id :place] (nth-of (cons nil containers) k))))

(defn- restore-edit
  "Adds the `k`th item of universe `u` that `s` lacks and whose container `s` holds, with its references that close."
  [u s k]
  (let [candidates (filter (fn [i] (and (not (contains? s i))
                                        (let [p (:place (get u i))] (or (nil? p) (contains? s p)))))
                           (sorted-ids u))]
    (if-let [i (nth-of candidates k)]
      (assoc s i (keep-refs s (get u i)))
      s)))

(def ^:private names ["Robin" "Toucan" "Heron" "Wren"])

(defn- apply-edit
  [u s [op k x]]
  (if-let [id (nth-of (sorted-ids s) k)]
    (case op
      :delete   (delete-edit s id)
      :rename   (assoc-in s [id :name] (nth-of names x))
      :describe (assoc-in s [id :attrs :description] (str "d" (mod x 3)))
      :move     (move-edit s id x)
      :add-ref  (update-in s [id :refs] conj [:card (nth-of (sorted-ids s) x)])
      :drop-ref (update-in s [id :refs] #(disj % (first (sort-by str %))))
      :restore  (restore-edit u s x))
    (restore-edit u s x)))

(defn apply-edits
  "Snapshot `s` after each edit of `edits`, in order. `u` is the universe that a restore takes items from. Every edit
  keeps a well-formed snapshot well formed."
  [u s edits]
  (reduce (partial apply-edit u) s edits))

(def ^:private edit-gen
  (gen/tuple (gen/elements [:restore :delete :rename :describe :move :add-ref :drop-ref]) gen/nat gen/nat))

(def ^:private edits-gen (gen/vector edit-gen 0 6))

(defn related-snapshots-gen
  "Generates `[b o t]`: a base and two snapshots that edit it. Each is well formed. `opts` go to
  [[lb.tu/well-formed-snapshot-gen]] for the universe; `:max-items` defaults to 12."
  ([] (related-snapshots-gen {}))
  ([opts]
   (gen/fmap (fn [[u eb eo et]]
               (let [b (apply-edits u u eb)]
                 [b (apply-edits u b eo) (apply-edits u b et)]))
             (gen/tuple (lb.tu/well-formed-snapshot-gen (merge {:max-items 12} opts)) edits-gen edits-gen edits-gen))))

(defn changed
  "The identities whose content differs between snapshots `x` and `y`."
  [x y]
  (set (filter #(not= (get x %) (get y %)) (set/union (set (keys x)) (set (keys y))))))

(ns metabase-enterprise.library-branching.engine.test-util
  "Generators of related snapshots for the tests of the merge and the plan.

  A base, a local and a remote snapshot share their identities: each comes from one well-formed universe by a list of
  edits, and every edit keeps a snapshot well formed. So a merge test sees items that one side or both sides created,
  deleted, renamed, moved, changed and gave another kind. The edits are random choices, so test.check shrinks them directly."
  (:require
   [clojure.set :as set]
   [clojure.test.check.generators :as gen]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.test-util :as lb.tu]
   [metabase.util :as u]))

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
                                        (contains? (get snapshot/may-contain (:kind (get s c)) #{}) kind)
                                        (lb.tu/library-fits? (get s c) (get s id))))
                           (sorted-ids s))]
    (assoc-in s [id :place] (nth-of (cons nil containers) k))))

(defn- key-taken?
  "True iff an item of `s` other than `id`, of the kind of item `it`, has the unique key of `it`
  ([[snapshot/unique-key]])."
  [s id it]
  (when-some [k (snapshot/unique-key snapshot/unique-keys it)]
    (some (fn [[j other]]
            (and (not= j id) (= (:kind it) (:kind other)) (= k (snapshot/unique-key snapshot/unique-keys other))))
          s)))

(defn- rename-edit
  "Renames item `id`, unless an item of its kind has the new name as its unique key."
  [s id item-name]
  (let [it (assoc (get s id) :name item-name)]
    (if (key-taken? s id it) s (assoc s id it))))

(defn- restore-edit
  "Adds the `k`th item of universe `u` that `s` lacks, whose container `s` holds with a kind that may contain it and
  with the Library rules, and whose unique key no item of `s` has, with its references that close."
  [u s k]
  (let [candidates (filter (fn [i] (and (not (contains? s i))
                                        (let [{:keys [kind place]} (get u i)]
                                          (or (nil? place)
                                              (and (contains? s place)
                                                   (contains? (get snapshot/may-contain (:kind (get s place)) #{}) kind)
                                                   (lb.tu/library-fits? (get s place) (get u i)))))
                                        (not (key-taken? s i (get u i)))))
                           (sorted-ids u))]
    (if-let [i (nth-of candidates k)]
      (assoc s i (keep-refs s (get u i)))
      s)))

(def ^:private names ["Robin" "Toucan" "Heron" "Wren" "robin" "Héron"])

(def ^:private entity-id-kinds
  "The kinds whose items have an entity id as their identity, in order."
  (vec (sort (disj snapshot/kinds :published-table))))

(defn- rekind-edit
  "Gives item `id` the `k`th kind of the kinds that its container may contain, that may contain its contents, that
  keep the Library rules and unique keys, other than its own; with no such kind, or for an item whose identity is not
  an entity id, `s`."
  [s id k]
  (let [{:keys [kind place] :as it} (get s id)
        allowed  (if place (get snapshot/may-contain (:kind (get s place)) #{}) (set entity-id-kinds))
        contents (keep (fn [[_ c]] (when (= id (:place c)) c)) s)
        kinds    (filterv (fn [kd]
                            (let [it' (assoc it :kind kd)]
                              (and (not= kd kind)
                                   (contains? allowed kd)
                                   (set/subset? (set (map :kind contents)) (get snapshot/may-contain kd #{}))
                                   (lb.tu/library-fits? (get s place) it')
                                   (every? (partial lb.tu/library-fits? it') contents)
                                   (not (key-taken? s id it')))))
                          entity-id-kinds)]
    (if (and (string? id) (seq kinds))
      (assoc-in s [id :kind] (nth-of kinds k))
      s)))

(defn- apply-edit
  [u s [op k x]]
  (if-let [id (nth-of (sorted-ids s) k)]
    (case op
      :delete   (delete-edit s id)
      :rename   (rename-edit s id (nth-of names x))
      :describe (assoc-in s [id :attrs :description] (str "d" (mod x 3)))
      :move     (move-edit s id x)
      :rekind   (rekind-edit s id x)
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
  (gen/tuple (gen/elements [:restore :delete :rename :describe :move :add-ref :drop-ref :rekind]) gen/nat gen/nat))

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

(defn key-clash-snapshots-gen
  "Generates `[b o t ours theirs]`: `[b o t]` as [[related-snapshots-gen]] gives them, then `o` renames its snippet
  `ours` or adds it, and `t` adds the snippet `theirs`, both with a name whose key no item of `b`, `o` and `t` has.
  The two names can differ in case. So each side keeps unique keys, and the per-item merge gives `ours` and `theirs`
  one key."
  []
  (gen/fmap (fn [[[b o t] k upper?]]
              (let [taken    (set (map (comp snapshot/fold-name :name) (concat (vals b) (vals o) (vals t))))
                    clash    (first (remove (comp taken snapshot/fold-name) (map #(str "Clash " %) (range))))
                    snippets (filterv #(= :snippet (:kind (get o %))) (sorted-ids o))
                    ours     (if (and (seq snippets) (even? k)) (nth-of snippets (quot k 2)) (eid "clashours"))
                    theirs   (eid "clashtheirs")]
                [b
                 (if (contains? o ours)
                   (assoc-in o [ours :name] clash)
                   (assoc o ours (item :snippet clash nil)))
                 (assoc t theirs (item :snippet (cond-> clash upper? u/upper-case-en) nil))
                 ours
                 theirs]))
            (gen/tuple (related-snapshots-gen) gen/nat gen/boolean)))

(defn key-moves-gen
  "Generates `{:l {id name} :m {id name} :refs #{[from to]}}`: the names of 1 to 5 snippets in `l`, and the names in
  `m` of those snippets and of up to 2 new ones, all from one pool of names that start with `prefix`. A name of `m` can
  be the name of another snippet in `l`, so the snippets of `m` take keys that others free: renames, swaps, rotations
  and new holders of a freed key. A name of `m` can be in upper case, which is the same key. `:refs` are references
  among the snippets of `m`. The new snippets have the least identities."
  [prefix]
  (gen/let [n-old   (gen/choose 1 5)
            n-new   (gen/choose 0 2)
            n-spare (gen/choose 0 2)
            in-l    (gen/shuffle (range (+ n-old n-new n-spare)))
            in-m    (gen/shuffle (range (+ n-old n-new n-spare)))
            upper   (gen/vector gen/boolean (+ n-old n-new))
            refs    (gen/vector (gen/tuple gen/nat gen/nat) 0 4)]
    (let [old       (mapv #(eid (str "keyold" %)) (range n-old))
          m-ids     (into (mapv #(eid (str "keynew" %)) (range n-new)) old)
          item-name #(str prefix " " %)]
      {:l    (zipmap old (map item-name in-l))
       :m    (zipmap m-ids (map (fn [i upper?] (cond-> (item-name i) upper? u/upper-case-en)) in-m upper))
       :refs (set (map (fn [[from to]] [(nth-of m-ids from) (nth-of m-ids to)]) refs))})))

(defn key-move-snapshots-gen
  "Generates `[b o t]`: `o` is `b`, and `t` moves the unique keys of the snippets of `b` as [[key-moves-gen]] gives
  them. Every snippet is in one collection."
  []
  (gen/fmap (fn [{:keys [l m refs]}]
              (let [lib       (eid "keylib")
                    snapshot  (fn [names refs]
                                (into {lib (item :collection "Library" nil)}
                                      (map (fn [[id item-name]]
                                             [id (item :snippet item-name lib
                                                       (for [[from to] refs :when (= from id)] [:snippet to]))]))
                                      names))
                    local     (snapshot l #{})]
                [local local (snapshot m refs)]))
            (key-moves-gen "Key")))

(defn key-trash-snapshots-gen
  "Generates `[b o t]` as [[key-move-snapshots-gen]], but `t` lacks some of the snippets of `b`, and its references to
  them: so a write can take the key of a snippet that `t` removes."
  []
  (gen/fmap (fn [[[b o t] drops]]
              (let [snippets (filter #(= :snippet (:kind (get b %))) (sorted-ids b))
                    gone     (keep-indexed (fn [i id] (when (nth drops i false) id)) snippets)
                    t        (apply dissoc t gone)]
                [b o (update-vals t #(keep-refs t %))]))
            (gen/tuple (key-move-snapshots-gen) (gen/vector gen/boolean 5))))

(def ^:private cycle-kinds [:collection :metric :published-table])

(defn- cycle-items
  "`{identity item}`: the cycle of items of `choices`, each `[kind place letter]`. Item `i` refers to item `i + 1`,
  and the last item to the first; `chords` (`[from to]` pairs of indices) add more references. The place of item `i`
  is nil or a collection before it in the cycle; a published table is at the root level, as the collections hold no
  type. `letter` gives the identity, so the order of the identities is not the order of the cycle."
  [choices chords]
  (let [n     (count choices)
        kinds (mapv #(nth cycle-kinds (mod (first %) (count cycle-kinds))) choices)
        ids   (mapv (fn [kind [_ _ letter]]
                      (if (= :published-table kind)
                        ["Cycle Database" nil (str "T" letter)]
                        (eid (str "cycle" letter))))
                    kinds choices)
        place (fn [i k] (let [containers (filterv #(= :collection (kinds %)) (range i))]
                          (some->> (nth-of (cons nil containers) k) (nth ids))))
        refs  (fn [i] (into #{[:card (nth ids (mod (inc i) n))]}
                            (keep (fn [[from to]] (when (= i (mod from n)) [:card (nth ids (mod to n))])))
                            chords))]
    (into {} (map-indexed (fn [i [_ k letter]]
                            [(nth ids i) (item (kinds i) (str "Cycle " letter)
                                               (when-not (= :published-table (kinds i)) (place i k))
                                               (refs i))])
                          choices))))

(def ^:private cycle-choices-gen
  "Generates the `[kind place letter]` choices of a cycle of 2 to 5 items, with distinct letters."
  (gen/bind (gen/choose 2 5)
            (fn [n]
              (gen/fmap (fn [[kinds places letters]] (mapv vector kinds places letters))
                        (gen/tuple (gen/vector gen/nat n)
                                   (gen/vector gen/nat n)
                                   (gen/fmap #(vec (take n %)) (gen/shuffle "ABCDEFGH")))))))

(defn ref-cycle-snapshots-gen
  "Generates `[b o t]`: `[b o t]` as [[related-snapshots-gen]] gives them, and a reference cycle of 2 to 5 new items
  ([[cycle-items]]), so that a plan must trash or write the whole cycle. Either `b` and `o` hold the cycle and `t`
  removes it, or only `t` holds it. Each snapshot stays well formed."
  []
  (gen/fmap (fn [[[b o t] choices chords trash?]]
              (let [c (cycle-items choices chords)]
                (if trash?
                  [(into b c) (into o c) t]
                  [b o (into t c)])))
            (gen/tuple (related-snapshots-gen)
                       cycle-choices-gen
                       (gen/vector (gen/tuple gen/nat gen/nat) 0 3)
                       gen/boolean)))

(def ^:private content-kinds [:collection :dashboard :metric :question])

(defn- container-items
  "`{identity item}`: a collection at the root level and its content, one item for each `[kind place]` of `choices`.
  The place of item `i` is the collection or a collection of the content before it. `refs` (`[from to]` pairs of
  indices, 0 the collection) are the references among them."
  [choices refs]
  (let [ids   (mapv #(eid (str "kindchange" %)) (range (inc (count choices))))
        kinds (into [:collection] (map #(nth content-kinds (mod (first %) (count content-kinds)))) choices)
        n     (count ids)
        place (fn [i k] (let [containers (filterv #(= :collection (kinds %)) (range i))]
                          (nth ids (nth-of containers k))))]
    (into {}
          (map (fn [i]
                 [(nth ids i)
                  (item (kinds i)
                        (str "Kind change " i)
                        (when (pos? i) (place i (second (nth choices (dec i)))))
                        (keep (fn [[from to]] (when (= i (mod from n)) [:card (nth ids (mod to n))])) refs))]))
          (range n))))

(defn- evict-and-rekind
  "Snapshot `s` in which the collection `id` gives up its content, then takes the `k`th kind that [[rekind-edit]]
  allows. Each item of the content goes to the trash with its own content (`(evictions i)` false) or moves out of
  `id` ([[move-edit]] with `(evictions i)`, to the root level when that move keeps it in `id`)."
  [s id evictions k]
  (let [content (filter #(= id (:place (get s %))) (sorted-ids s))
        s       (reduce (fn [s [i child]]
                          (cond
                            (not (contains? s child)) s
                            (nth-of evictions i)      (let [s' (move-edit s child (nth-of evictions i))]
                                                        (cond-> s'
                                                          (= id (get-in s' [child :place])) (assoc-in [child :place] nil)))
                            :else                     (delete-edit s child)))
                        s
                        (map-indexed vector content))]
    (rekind-edit s id k)))

(defn kind-change-snapshots-gen
  "Generates `[b o t]`: `[b o t]` as [[related-snapshots-gen]] gives them, and a collection at the root level with a
  content of 1 to 4 items, with references among them. In `t`, the content leaves the collection (to the trash, to the
  root level, or to another container), and the collection takes a kind of another table. Either `b` and `o` hold the
  collection and `t` the change, or the reverse. Each snapshot stays well formed."
  []
  (gen/fmap (fn [[[b o t] choices refs evictions k reverse?]]
              (let [c      (container-items choices refs)
                    change #(evict-and-rekind % (eid "kindchange0") evictions k)]
                (if reverse?
                  [(into b (change c)) (into o (change c)) (into t c)]
                  [(into b c) (into o c) (change (into t c))])))
            (gen/tuple (related-snapshots-gen)
                       (gen/vector (gen/tuple gen/nat gen/nat) 1 4)
                       (gen/vector (gen/tuple gen/nat gen/nat) 0 5)
                       (gen/vector (gen/one-of [(gen/return false) gen/nat]) 1 4)
                       gen/nat
                       gen/boolean)))

(defn with-unknown
  "Base snapshot `b` in which the base value of the `k`th identity of `ids`, for each `k` of `ks`, is `:unknown`."
  [b ids ks]
  (let [ids (vec (sort snapshot/compare-identities (distinct ids)))]
    (if (empty? ids)
      b
      (into b (map (fn [k] [(nth ids (mod k (count ids))) :unknown])) ks))))

(defn unknown-base-snapshots-gen
  "Generates `[b o t]` as [[related-snapshots-gen]] does, with an unknown base value for some identities of the three
  snapshots."
  []
  (gen/fmap (fn [[[b o t] ks]] [(with-unknown b (concat (keys b) (keys o) (keys t)) ks) o t])
            (gen/tuple (related-snapshots-gen) (gen/vector gen/nat 0 4))))

(defn changed
  "The identities whose content differs between snapshots `x` and `y`."
  [x y]
  (set (filter #(not= (get x %) (get y %)) (set/union (set (keys x)) (set (keys y))))))

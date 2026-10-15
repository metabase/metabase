(ns metabase-enterprise.library-branching.engine.validate
  "The structural check of a snapshot: the rules that every snapshot that sync writes obeys. It needs the snapshot
  only; the semantic check against an environment is a separate step."
  (:require
   [metabase-enterprise.library-branching.snapshot :as snapshot]))

(set! *warn-on-reflection* true)

(defn- sorted-items
  [s]
  (sort-by key snapshot/compare-identities s))

(defn- env-target?
  [target]
  (and (vector? target) (= :env (first target))))

(defn- closed?
  "True iff reference target `target` names an item of `s` or an environment object."
  [s target]
  (or (env-target? target) (contains? s target)))

(defn- area-of
  "The area of `areas` whose root `place` names, when no item of `s` has the identity `place`; else nil."
  [s areas place]
  (when-not (contains? s place)
    (get areas place)))

(defn- place-findings
  [s areas]
  (for [[id {:keys [place]}] (sorted-items s)
        :when (and (some? place) (not (contains? s place)) (not (contains? areas place)))]
    {:rule :place-inside :id id :place place}))

(defn- cycles
  "The containment cycles of `s`, each as the set of the items on it."
  [s]
  ;; Each walk follows places from one start until it leaves the snapshot, meets an item of an earlier walk, or meets
  ;; an item of its own path; only the last case is a new cycle. So each item is walked once.
  (loop [[start & more :as todo] (map key (sorted-items s)), done #{}, found []]
    (cond
      (empty? todo) found
      (done start)  (recur more done found)
      :else
      (let [[path stop] (loop [at start, path [], on-path #{}]
                          (cond
                            (or (nil? at) (not (contains? s at)) (done at)) [path nil]
                            (on-path at)                                   [path at]
                            :else (recur (:place (get s at)) (conj path at) (conj on-path at))))]
        (recur more
               (into done path)
               (cond-> found
                 stop (conj (set (drop-while #(not= stop %) path)))))))))

(defn- cycle-findings
  [s]
  (for [ids (cycles s)]
    {:rule :acyclic :ids ids}))

(defn- kind-findings
  [s may-contain areas]
  (for [[id {:keys [kind place]}] (sorted-items s)
        :let  [container (get s place)
               area      (area-of s areas place)
               allowed   (cond
                           container (get may-contain (:kind container) #{})
                           area      (:kinds area))]
        :when (and allowed (not (contains? allowed kind)))]
    {:rule :kind-fits :id id :place place}))

(defn- ref-findings
  [s]
  (for [[id {:keys [refs]}] (sorted-items s)
        ref                 (sort-by str refs)
        :when               (not (closed? s (second ref)))]
    {:rule :refs-closed :id id :ref ref}))

(defn- unique-key-findings
  [s unique-keys]
  (let [holders (reduce (fn [acc [id {:keys [kind] :as item}]]
                          (if-some [k (snapshot/unique-key unique-keys item)]
                            (update acc [kind k] (fnil conj []) id)
                            acc))
                        {}
                        (sorted-items s))]
    (for [[[kind _] ids] (sort-by (comp first val) snapshot/compare-identities holders)
          :when (next ids)]
      {:rule :unique-key
       :kind kind
       :key  (get-in (get s (first ids)) (get-in unique-keys [kind :path]))
       :ids  (set ids)})))

(defn- nested-identity-findings
  [s nested-ids]
  (let [holders (reduce (fn [acc [id {:keys [kind] :as item}]]
                          (reduce (fn [acc nested] (update acc [kind nested] (fnil conj []) id))
                                  acc
                                  (distinct (snapshot/nested-identities nested-ids item))))
                        {}
                        (sorted-items s))]
    ;; In the order of the least holder, then of the nested identity.
    (for [[[kind nested] ids] (->> holders
                                   (sort-by (comp second key))
                                   (sort-by (comp first val) snapshot/compare-identities))
          :when (next ids)]
      {:rule :nested-identity :kind kind :key nested :ids (set ids)})))

(defn- namespace-findings
  [s areas]
  (for [[id {:keys [kind place attrs]}] (sorted-items s)
        :let  [container (get s place)
               area      (area-of s areas place)]
        :when (and (= :collection kind)
                   (cond
                     area                           (not= (:namespace attrs) (:namespace area))
                     (= :collection (:kind container)) (not= (:namespace attrs) (:namespace (:attrs container)))))]
    {:rule :namespace :id id :place place}))

(defn- ref-kind-findings
  [s ref-kinds]
  (for [[id {:keys [kind refs]}] (sorted-items s)
        :let                     [roles (get ref-kinds kind)]
        :when                    roles
        [role target :as ref]    (sort-by str refs)
        :let                     [allowed (get roles role)]
        :when                    (and allowed
                                      (or (env-target? target)
                                          (and (contains? s target)
                                               (not (contains? allowed (:kind (get s target)))))))]
    {:rule :ref-kind :id id :ref ref}))

(defn- library-findings
  [s library-content]
  ;; One finding per item, the section rule first, as master checks the two in that order.
  (for [[id {:keys [kind place] :as item}] (sorted-items s)
        :let    [container (get s place)
                 t         (:type (:attrs container))
                 holds     (get library-content t)
                 rule      (when (= :collection (:kind container))
                             (cond
                               (and holds (not (contains? holds (snapshot/content-type item))))
                               :library-content

                               (and (= :published-table kind) (not= snapshot/table-collection-type t))
                               :table-collection))]
        :when   rule]
    {:rule rule :id id :place place}))

(defn- area-root-findings
  [s areas]
  (for [[id _] (sorted-items s)
        :when (contains? areas id)]
    {:rule :area-root :id id}))

(defn- root-findings
  [s roots]
  (when roots
    (for [[id {:keys [place]}] (sorted-items s)
          :when (and (nil? place) (not (contains? roots id)))]
      {:rule :root :id id})))

(defn validate
  "The structural findings of snapshot `s`, a vector that is empty iff `s` is well formed. `s` must satisfy
  `::snapshot/snapshot`. Each finding is one of:

  - `{:rule :place-inside :id i :place p}`: the place `p` of item `i` is neither in `s` nor an area root;
  - `{:rule :acyclic :ids #{i ...}}`: the items of one containment cycle;
  - `{:rule :kind-fits :id i :place p}`: the kind of container `p`, or the area root `p`, cannot contain the kind of
    `i`;
  - `{:rule :refs-closed :id i :ref [role target]}`: `target` is neither an item of `s` nor `[:env natural-key]`;
  - `{:rule :unique-key :kind k :key v :ids #{i ...}}`: two or more items of kind `k` with one unique key
    (`snapshot/unique-key`); `v` is the key of the one with the least identity, as it is in that item;
  - `{:rule :nested-identity :kind k :key e :ids #{i ...}}`: two or more items of kind `k` hold a nested entry with
    the identity `e` (`snapshot/nested-identities`);
  - `{:rule :namespace :id i :place p}`: collection `i` is in collection `p`, and the two `:namespace` attributes
    differ (absent is one value); or `p` is an area root, and the `:namespace` of `i` is not the area's;
  - `{:rule :ref-kind :id i :ref [role target]}`: `target` is an environment object or an item of `s` whose kind
    `:ref-kinds` does not allow for `role` from the kind of `i`;
  - `{:rule :root :id i}`: item `i` is at the root level and is not one of `:roots`;
  - `{:rule :area-root :id i}`: `s` holds an item with the identity `i` of an area root;
  - `{:rule :library-content :id i :place p}`: `p` is a collection whose `:type` `:library-content` names, and that
    type cannot hold the content type of `i` ([[snapshot/content-type]]);
  - `{:rule :table-collection :id i :place p}`: the published table `i` is in the collection `p`, whose type is not
    [[snapshot/table-collection-type]], and `p` has no `:library-content` finding for `i`.

  An area root is a place that names an identity of `:areas` and no item of `s`.

  `opts`, each with a default: `:roots`, the set of identities that may be at the root level (no check when absent);
  `:areas`, `{identity {:kinds #{kind} :namespace ns}}`, the area roots ([[snapshot/area-roots]]);
  `:may-contain`, `{kind #{kind}}` ([[snapshot/may-contain]]); `:unique-keys`, `{kind {:path path :name? bool}}`
  ([[snapshot/unique-keys]]); `:ref-kinds`, `{kind {role #{kind}}}` ([[snapshot/ref-kinds]]); `:nested-ids`, `{kind
  path}` ([[snapshot/nested-ids]]); `:library-content`, `{collection-type #{content-type}}`
  ([[snapshot/library-content]]). These tables can name kinds that are not in [[snapshot/kinds]]: validate reads only
  the kind, place, references, `:namespace`, `:type`, `:dashboard_id`, unique key and nested identities of an item."
  ([s]
   (validate s {}))
  ([s {:keys [roots areas may-contain unique-keys ref-kinds nested-ids library-content]
       :or   {areas           snapshot/area-roots
              may-contain     snapshot/may-contain
              unique-keys     snapshot/unique-keys
              ref-kinds       snapshot/ref-kinds
              nested-ids      snapshot/nested-ids
              library-content snapshot/library-content}}]
   (vec (concat (place-findings s areas)
                (cycle-findings s)
                (kind-findings s may-contain areas)
                (ref-findings s)
                (unique-key-findings s unique-keys)
                (nested-identity-findings s nested-ids)
                (namespace-findings s areas)
                (ref-kind-findings s ref-kinds)
                (root-findings s roots)
                (area-root-findings s areas)
                (library-findings s library-content)))))

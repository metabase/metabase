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

(defn- place-findings
  [s]
  (for [[id {:keys [place]}] (sorted-items s)
        :when (and (some? place) (not (contains? s place)))]
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
  [s may-contain]
  (for [[id {:keys [kind place]}] (sorted-items s)
        :let  [container (get s place)]
        :when (and container (not (contains? (get may-contain (:kind container) #{}) kind)))]
    {:rule :kind-fits :id id :place place}))

(defn- ref-findings
  [s]
  (for [[id {:keys [refs]}] (sorted-items s)
        ref                 (sort-by str refs)
        :when               (not (closed? s (second ref)))]
    {:rule :refs-closed :id id :ref ref}))

(defn- root-findings
  [s roots]
  (when roots
    (for [[id {:keys [place]}] (sorted-items s)
          :when (and (nil? place) (not (contains? roots id)))]
      {:rule :root :id id})))

(defn validate
  "The structural findings of snapshot `s`, a vector that is empty iff `s` is well formed. `s` must satisfy
  `::snapshot/snapshot`. Each finding is one of:

  - `{:rule :place-inside :id i :place p}`: the place `p` of item `i` is not in `s`;
  - `{:rule :acyclic :ids #{i ...}}`: the items of one containment cycle;
  - `{:rule :kind-fits :id i :place p}`: the kind of container `p` cannot contain the kind of `i`;
  - `{:rule :refs-closed :id i :ref [role target]}`: `target` is neither an item of `s` nor `[:env natural-key]`;
  - `{:rule :root :id i}`: item `i` is at the root level and is not one of `:roots`.

  `opts`: `:roots`, the set of identities that may be at the root level (no check when absent); `:may-contain`,
  `{kind #{kind}}` (default [[snapshot/may-contain]])."
  ([s]
   (validate s {}))
  ([s {:keys [roots may-contain] :or {may-contain snapshot/may-contain}}]
   (vec (concat (place-findings s)
                (cycle-findings s)
                (kind-findings s may-contain)
                (ref-findings s)
                (root-findings s roots)))))

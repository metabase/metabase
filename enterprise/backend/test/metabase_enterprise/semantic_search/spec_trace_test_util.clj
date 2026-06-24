(ns metabase-enterprise.semantic-search.spec-trace-test-util
  "Helpers for walking `metabase.search.spec` shapes in tests — used to verify structural claims
  like `:denormalized-from` against the actual join-equality graph of a spec."
  (:require
   [clojure.string :as str]
   [metabase.search.spec :as search.spec]))

(defn- join-equality-pairs
  "Return `[col-a col-b]` for every `[:= col-a col-b]` subform of `condition` where both sides are
  column-reference keywords. Walks through compound conditions like `[:and ...]`."
  [condition]
  (->> (tree-seq sequential? seq condition)
       (filter (fn [node]
                 (and (vector? node)
                      (= := (first node))
                      (= 3 (count node))
                      (keyword? (nth node 1))
                      (keyword? (nth node 2)))))
       (map (fn [[_ a b]] [a b]))))

(defn- column-alias
  "Extract the `:alias` from a dotted column-reference keyword like `:alias.col`. Returns nil if the
  keyword is not in `alias.col` form."
  [col]
  (when (keyword? col)
    (let [idx (str/index-of (name col) \.)]
      (when idx
        (keyword (subs (name col) 0 idx))))))

(defn- attr-seed-columns
  "Qualified `:alias.col` columns that `:attrs` entry `attr-key`/`attr-val` references, to seed a trace."
  [attr-key attr-val]
  ;; Delegate to the indexer's own extractor so the seed grammar (`true` shorthand, nested
  ;; vector/`{:fields ...}` exprs, SQL-function/control-keyword filtering) can't drift from what the index
  ;; reads. `find-fields-attr` yields `[alias col]` pairs (`:this` = base model); re-qualify to the
  ;; `:alias.col` keywords used in `:joins`.
  (into #{}
        (map (fn [[alias col]] (keyword (str (name alias) "." (name col)))))
        (persistent! (#'search.spec/find-fields-attr (transient []) attr-key attr-val))))

(defn trace-collection-id-source-models
  "Return t2-model keywords reachable from the spec's `:collection-id` attribute via join equalities.
  `:this` resolves to the spec's own base model; other aliases resolve via `:joins`. A claim of
  `:denormalized-from X` is structurally sound iff `X` is in the returned set."
  [spec]
  (let [seed-cols    (attr-seed-columns :collection-id (get-in spec [:attrs :collection-id]))
        joins        (:joins spec)
        alias->model (-> (into {} (map (fn [[alias [model _]]] [alias model])) joins)
                         (assoc :this (:model spec)))
        edges        (mapcat (fn [[_ [_ jcond]]] (join-equality-pairs jcond)) joins)
        eq-map       (reduce (fn [m [a b]]
                               (-> m
                                   (update a (fnil conj #{}) b)
                                   (update b (fnil conj #{}) a)))
                             {}
                             edges)
        reachable    (loop [visited #{}
                            queue   (vec seed-cols)]
                       (if-let [col (first queue)]
                         (if (visited col)
                           (recur visited (rest queue))
                           (recur (conj visited col)
                                  (into (vec (rest queue)) (eq-map col))))
                         visited))]
    (into #{} (keep (comp alias->model column-alias)) reachable)))

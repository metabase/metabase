(ns metabase-enterprise.semantic-search.spec-trace-test-util
  "Helpers for walking `metabase.search.spec` shapes in tests — used to verify structural claims
  like `:denormalized-from` against the actual join-equality graph of a spec."
  (:require
   [clojure.string :as str]
   [metabase.util :as u]))

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

(defn- qualify-this
  "Ensure `kw` is a dotted column-reference keyword. Bare column keywords are treated as belonging to
  `:this`, mirroring `find-fields-kw` in `metabase.search.spec`."
  [kw]
  (if (column-alias kw)
    kw
    (keyword (str "this." (name kw)))))

(defn attr-expr-columns
  "Recursively extract the set of dotted column-reference keywords referenced in an `:attrs`
  expression, mirroring `find-fields-expr`/`find-fields-kw` in `metabase.search.spec`. Descends
  into nested vectors and `{:fields ...}` maps, and filters out SQL-function/control keywords
  (`:else`, `:integer`, `:float`, `%...`)."
  [expr]
  (cond
    (keyword? expr)
    (if (or (str/starts-with? (name expr) "%")
            (#{:else :integer :float} expr))
      #{}
      #{(qualify-this expr)})

    (and (vector? expr) (> (count expr) 1))
    (into #{} (mapcat attr-expr-columns) (subvec expr 1))

    (and (map? expr) (:fields expr))
    (into #{} (mapcat attr-expr-columns) (:fields expr))

    :else #{}))

(defn- attr-seed-columns
  "Return the set of dotted column-reference keywords to seed a trace from, given an `:attrs` attr
  value. Mirrors the shorthand expansion in `metabase.search.spec`:
  - `true`: column with the attr's name in snake_case, qualified to `:this`
  - keyword, vector expression, or `{:fields ...}` map: recursively collected via
    `attr-expr-columns`, matching `find-fields-expr` semantics"
  [attr-key attr-val]
  (if (true? attr-val)
    #{(keyword (str "this." (u/->snake_case_en (name attr-key))))}
    (attr-expr-columns attr-val)))

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

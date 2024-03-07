(ns metabase.lib.walk
  "Tools for walking and transforming a query.")

(declare walk-stages*)

(defn- reduce-preserving-reduced
  "Like [[reduce]] but preserves the [[reduced]] wrapper around the result. This is important because we use a few
  different calls to [[reduce]] below that we'd like to skip if any of them returns [[reduced]]."
  [rf init xs]
  (if (reduced? init)
    init
    (reduce
     (fn [acc x]
       ;; HACK: just wrap the reduced value in [[reduced]] again, [[reduce]] will unwrap the first wrapper but we'll
       ;; still have the original wrapper around the value.
       (let [acc' (rf acc x)]
         (if (reduced? acc')
           (reduced acc')
           acc')))
     init
     xs)))

(defn- walk-items* [query path-to-items walk-item-fn f]
  ;; negative-item-offset below is a negative index e.g. [-3 -2 -1] rather than normal positive index e.g. [0 1 2] to
  ;; handle splicing in additional stages/joins if the walk function `f` returns more than one stage/join. The total
  ;; number of stages/joins might change, but for walking purposes the negative indexes will refer to the same things
  ;; regardless of how many things we splice in front of it. This way the path always is correct even if the number of
  ;; items change. See [[metabase.lib.walk/return-multiple-stages-test]]
  ;; and [[metabase.lib.walk/return-multiple-joins-test]]
  (reduce-preserving-reduced
   (fn [query negative-item-offset]
     (let [items                (get-in query path-to-items)
           absolute-item-number (+ negative-item-offset (count items)) ; e.g. [-3 -2 1] => [0 1 2]
           path-to-item         (conj (vec path-to-items) absolute-item-number)]
       (walk-item-fn query path-to-item f)))
   query
   (range (- (count (get-in query path-to-items []))) 0 1)))

(defn- walk-join* [query path-to-join f]
  (let [path-to-join-stages (conj (vec path-to-join) :stages)
        query'              (walk-stages* query path-to-join-stages f)]
    (if (reduced? query')
      query'
      (f query' :lib.walk/join path-to-join))))

(defn- walk-joins* [query path-to-joins f]
  (walk-items* query path-to-joins walk-join* f))

(defn- walk-stage* [query path-to-stage f]
  (let [stage         (get-in query path-to-stage)
        path-to-joins (conj (vec path-to-stage) :joins)
        ;; only walk joins in MBQL stages, if someone tries to put them in a native stage ignore them since they're
        ;; not allowed there anyway.
        query'        (if (and (= (:lib/type stage :mbql.stage/mbql) :mbql.stage/mbql)
                               (seq (get-in query path-to-joins)))
                        (walk-joins* query path-to-joins f)
                        query)]
    (if (reduced? query')
      query'
      (f query' :lib.walk/stage path-to-stage))))

(defn- walk-stages* [query path-to-stages f]
  (walk-items* query path-to-stages walk-stage* f))

(defn- walk-query* [query f]
  (walk-stages* query [:stages] f))

(defn- splice-at-point
  "Splice multiple `new-items` into `m` at `path`.

    ;; replace item at [:stages 2] -- {:n 2} -- with three new items
    (#'metabase.lib.walk/splice-at-point
                        {:stages [{:n 0} {:n 1} {:n 2} {:n 3} {:n 4}]}
                        [:stages 2]
                        [{:x 1}
                         {:x 2}
                         {:x 3}])
    ;; =>
    {:stages [{:n 0} {:n 1} {:x 1} {:x 2} {:x 3} {:n 3} {:n 4}]}"
  [m path new-items]
  (update-in m (butlast path) (fn [coll]
                                (let [[before after] (split-at (last path) coll)
                                      after          (rest after)]
                                  (into []
                                        cat
                                        [before new-items after])))))

(defn walk
  "Depth-first recursive walk and replace for a `query`; call

    (f query path-type path stage-or-join)

  for each `stage-or-join` in the query, including recursive ones inside joins. `path-type` is either `:lib.walk/join`
  or `:lib.walk/stage`; `query` is the entire query and `path` is the absolute path to the current `stage-or-join`.
  The results of `f`, the updated stage or join, are spliced into the query at `path` if `f` returns something; `nil`
  values are ignored and the query will not be unchanged (this is useful for walking the query for validation
  purposes).

    ;; add default limit to all stages
    (defn add-default-limit [query]
      (walk
       query
       (fn [_query path-type _path stage-or-join]
         (when (= path-type :lib.walk/stage)
           (merge {:limit 1000} stage-or-join)))))

  You can replace a single stage or join with multiple by returning a vector of maps rather than a single map. Cool!

  To return a value right away, wrap it in [[reduced]], and subsequent walk calls will be skipped:

    ;; check whether any stage of a query has a `:source-card`
    (defn query-has-source-card? [query]
      (true? (walk
              query
              (fn [_query _path-type _path stage-or-join]
                (when (:source-card stage-or-join)
                  (reduced true))))))"
  [query f]
  (unreduced
   (walk-query*
    query
    (fn [query path-type path]
      (let [stage-or-join  (get-in query path)
            stage-or-join' (or (f query path-type path stage-or-join)
                               stage-or-join)]
        (cond
          (reduced? stage-or-join')                 stage-or-join'
          (identical? stage-or-join' stage-or-join) query
          (sequential? stage-or-join')              (splice-at-point query path stage-or-join')
          :else                                     (assoc-in query path stage-or-join')))))))

(defn walk-stages
  "Like [[walk]], but only walks the stages in a query. `f` is invoked like

    (f query path stage)"
  [query f]
  (walk
   query
   (fn [query path-type path stage-or-join]
     (when (= path-type :lib.walk/stage)
       (f query path stage-or-join)))))

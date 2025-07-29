(ns metabase.lib.walk
  "Tools for walking and transforming a query."
  (:require
   [metabase.lib.join :as lib.join]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(declare walk-stages*)

(defn- walk-items* [query path-to-items walk-item-fn f]
  ;; negative-item-offset below is a negative index e.g. [-3 -2 -1] rather than normal positive index e.g. [0 1 2] to
  ;; handle splicing in additional stages/joins if the walk function `f` returns more than one stage/join. The total
  ;; number of stages/joins might change, but for walking purposes the negative indexes will refer to the same things
  ;; regardless of how many things we splice in front of it. This way the path always is correct even if the number of
  ;; items change. See [[metabase.lib.walk/return-multiple-stages-test]]
  ;; and [[metabase.lib.walk/return-multiple-joins-test]]
  (u/reduce-preserving-reduced
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

(mr/def ::path-type
  [:enum :lib.walk/join :lib.walk/stage])

(mr/def ::stage-or-join
  [:or ::lib.schema/stage ::lib.schema.join/join])

(mr/def ::walk-stages-fn-result
  "Schema for the return value for the function passed into [[walk-stages]]. One stage can be replaced with multiple
  stages."
  [:maybe
   [:or
    ::lib.schema/stage
    [:sequential ::lib.schema/stage]]])

(mr/def ::walk-fn-result
  "Schema for the return value for the function passed into [[walk]]."
  [:maybe
   [:or
    ::walk-stages-fn-result
    ::lib.schema.join/join]])

(mu/defn walk :- ::lib.schema/query
  "Depth-first recursive walk and replace for a `query`; call

    (f query path-type path stage-or-join)

  for each `stage-or-join` in the query, including recursive ones inside joins. `path-type` is either `:lib.walk/join`
  or `:lib.walk/stage`; `query` is the entire query and `path` is the absolute path to the current `stage-or-join`.
  The results of `f`, the updated stage(s) or join, are spliced into the query at `path` if `f` returns something; `nil`
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
  [query :- ::lib.schema/query
   f     :- [:=>
             [:cat :map ::path-type ::path ::stage-or-join]
             ::walk-fn-result]]
  (unreduced
   (walk-query*
    query
    (mu/fn [query     :- :map ; query can be invalid during the walk process, only needs to be valid again at the end.
            path-type :- ::path-type
            path      :- ::path]
      (let [stage-or-join  (get-in query path)
            stage-or-join' (or (f query path-type path stage-or-join)
                               stage-or-join)]
        (cond
          (reduced? stage-or-join')                 stage-or-join'
          (identical? stage-or-join' stage-or-join) query
          (sequential? stage-or-join')              (splice-at-point query path stage-or-join')
          :else                                     (assoc-in query path stage-or-join')))))))

(mu/defn walk-stages :- ::lib.schema/query
  "Like [[walk]], but only walks the stages in a query. `f` is invoked like

    (f query path stage) => updated-stage-or-nil"
  [query :- ::lib.schema/query
   f     :- [:=> [:cat :map ::path ::lib.schema/stage] ::walk-stages-fn-result]]
  (walk
   query
   (mu/fn :- ::walk-stages-fn-result
     [query         :- :map ; don't re-validate query at every step in case we make edits that make it temporarily invalid
      path-type     :- ::path-type
      path          :- ::path
      stage-or-join :- ::stage-or-join]
     (when (= path-type :lib.walk/stage)
       (f query path stage-or-join)))))

(mr/def ::path.stages-part
  [:cat
   [:= :stages]
   ::lib.schema.common/int-greater-than-or-equal-to-zero])

(mr/def ::path.joins-part
  [:cat
   [:= :joins]
   ::lib.schema.common/int-greater-than-or-equal-to-zero])

;;; A path to a specific stage.
(mr/def ::stage-path
  [:cat
   ::path.stages-part
   [:*
    [:cat
     ::path.joins-part
     ::path.stages-part]]])

;; a path to a specific stage OR a specific join.
(mr/def ::path
  [:cat
   ::stage-path
   [:? ::path.joins-part]])

(mu/defn query-for-path :- [:map
                            [:query ::lib.schema/query]
                            [:stage-number :int]]
  "For compatibility with functions that take query + stage-number. Create a fake query with the top-level `:stages`
   pointing to the stages in `path`; return a map with this fake `:query` and `stage-number`.
   A join path will return `0` for `stage-number`

   Lets you use stuff like [[metabase.lib.aggregation/resolve-aggregation]] in combination with [[walk-stages]]."
  [query      :- ::lib.schema/query
   stage-path :- ::path]
  (let [[_stages stage-number & more] stage-path]
    (if (empty? more)
      {:query query, :stage-number stage-number}
      (let [[_joins join-number & more] more
            join                        (nth (lib.join/joins query stage-number) join-number)
            query'                      (assoc query :stages (:stages join))]
        (recur query' (if (empty? more) [:stages 0] more))))))

(mu/defn apply-f-for-stage-at-path
  "Use a function that takes top-level `query` and `stage-number` with a `query` and `path`,
  via [[query-for-stage-at-path]]. Lets you use stuff like [[metabase.lib.aggregation/resolve-aggregation]] in
  combination with [[walk-stages]].

    (lib.walk/apply-f-for-stage-at-path f query path x y)

    =>

    (f <query> <stage-number> x y)"
  [f          :- fn?
   query      :- ::lib.schema/query
   stage-path :- ::path
   & args]
  (let [{:keys [query stage-number]} (query-for-path query stage-path)]
    (apply f query stage-number args)))

(mu/defn previous-path :- [:maybe ::path]
  "Return to the previous stage or join, if there is one; if not, returns `nil`."
  [path :- ::path]
  (when (pos-int? (last path))
    (conj (vec (butlast path)) (dec (last path)))))

(mu/defn next-path :- [:maybe ::path]
  "Return to the next stage or join, if there is one; if not, returns `nil`."
  [query :- ::lib.schema/query
   path  :- ::path]
  (let [num-stages-or-joins (count (get-in query (butlast path)))]
    (when (< (inc (last path)) num-stages-or-joins)
      (conj (vec (butlast path)) (inc (last path))))))

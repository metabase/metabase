(ns metabase.query-processor.util.nest-query
  "The [[nest-expressions]] query transformation (see docstring for more info).

  TODO (Cam 10/22/25) -- this is a pure-MBQL-5 high-level query transformation, and almost certainly belongs in Lib
  rather than in QP -- we should move it there. (This also applies
  to [[metabase.query-processor.util.transformations.nest-breakouts]])."
  (:refer-clojure :exclude [select-keys some])
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [select-keys some]]))

;; Mark all Fields at the new top level as `:qp/ignore-coercion` so QP implementations know not to apply coercion
;; or whatever to them a second time.
;; In fact, we don't mark all Fields, only the ones we deem coercible. Marking all would make a bunch of tests
;; fail, but it might still make sense. For example, #48721 would have been avoided by unconditional marking.

(defn- contains-expression-refs? [location]
  (lib.util.match/match-one location :expression))

(defn- should-nest-expressions? [query path]
  (and (lib.walk/apply-f-for-stage-at-path lib/mbql-stage? query path)
       (some (fn [f]
               (contains-expression-refs? (lib.walk/apply-f-for-stage-at-path f query path)))
             [lib/breakouts
              lib/aggregations
              lib/order-bys])))

(def ^:private first-stage-keys
  #{:expressions :joins :source-table :source-card})

;; TODO (Cam 10/22/25) -- somewhat duplicated with/copied
;; from [[metabase.query-processor.util.transformations.nest-breakouts/fields-used-in-breakouts-aggregations-or-expressions]]
(defn- fields-needed-by-second-stage [stage]
  (let [stage' (apply dissoc stage first-stage-keys)
        refs (volatile! (transient []))]
    ;; temporarily disable enforcement since this stage is technically invalid since we removed all
    ;; the [[first-stage-keys]]
    (binding [lib.schema/*HACK-disable-ref-validation* true]
      (lib.walk/walk-clauses-in-stage
       stage'
       (fn [clause]
         (u/prog1 clause
           (when (lib/clause-of-type? clause #{:field :expression})
             (vswap! refs conj! clause))))))
    ;; use an ordered set so we preserve the order we saw things when we walked the query so the fields we return are
    ;; determinate. Otherwise tests using this are liable to be flaky because results can change because test metadata
    ;; has randomly generated IDs
    (into
     []
     (m/distinct-by (fn [[tag opts id-or-name]]
                      [tag
                       (select-keys opts [:join-alias :temporal-unit :bucketing])
                       id-or-name]))
     (persistent! @refs))))

(defn- new-first-stage [stage]
  (-> stage
      (select-keys (conj first-stage-keys :lib/type))
      (assoc :fields (lib/fresh-uuids (vec (fields-needed-by-second-stage stage))))))

(defn- new-second-stage [query path stage]
  (let [returned-cols (lib.walk/apply-f-for-stage-at-path lib/returned-columns query path)]
    (letfn [(update-ref [a-ref]
              (let [col          (lib.walk/apply-f-for-stage-at-path lib/metadata query path a-ref)
                    returned-col (m/find-first (partial lib.equality/= col) returned-cols)]
                (-> returned-col
                    lib/update-keys-for-col-from-previous-stage
                    lib/ref)))]
      ;; temporarily disable enforcement since this stage will be invalid while we're messing with it... it will look
      ;; pretty nice when we're done tho.
      (binding [lib.schema/*HACK-disable-ref-validation* true]
        (-> stage
            (as-> $stage (apply dissoc $stage first-stage-keys))
            (lib.walk/walk-clauses-in-stage
             (fn [clause]
               (cond-> clause
                 (lib/clause-of-type? clause #{:field :expression})
                 update-ref))))))))

(mu/defn- nest-expressions* :- [:sequential {:min 2, :max 2} ::lib.schema/stage.mbql]
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage.mbql]
  (let [new-first-stage (new-first-stage stage)]
    [new-first-stage
     (new-second-stage (assoc-in query path new-first-stage) path stage)]))

(mu/defn nest-expressions :- ::lib.schema/query
  "For queries with `expressions` in the final stage, adds an additional stage and moves the breakouts, aggregations,
  and order bys into the new final stage. This is because lots of our SQL databases don't really like when you do
  stuff like this:

    SELECT (x + ?) AS x_1
    FROM my_table
    GROUP BY (x + ?)
    ORDER BY (x + ?) ASC

  Why? They are dumb and can't figure out `x + ?` is the same thing. So instead we will introduce an additional stage
  that will give us SQL that looks like this:

    SELECT x_1 AS x_1
    FROM (
      SELECT (x + ?) AS x_1
      FROM my_table
    ) source
    GROUP BY x_1
    ORDER BY x_1 ASC"
  [query :- ::lib.schema/query]
  (lib.walk/walk-stages
   query
   (fn [query path stage]
     (when (should-nest-expressions? query path)
       (nest-expressions* query path stage)))))

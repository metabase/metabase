(ns metabase.metabot.query-repair
  "Repair of structured queries that lost their `:lib/*` keys.

  A query in conversation state persisted before the viewing context kept its `:lib/*` keys (BOT-2410), or one a
  client sends without them, has no `:lib/type` and no `:lib/uuid`s. Normalization gives each aggregation a fresh
  `:lib/uuid`, so a ref to an aggregation, such as an order-by on it, names a uuid that no aggregation carries. When
  the stage has one aggregation the ref can only mean that one, and it is pointed there.

  [[repair-stripped-query]] runs on every query of conversation state as it is normalized, so every tool reads a
  valid MBQL 5 query. [[normalize-query]] is the same repair for a query on its way to the frontend, where the link
  path keeps its own fallback."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(declare repoint-dangling-aggregation-refs-in-stage)

(defn- repoint-in-joins
  [stage]
  (cond-> stage
    (sequential? (:joins stage))
    (update :joins (partial mapv (fn [join]
                                   (cond-> join
                                     (sequential? (:stages join))
                                     (update :stages (partial mapv repoint-dangling-aggregation-refs-in-stage))))))))

(defn- repoint-dangling-aggregation-refs-in-stage
  "Point every `[:aggregation opts uuid]` ref in `stage` that names none of the stage's aggregations at the stage's
  only aggregation, then do the same in the stages of its joins. With several aggregations the target is unknown, so
  the refs stay as they are.

  [[lib.schema/ref-errors-for-stage]] finds the dangling refs, with the same rule the query schema validates by. It
  skips `:joins`, which are walked here, and namespaced keys."
  [stage]
  (let [uuids (into #{} (map (comp :lib/uuid second)) (:aggregation stage))
        stage (if (= 1 (count uuids))
                (let [sole (first uuids)]
                  (reduce (fn [stage [path clause]]
                            (cond-> stage
                              (and (= :aggregation (first clause))
                                   (= 3 (count clause)))
                              (assoc-in (conj path 2) sole)))
                          stage
                          (lib.schema/ref-errors-for-stage stage)))
                stage)]
    (repoint-in-joins stage)))

(defn normalize-query
  "Normalize `query` as MBQL 5 and repoint its dangling aggregation refs; see
  [[repoint-dangling-aggregation-refs-in-stage]]. Throws when `query` does not normalize. The result is not
  validated: a ref that could mean any of several aggregations stays dangling."
  [query]
  (let [normalized (lib/normalize ::lib.schema/query query)]
    (cond-> normalized
      (vector? (:stages normalized))
      (update :stages (partial mapv repoint-dangling-aggregation-refs-in-stage)))))

(defn repair-stripped-query
  "Repair `query` for conversation state when it is a structured query without its `:lib/type`: normalize it and
  repoint its dangling aggregation refs. Any other value is returned unchanged, and so is a query whose repair is
  not a valid query, or does not normalize at all: state must read even when it holds a query no tool can run, and
  the tools' own guards word the refusal."
  [query]
  (if (and (map? query) (:stages query) (not (:lib/type query)))
    (try
      (let [repaired (normalize-query query)]
        (if (mr/validate ::lib.schema/query repaired)
          repaired
          query))
      (catch Exception e
        (log/warn e "Failed to repair a query without :lib/type in conversation state")
        query))
    query))

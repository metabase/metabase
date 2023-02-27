(ns metabase.lib.util
  "TODO -- this should probably be rolled into [[metabase.lib.query]]."
  (:require
   [clojure.set :as set]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(defn- native-query->pipeline [query]
  (merge {:lib/type :mbql/query
          :type     :pipeline
          ;; we're using `merge` here instead of threading stuff so the `:lib/` keys are the first part of the map for
          ;; readability in the REPL.
          :stages   [(merge (lib.options/ensure-uuid {:lib/type :mbql.stage/native})
                            (set/rename-keys (:native query) {:query :native}))]}
         (dissoc query :type :native)))

(defn- inner-query->stages [{:keys [source-query], :as inner-query}]
  (let [stages     (if source-query
                     (inner-query->stages source-query)
                     [])
        stage-type (if (:native inner-query)
                     :mbql.stage/native
                     :mbql.stage/mbql)
        ;; we're using `merge` here instead of threading stuff so the `:lib/` keys are the first part of the map for
        ;; readability in the REPL.
        this-stage (merge (lib.options/ensure-uuid
                           {:lib/type stage-type})
                          (dissoc inner-query :source-query))]
    (conj stages this-stage)))

(defn- mbql-query->pipeline [query]
  (merge {:lib/type :mbql/query
          :type     :pipeline
          :stages   (inner-query->stages (:query query))}
         (dissoc query :type :query)))

(mu/defn pipeline :- ::lib.schema/query
  "Take a 'traditional' MBQL query and convert it to a `:pipeline` query."
  [query :- [:map [:type [:keyword]]]]
  (condp = (:type query)
    :pipeline query
    :native   (native-query->pipeline query)
    :query    (mbql-query->pipeline query)))

(mu/defn ^:private non-negative-stage-index :- ::lib.schema.common/int-greater-than-or-equal-to-zero
  "If `stage-number` index is a negative number e.g. `-1` convert it to a positive index so we can use `nth` on
  `stages`. `-1` = the last stage, `-2` = the penultimate stage, etc."
  [stages       :- [:sequential ::lib.schema/stage]
   stage-number :- :int]
  (let [stage-number' (if (neg? stage-number)
                        (+ (count stages) stage-number)
                        stage-number)]
    (when (or (> stage-number' (dec (count stages)))
              (neg? stage-number'))
      (throw (ex-info (i18n/tru "Stage {0} does not exist" stage-number)
                      {})))
    stage-number'))

(defn has-stage?
  "Whether the query has a stage with `stage-number` (can be zero-indexed)."
  [{:keys [stages], :as _query} stage-number]
  ;; TODO -- this is a little bit duplicated from the logic above... find a way to consolidate?
  (let [stage-number (if (neg? stage-number)
                       (+ (count stages) stage-number)
                       stage-number)]
    (and (not (neg? stage-number))
         (< stage-number (count stages)))))

(mu/defn query-stage :- ::lib.schema/stage
  "Fetch a specific `stage` of a query. This handles negative indecies as well, e.g. `-1` will return the last stage of
  the query."
  [query        :- [:map [:type [:keyword]]]
   stage-number :- :int]
  (let [{:keys [stages]} (pipeline query)]
    (nth (vec stages) (non-negative-stage-index stages stage-number))))

(mu/defn update-query-stage :- ::lib.schema/query
  "Update a specific `stage-number` of a `query` by doing

    (apply f stage args)

  `stage-number` can be a negative index, e.g. `-1` will update the last stage of the query."
  [query        :- [:map [:type [:keyword]]]
   stage-number :- :int
   f & args]
  (let [{:keys [stages], :as query} (pipeline query)
        stage-number'               (non-negative-stage-index stages stage-number)
        stages'                     (apply update (vec stages) stage-number' f args)]
    (assoc query :stages stages')))

(mu/defn ensure-mbql-final-stage :- ::lib.schema/query
  "Convert query to a `:pipeline` query, and make sure the final stage is an `:mbql` one."
  [query]
  (let [query (pipeline query)]
    (cond-> query
      (= (:lib/type (query-stage query -1)) :mbql.stage/native)
      (update :stages conj (lib.options/ensure-uuid {:lib/type :mbql.stage/mbql})))))

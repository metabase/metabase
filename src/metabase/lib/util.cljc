(ns metabase.lib.util
  (:require
   [clojure.set :as set]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

;;; TODO -- all of this `->pipeline` stuff should probably be merged into [[metabase.lib.convert]] at some point in
;;; the near future.

(defn- native-query->pipeline
  "Convert a `:type` `:native` QP MBQL query to a `:type` `:pipeline` pMBQL query. See docstring
  for [[mbql-query->pipeline]] for an explanation of what this means."
  [query]
  (merge {:lib/type :mbql/query
          :type     :pipeline
          ;; we're using `merge` here instead of threading stuff so the `:lib/` keys are the first part of the map for
          ;; readability in the REPL.
          :stages   [(merge (lib.options/ensure-uuid {:lib/type :mbql.stage/native})
                            (set/rename-keys (:native query) {:query :native}))]}
         (dissoc query :type :native)))

(declare inner-query->stages)

(defn- join->pipeline [join]
  (let [source (select-keys join [:source-table :source-query])
        stages (inner-query->stages source)]
    (-> join
        (dissoc :source-table :source-query)
        (assoc :lib/type :mbql/join
               :stages stages)
        lib.options/ensure-uuid)))

(defn- joins->pipeline [joins]
  (mapv join->pipeline joins))

(defn- inner-query->stages [{:keys [source-query source-metadata], :as inner-query}]
  (let [previous-stages (if source-query
                          (inner-query->stages source-query)
                          [])
        previous-stages (cond-> previous-stages
                          source-metadata (assoc-in [(dec (count previous-stages)) :lib/stage-metadata] source-metadata))
        stage-type      (if (:native inner-query)
                          :mbql.stage/native
                          :mbql.stage/mbql)
        ;; we're using `merge` here instead of threading stuff so the `:lib/` keys are the first part of the map for
        ;; readability in the REPL.
        this-stage      (merge (lib.options/ensure-uuid
                                {:lib/type stage-type})
                               (dissoc inner-query :source-query :source-metadata))
        this-stage      (cond-> this-stage
                          (seq (:joins this-stage)) (update :joins joins->pipeline))]
    (conj previous-stages this-stage)))

(defn- mbql-query->pipeline
  "Convert a `:type` `:query` QP MBQL (i.e., MBQL as currently understood by the Query Processor, or the JS MLv1) to a
  `:type` `:pipeline` 'pMBQL' query. The key difference is that instead of having a `:query` with a `:source-query`
  with a `:source-query` and so forth, you have a vector of `:stages` where each stage serves as the source query for
  the next stage. Initially this was an implementation detail of a few functions, but it's easier to visualize and
  manipulate, so now all of MLv2 deals with pMBQL. See this Slack thread
  https://metaboat.slack.com/archives/C04DN5VRQM6/p1677118410961169?thread_ts=1677112778.742589&cid=C04DN5VRQM6 for
  more information."
  [query]
  (merge {:lib/type :mbql/query
          :type     :pipeline
          :stages   (inner-query->stages (:query query))}
         (dissoc query :type :query)))

(mu/defn pipeline
  "Ensure that a `query` is in the general shape of a pMBQL `:pipeline` query. This doesn't walk the query and fix
  everything! The goal here is just to make sure we have `:stages` in the correct place and the like.
  See [[metabase.lib.convert]] for functions that actually ensure all parts of the query match the pMBQL schema (they
  use this function as part of that process.)"
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
    (when (or (>= stage-number' (count stages))
              (neg? stage-number'))
      (throw (ex-info (i18n/tru "Stage {0} does not exist" stage-number)
                      {:num-stages (count stages)})))
    stage-number'))

(defn previous-stage-number
  "The index of the previous stage, if there is one."
  [{:keys [stages], :as _query} stage-number]
  (let [stage-number (if (neg? stage-number)
                       (+ (count stages) stage-number)
                       stage-number)]
    (when (pos? stage-number)
      (dec stage-number))))

(mu/defn query-stage :- ::lib.schema/stage
  "Fetch a specific `stage` of a query. This handles negative indices as well, e.g. `-1` will return the last stage of
  the query."
  [query        :- [:map [:type [:keyword]]]
   stage-number :- :int]
  (let [{:keys [stages]} (pipeline query)]
    (get (vec stages) (non-negative-stage-index stages stage-number))))

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

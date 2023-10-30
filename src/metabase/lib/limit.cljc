(ns metabase.lib.limit
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(defmethod lib.metadata.calculation/describe-top-level-key-method :limit
  [query stage-number _k]
  (when-let [limit (:limit (lib.util/query-stage query stage-number))]
    (str limit \space (i18n/trun "row" "rows" limit))))

(mu/defn ^:export limit :- ::lib.schema/query
  "Set the maximum number of rows to be returned by a stage of a query to `n`. If `n` is `nil`, remove the limit."
  ([query n]
   (limit query -1 n))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    n            :- [:maybe ::lib.schema/limit]]
   (lib.util/update-query-stage query stage-number (fn [stage]
                                                     (if n
                                                       (assoc stage :limit n)
                                                       (dissoc stage :limit))))))

(mu/defn ^:export current-limit :- [:maybe ::lib.schema/limit]
  "Get the maximum number of rows to be returned by a stage of a query. `nil` indicates there is no limit"
  ([query :- ::lib.schema/query]
   (current-limit query -1))
  ([query :- ::lib.schema/query
    stage-number :- :int]
   (:limit (lib.util/query-stage query stage-number))))


(defn- safe-min [& args]
  (transduce
   (filter some?)
   (completing
    (fn [acc n]
      (if acc
        (min acc n)
        n)))
   nil
   args))

(mu/defn query->max-rows-limit :- [:maybe ::lib.schema/limit]
  "Calculate the absolute maximum number of results that should be returned by this query (MBQL or native), useful for
  doing the equivalent of

    java.sql.Statement statement = ...;
    statement.setMaxRows(<max-rows-limit>).

  to ensure the DB cursor or equivalent doesn't fetch more rows than will be consumed.

  This is calculated as follows:

  *  If query has an MBQL last stage and has a `:limit` or `:page` clause, returns appropriate number
  *  If query has `:constraints` with `:max-results-bare-rows` or `:max-results`, returns the appropriate number
     *  `:max-results-bare-rows` is returned if set and Query does not have any aggregations
     *  `:max-results` is returned otherwise
  *  If none of the above are set, returns `nil`. In this case, you should use something like the Metabase QP's
     `max-rows-limit`"
  [{{:keys [max-results max-results-bare-rows]} :constraints, :as query} :- ::lib.schema/query
   stage-number                                                          :- :int]
  (let [stage             (lib.util/query-stage query stage-number)
        mbql-limit        (when (= (:lib/type stage) :stage/mbql)
                            (safe-min (get-in stage [:page :items])
                                      (current-limit query stage-number)))
        constraints-limit (or
                           (when-not (seq (lib.aggregation/aggregations query stage-number))
                             max-results-bare-rows)
                           max-results)]
    (safe-min mbql-limit constraints-limit)))

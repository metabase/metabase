(ns metabase.lib.limit
  (:refer-clojure :exclude [empty?])
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.page :as lib.page]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [empty?]]))

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
    n            :- [:maybe pos-int?]]
   (lib.util/update-query-stage query stage-number u/assoc-dissoc :limit n)))

(mu/defn ^:export current-limit :- [:maybe ::lib.schema.common/int-greater-than-or-equal-to-zero]
  "Get the maximum number of rows to be returned by a stage of a query. `nil` indicates there is no limit"
  ([query :- ::lib.schema/query]
   (current-limit query -1))
  ([query :- ::lib.schema/query
    stage-number :- :int]
   (:limit (lib.util/query-stage query stage-number))))

(defn ^:export disable-default-limit
  "Sets the `disable-max-results?` middleware option on `query`, which disables the default limit on
  query results. Used by transforms to allow unlimited result rows."
  [query]
  (assoc-in query [:middleware :disable-max-results?] true))

(mu/defn max-rows-limit :- [:maybe ::lib.schema.common/int-greater-than-or-equal-to-zero]
  "Calculate the absolute maximum number of results that should be returned by this query (MBQL or native), useful for
  doing the equivalent of

    java.sql.Statement statement = ...;
    statement.setMaxRows(<max-rows-limit>).

  to ensure the DB cursor or equivalent doesn't fetch more rows than will be consumed.

  This is calculated as follows:

  *  If query's last stage is `MBQL` and has a `:limit` or `:page` clause, returns appropriate number

  *  If query has `:constraints` with `:max-results-bare-rows` or `:max-results`, returns the appropriate number

     *  `:max-results-bare-rows` is returned if set and Query does not have any aggregations

     *  `:max-results` is returned otherwise

  * If none of the above are set, returns `nil`. In this case, you should use something like the Metabase QP's
     `max-rows-limit`"
  [{{:keys [max-results max-results-bare-rows]} :constraints, :as query} :- ::lib.schema/query]
  (let [mbql-limit        (when-not (lib.util/native-stage? query -1)
                            (u/safe-min (:items (lib.page/current-page query -1))
                                        (current-limit query -1)))
        constraints-limit (or (when (empty? (lib.aggregation/aggregations query -1))
                                max-results-bare-rows)
                              max-results)]
    (u/safe-min mbql-limit constraints-limit)))

(ns metabase.lib.limit
  (:require
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
    n            :- [:maybe pos-int?]]
   (lib.util/update-query-stage query stage-number (fn [stage]
                                                     (if n
                                                       (assoc stage :limit n)
                                                       (dissoc stage :limit))))))

(mu/defn ^:export current-limit :- [:maybe pos-int?]
  "Get the maximum number of rows to be returned by a stage of a query. `nil` indicates there is no limit"
  ([query :- ::lib.schema/query]
   (current-limit query -1))
  ([query :- ::lib.schema/query
    stage-number :- :int]
   (:limit (lib.util/query-stage query stage-number))))

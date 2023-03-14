(ns metabase.lib.limit
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defn limit :- ::lib.schema/query
  "Set the maximum number of rows to be returned by a stage of a query to `n`. If `n` is `nil`, remove the limit."
  ([query n]
   (limit query -1 n))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    n            :- [:maybe ::lib.schema.common/int-greater-than-zero]]
   (lib.util/update-query-stage query stage-number (fn [stage]
                                                     (if n
                                                       (assoc stage :limit n)
                                                       (dissoc stage :limit))))))

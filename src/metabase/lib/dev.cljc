(ns metabase.lib.dev
  "Conveniences for usage in REPL and tests. Things in this namespace are not meant for normal usage in the FE client or
  in QB code."
  (:require
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defn ref-lookup
  "Returns a function that can be resolved into an expression or aggregation reference for the arguments.
   Useful for tests so you don't have to split up queries to get references from metadata.
   Throws an exception if no expression with that name can be found."
  ([expression-or-aggregation :- [:enum :aggregation :expression]
    index-or-name :- [:or :string ::lib.schema.common/int-greater-than-or-equal-to-zero]]
   (fn [query stage-number]
     (case expression-or-aggregation
       :expression
       (if (some (comp #{index-or-name} lib.util/expression-name)
                 (:expressions (lib.util/query-stage query stage-number)))
         (lib.options/ensure-uuid [:expression {} index-or-name])
         (throw (ex-info (str "Undefined expression " index-or-name)
                         {:expression-name index-or-name
                          :query query
                          :stage-number stage-number})))
       :aggregation
       (if-let [[_ {ag-uuid :lib/uuid}] (get (:aggregation (lib.util/query-stage query stage-number)) index-or-name)]
         (lib.options/ensure-uuid [:aggregation {} ag-uuid])
         (throw (ex-info (str "Undefined aggregation " index-or-name)
                         {:aggregation-index index-or-name
                          :query query
                          :stage-number stage-number}))))))
  ([query
    stage-number
    expression-or-aggregation :- [:enum :aggregation :expression]
    index-or-name :- [:or :string ::lib.schema.common/int-greater-than-or-equal-to-zero]]
   ((ref-lookup expression-or-aggregation index-or-name) query stage-number)))

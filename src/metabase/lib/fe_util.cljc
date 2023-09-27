(ns metabase.lib.fe-util
  (:require
   [medley.core :as m]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.field :as lib.field]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.filter.operator :as lib.filter.operator]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.filter :as lib.schema.filter]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(def ^:private FilterParts
  [:map
   [:lib/type [:= :mbql/filter-parts]]
   [:operator ::lib.schema.filter/operator]
   [:options ::lib.schema.common/options]
   [:column [:maybe lib.filter/ColumnWithOperators]]
   [:args [:sequential :any]]])

(mu/defn filter-parts :- FilterParts
  "Return the parts of the filter clause `filter-clause` in query `query` at stage `stage-number`.
  Might obsolate [[filter-operator]]."
  ([query filter-clause]
   (filter-parts query -1 filter-clause))

  ([query :- ::lib.schema/query
    stage-number :- :int
    filter-clause :- ::lib.schema.expression/boolean]
   (let [[op options first-arg & rest-args] filter-clause
         stage            (lib.util/query-stage query stage-number)
         columns          (lib.metadata.calculation/visible-columns query stage-number stage)
         col              (lib.equality/find-matching-column first-arg columns)
         add-ref-metadata #(lib.field/extend-column-metadata-from-ref query stage-number % first-arg)]
     {:lib/type :mbql/filter-parts
      :operator (or (m/find-first #(= (:short %) op)
                                  (lib.filter.operator/filter-operators col))
                    (lib.filter.operator/operator-def op))
      :options  options
      :column   (some-> col add-ref-metadata lib.filter/add-column-operators)
      :args     (vec rest-args)})))

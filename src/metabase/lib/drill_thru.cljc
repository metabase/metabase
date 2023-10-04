(ns metabase.lib.drill-thru
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.drill-thru.column-filter :as lib.drill-thru.column-filter]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.drill-thru.distribution :as lib.drill-thru.distribution]
   [metabase.lib.drill-thru.fk-details :as lib.drill-thru.fk-details]
   [metabase.lib.drill-thru.foreign-key :as lib.drill-thru.foreign-key]
   [metabase.lib.drill-thru.object-details :as lib.drill-thru.object-details]
   [metabase.lib.drill-thru.pivot :as lib.drill-thru.pivot]
   [metabase.lib.drill-thru.pk :as lib.drill-thru.pk]
   [metabase.lib.drill-thru.quick-filter :as lib.drill-thru.quick-filter]
   [metabase.lib.drill-thru.sort :as lib.drill-thru.sort]
   [metabase.lib.drill-thru.summarize-column :as lib.drill-thru.summarize-column]
   [metabase.lib.drill-thru.summarize-column-by-time :as lib.drill-thru.summarize-column-by-time]
   [metabase.lib.drill-thru.underlying-records :as lib.drill-thru.underlying-records]
   [metabase.lib.drill-thru.zoom :as lib.drill-thru.zoom]
   [metabase.lib.drill-thru.zoom-in-timeseries :as lib.drill-thru.zoom-in-timeseries]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.util.malli :as mu]))

(comment
  lib.drill-thru.fk-details/keep-me
  lib.drill-thru.pk/keep-me
  lib.drill-thru.zoom/keep-me)

;; TODO: Different ways to apply drill-thru to a query.
;; So far:
;; - :filter on each :operators of :drill-thru/quick-filter applied with (lib/filter query stage filter-clause)

;; TODO: ActionMode, PublicMode, MetabotMode need to be captured in the FE before calling `available-drill-thrus`.

(defn- icky-hack-add-source-uuid-to-aggregation-column-metadata
  "This is an evil HACK -- the FE calls [[available-drill-thrus]] with query results metadata as produced
  by [[metabase.query-processor.middleware.annotate]], which does not include the `:lib/source-uuid` for aggregation
  columns (since it's still using legacy MBQL at this point), which
  means [[metabase.lib.aggregation/column-metadata->aggregation-ref]] can't generate references (since it requires
  `:lib/source-uuid`)... so we have to add it back in manually. I've added `:aggregation-index` to the annotate
  results (see [[metabase.query-processor.middleware.annotate/cols-for-ags-and-breakouts]]), and we can use that to
  determine the correct `:lib/source-uuid`.

  There's probably a more general place we can be doing this, but it's escaping me, so I guess this will have to do
  for now. It doesn't seem like the FE generally uses result metadata in most other places so this is not an issue
  elsewhere.

  Once we're using MLv2 queries everywhere and stop converting back to legacy we should be able to remove this ICKY
  HACK."
  [query stage-number {{:keys [aggregation-index], :as column} :column, :as context}]
  (or (when (and aggregation-index
                 (not (:lib/source-uuid column)))
        (when-let [ag (lib.aggregation/aggregation-at-index query stage-number aggregation-index)]
          (assoc-in context [:column :lib/source-uuid] (lib.options/uuid ag))))
      context))

(defmethod lib.metadata.calculation/display-info-method ::drill-thru
  [query stage-number drill-thru]
  (lib.drill-thru.common/drill-thru-info-method query stage-number drill-thru))

(mu/defn available-drill-thrus :- [:sequential [:ref ::lib.schema.drill-thru/drill-thru]]
  "Get a list (possibly empty) of available drill-thrus for a column, or a column + value pair.

  Note that if `:value nil` in the `context`, that implies the value is *missing*, ie. that this was a column click.
  For a value of `NULL` from the database, use the sentinel `:null`. Most of this file only cares whether the value was
  provided or not, but some things (eg. quick filters) treat `NULL` values differently."
  ([query context]
   (available-drill-thrus query -1 context))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    context      :- ::lib.schema.drill-thru/context]
   (let [context (icky-hack-add-source-uuid-to-aggregation-column-metadata query stage-number context)]
     (try
       (into []
             (keep #(% query stage-number context))
             ;; TODO: Missing drills: automatic insights, format.
             [lib.drill-thru.distribution/distribution-drill
              lib.drill-thru.column-filter/column-filter-drill
              lib.drill-thru.foreign-key/foreign-key-drill
              lib.drill-thru.object-details/object-detail-drill
              lib.drill-thru.pivot/pivot-drill
              lib.drill-thru.quick-filter/quick-filter-drill
              lib.drill-thru.sort/sort-drill
              lib.drill-thru.summarize-column/summarize-column-drill
              lib.drill-thru.summarize-column-by-time/summarize-column-by-time-drill
              lib.drill-thru.underlying-records/underlying-records-drill
              lib.drill-thru.zoom-in-timeseries/zoom-in-timeseries-drill])
       (catch #?(:clj Throwable :cljs :default) e
         (throw (ex-info (str "Error getting available drill thrus for query: " (ex-message e))
                         {:query        query
                          :stage-number stage-number
                          :context      context}
                         e)))))))

(mu/defn drill-thru :- ::lib.schema/query
  "`(drill-thru query stage-number drill-thru)`

  Applies the `drill-thru` to the query and stage. Keyed on the `:type` of the drill-thru. The `drill-thru` should be
  one of those returned by a call to [[available-drill-thrus]] with the same `query` and `stage-number`.

  Returns the updated query."
  ([query drill]
   (drill-thru query -1 drill))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    drill        :- ::lib.schema.drill-thru/drill-thru
    & args]
   (apply lib.drill-thru.common/drill-thru-method query stage-number drill args)))

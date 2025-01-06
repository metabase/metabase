(ns metabase.lib.drill-thru
  (:require
   [metabase.lib.drill-thru.automatic-insights :as lib.drill-thru.automatic-insights]
   [metabase.lib.drill-thru.column-extract :as lib.drill-thru.column-extract]
   [metabase.lib.drill-thru.column-filter :as lib.drill-thru.column-filter]
   [metabase.lib.drill-thru.combine-columns :as lib.drill-thru.combine-columns]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.drill-thru.distribution :as lib.drill-thru.distribution]
   [metabase.lib.drill-thru.fk-details :as lib.drill-thru.fk-details]
   [metabase.lib.drill-thru.fk-filter :as lib.drill-thru.fk-filter]
   [metabase.lib.drill-thru.object-details :as lib.drill-thru.object-details]
   [metabase.lib.drill-thru.pivot :as lib.drill-thru.pivot]
   [metabase.lib.drill-thru.pk :as lib.drill-thru.pk]
   [metabase.lib.drill-thru.quick-filter :as lib.drill-thru.quick-filter]
   [metabase.lib.drill-thru.sort :as lib.drill-thru.sort]
   [metabase.lib.drill-thru.summarize-column :as lib.drill-thru.summarize-column]
   [metabase.lib.drill-thru.summarize-column-by-time :as lib.drill-thru.summarize-column-by-time]
   [metabase.lib.drill-thru.underlying-records :as lib.drill-thru.underlying-records]
   [metabase.lib.drill-thru.zoom :as lib.drill-thru.zoom]
   [metabase.lib.drill-thru.zoom-in-bins :as lib.drill-thru.zoom-in-bins]
   [metabase.lib.drill-thru.zoom-in-geographic :as lib.drill-thru.zoom-in-geographic]
   [metabase.lib.drill-thru.zoom-in-timeseries :as lib.drill-thru.zoom-in-timeseries]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(comment
  lib.drill-thru.fk-details/keep-me
  lib.drill-thru.pk/keep-me
  lib.drill-thru.zoom/keep-me)

(defmethod lib.metadata.calculation/display-info-method ::drill-thru
  [query stage-number drill-thru]
  (lib.drill-thru.common/drill-thru-info-method query stage-number drill-thru))

;; TODO: Different ways to apply drill-thru to a query.
;; So far:
;; - :filter on each :operators of :drill-thru/quick-filter applied with (lib/filter query stage filter-clause)

;; TODO: ActionMode, PublicMode, MetabotMode need to be captured in the FE before calling `available-drill-thrus`.

;;; TODO: Missing drills: format.
(def ^:private available-drill-thru-fns
  "Some drill thru functions are expected to return drills for just the specified `:column`; others are expected to
  ignore that column and return drills for all of the columns specified in `:dimensions`.
  `:return-drills-for-dimensions?` specifies which type we have."
  [{:f #'lib.drill-thru.automatic-insights/automatic-insights-drill,             :return-drills-for-dimensions? false}
   {:f #'lib.drill-thru.column-filter/column-filter-drill,                       :return-drills-for-dimensions? true}
   {:f #'lib.drill-thru.distribution/distribution-drill,                         :return-drills-for-dimensions? true}
   {:f #'lib.drill-thru.fk-filter/fk-filter-drill,                               :return-drills-for-dimensions? false}
   {:f #'lib.drill-thru.object-details/object-detail-drill,                      :return-drills-for-dimensions? false}
   {:f #'lib.drill-thru.pivot/pivot-drill,                                       :return-drills-for-dimensions? false}
   {:f #'lib.drill-thru.quick-filter/quick-filter-drill,                         :return-drills-for-dimensions? false}
   {:f #'lib.drill-thru.sort/sort-drill,                                         :return-drills-for-dimensions? true}
   {:f #'lib.drill-thru.summarize-column/summarize-column-drill,                 :return-drills-for-dimensions? true}
   {:f #'lib.drill-thru.summarize-column-by-time/summarize-column-by-time-drill, :return-drills-for-dimensions? true}
   {:f #'lib.drill-thru.column-extract/column-extract-drill,                     :return-drills-for-dimensions? false}
   {:f #'lib.drill-thru.combine-columns/combine-columns-drill,                   :return-drills-for-dimensions? false}
   {:f #'lib.drill-thru.underlying-records/underlying-records-drill,             :return-drills-for-dimensions? false}
   {:f #'lib.drill-thru.zoom-in-timeseries/zoom-in-timeseries-drill,             :return-drills-for-dimensions? false}
   {:f #'lib.drill-thru.zoom-in-geographic/zoom-in-geographic-drill,             :return-drills-for-dimensions? true}
   {:f #'lib.drill-thru.zoom-in-bins/zoom-in-binning-drill,                      :return-drills-for-dimensions? true}])

(mu/defn- dimension-contexts :- [:maybe [:sequential {:min 1} ::lib.schema.drill-thru/context]]
  "Create new context maps (with updated `:column` and `:value` keys) for each of the `:dimensions` passed in. Some
  drill thru functions are expected to return drills for each of these columns, while others are expected to ignore
  them. Why? Who knows."
  [{:keys [dimensions], :as context} :- ::lib.schema.drill-thru/context]
  (not-empty
   (for [dimension dimensions]
     (merge context dimension))))

(mu/defn- context-with-dimensions-or-row-dimensions :- ::lib.schema.drill-thru/context
  "Return an updated `context` with either the existing `dimensions` or dimensions constructed from the `row`."
  [query                                       :- ::lib.schema/query
   {:keys [column dimensions row] :as context} :- ::lib.schema.drill-thru/context]
  ;; If no dimensions were provided but the underlying column comes from an aggregation, then construct the dimensions
  ;; from the row data. This is needed in cases where the frontend normally provides dimensions, but will not if it
  ;; cannot determine that the clicked table cell was from an "underlying" aggregation-sourced column. See, e.g. the
  ;; comment in getTableCellClickedObject in table.js.
  (let [row-dimensions (lib.drill-thru.common/dimensions-from-breakout-columns query column row)]
    (if (and (empty? dimensions) (seq row-dimensions))
      (assoc context :dimensions row-dimensions)
      context)))

(mu/defn available-drill-thrus :- [:sequential [:ref ::lib.schema.drill-thru/drill-thru]]
  "Get a list (possibly empty) of available drill-thrus for a column, or a column + value pair.

  Note that if `:value nil` in the `context`, that implies the value is *missing*, ie. that this was a column click.
  For a value of `NULL` from the database, use the sentinel `:null`. Most of this file only cares whether the value
  was provided or not, but some things (eg. quick filters) treat `NULL` values differently.
  See [[metabase.lib.js/available-drill-thrus]]."
  ([query context]
   (available-drill-thrus query -1 context))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    context      :- ::lib.schema.drill-thru/context]
   (try
     (into []
           (when (lib.metadata/editable? query)
             (let [{:keys [query stage-number]} (lib.query/wrap-native-query-with-mbql
                                                 query stage-number (:card-id context))
                   context                      (context-with-dimensions-or-row-dimensions query context)
                   dim-contexts                 (dimension-contexts context)]
               (for [{:keys [f return-drills-for-dimensions?]} available-drill-thru-fns
                     context                                   (if (and return-drills-for-dimensions? dim-contexts)
                                                                 dim-contexts
                                                                 [context])
                     :let                                      [drill (f query stage-number context)]
                     :when                                     drill]
                 drill))))
     (catch #?(:clj Throwable :cljs :default) e
       (throw (ex-info (str "Error getting available drill thrus for query: " (ex-message e))
                       {:query        query
                        :stage-number stage-number
                        :context      context}
                       e))))))

(mu/defn drill-thru :- ::lib.schema/query
  "`(drill-thru query stage-number drill-thru)`

  Applies the `drill-thru` to the query and stage. Keyed on the `:type` of the drill-thru. The `drill-thru` should be
  one of those returned by a call to [[available-drill-thrus]] with the same `query` and `stage-number`.

  Returns the updated query."
  ([query drill]
   (drill-thru query -1 nil drill))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    card-id      :- [:maybe ::lib.schema.id/card]
    drill        :- ::lib.schema.drill-thru/drill-thru
    & args]
   (log/debugf "Applying drill thru: %s"
               (u/pprint-to-str {:query query, :stage-number stage-number, :drill drill, :args args}))
   (let [{:keys [query stage-number]} (lib.query/wrap-native-query-with-mbql query stage-number card-id)]
     (apply lib.drill-thru.common/drill-thru-method query stage-number drill args))))

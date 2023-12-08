(ns metabase.lib.drill-thru.zoom-in-geographic
  "All geographic zooms require both a `:type/Latitude` and a `:type/Longitude` column
  in [[metabase.lib.metadata.calculation/visible-columns]], not necessarily in the
  query's [[metabase.lib.metadata.calculation/returned-columns]]. E.g. 'count broken out by state' query should still
  get presented this drill.

  These drills are only for 'cell' context for specific values.

  Geographic zooms are of the following flavors:

  1. Country, State, or City => Binned LatLon

     1a. If we are breaking out by a `:type/Country` column: remove breakout on country column, and add/replace
         breakouts on Latitude/Longitude with binning `:bin-width` of 10°, and add `=` filter for the clicked
         country value.

     1b. If we have a `:type/State` column, remove breakout on state column, add/replace breakouts on
         Latitude/Longitude with binning `:bin-width` of 1°, and add `=` filter for the clicked state value.

     1c. If we have a `:type/City` column, remove breakout on city column, add/replace breakouts on Latitude/Longitude
         with binning `:bin-width` of 0.1°, and add `=` filter for the clicked city value.

  2. Binned LatLon => Binned LatLon

     If we have binned breakouts on latitude and longitude:

     2a. With binning `:bin-width` >= 20°, replace them with `:bin-width` of 10° and add `:>=`/`:<` filters for the
         clicked latitude/longitude values.

     2b. Otherwise if `:bin-width` is < 20°, replace them with the current `:bin-width` divided by 10, and add
         `:>=`/`:<` filters for the clicked latitude/longitude values."
  (:require
   [medley.core :as m]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.remove-replace :as lib.remove-replace]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(def ^:private ContextWithLatLon
  [:merge
   ::lib.schema.drill-thru/context
   [:map
    [:lat-column ::lib.schema.metadata/column]
    [:lon-column ::lib.schema.metadata/column]
    [:lat-value  [:maybe number?]]
    [:lon-value  [:maybe number?]]]])

(mu/defn ^:private context-with-lat-lon :- [:maybe ContextWithLatLon]
  [query                      :- ::lib.schema/query
   stage-number               :- :int
   {:keys [row], :as context} :- ::lib.schema.drill-thru/context]
  (let [columns (lib.metadata.calculation/visible-columns query stage-number (lib.util/query-stage query stage-number))]
    (when-let [lat-column (m/find-first lib.types.isa/latitude? columns)]
      (when-let [lon-column (m/find-first lib.types.isa/longitude? columns)]
        (letfn [(same-column? [col-x col-y]
                  (if (:id col-x)
                    (= (:id col-x) (:id col-y))
                    (= (:lib/desired-column-alias col-x) (:lib/desired-column-alias col-y))))
                (column-value [column]
                  (some
                   (fn [row-value]
                     (when (same-column? column (:column row-value))
                       (:value row-value)))
                   row))]
          (assoc context
                 :lat-column lat-column
                 :lon-column lon-column
                 :lat-value (column-value lat-column)
                 :lon-value (column-value lon-column)))))))

;;;
;;; available-drill-thrus
;;;

(mu/defn ^:private country-state-city->binned-lat-lon-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.zoom-in.geographic.country-state-city->binned-lat-lon]
  [{:keys [column value lat-column lon-column], :as _context} :- ContextWithLatLon
   lat-lon-bin-width                                          :- ::lib.schema.binning/bin-width]
  (when value
    {:lib/type  :metabase.lib.drill-thru/drill-thru
     :type      :drill-thru/zoom-in.geographic
     :subtype   :drill-thru.zoom-in.geographic/country-state-city->binned-lat-lon
     :column    column
     :value     value
     :latitude  {:column    lat-column
                 :bin-width lat-lon-bin-width}
     :longitude {:column    lon-column
                 :bin-width lat-lon-bin-width}}))

(mu/defn ^:private country->binned-lat-lon-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.zoom-in.geographic.country-state-city->binned-lat-lon]
  [{:keys [column], :as context} :- ContextWithLatLon]
  (when (some-> column lib.types.isa/country?)
    (country-state-city->binned-lat-lon-drill context 10)))

(mu/defn ^:private state->binned-lat-lon-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.zoom-in.geographic.country-state-city->binned-lat-lon]
  [{:keys [column], :as context} :- ContextWithLatLon]
  (when (some-> column lib.types.isa/state?)
    (country-state-city->binned-lat-lon-drill context 1)))

(mu/defn ^:private city->binned-lat-lon-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.zoom-in.geographic.country-state-city->binned-lat-lon]
  [{:keys [column], :as context} :- ContextWithLatLon]
  (when (some-> column lib.types.isa/city?)
    (country-state-city->binned-lat-lon-drill context 0.1)))

(mu/defn ^:private binned-lat-lon->binned-lat-lon-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.zoom-in.geographic.binned-lat-lon->binned-lat-lon]
  [metadata-providerable                                             :- ::lib.schema.metadata/metadata-providerable
   {:keys [lat-column lon-column lat-value lon-value], :as _context} :- ContextWithLatLon]
  (when (and lat-value
             lon-value)
    (when-let [{lat-bin-width :bin-width} (lib.binning/resolve-bin-width metadata-providerable lat-column lat-value)]
      (when-let [{lon-bin-width :bin-width} (lib.binning/resolve-bin-width metadata-providerable lon-column lon-value)]
        (let [[new-lat-bin-width new-lon-bin-width] (if (and (>= lat-bin-width 20)
                                                             (>= lon-bin-width 20))
                                                      [10 10]
                                                      [(/ lat-bin-width 10.0)
                                                       (/ lon-bin-width 10.0)])]
          {:lib/type  :metabase.lib.drill-thru/drill-thru
           :type      :drill-thru/zoom-in.geographic
           :subtype   :drill-thru.zoom-in.geographic/binned-lat-lon->binned-lat-lon
           :latitude  {:column    lat-column
                       :bin-width new-lat-bin-width
                       :min       lat-value
                       :max       (+ lat-value lat-bin-width)}
           :longitude {:column    lon-column
                       :bin-width new-lon-bin-width
                       :min       lon-value
                       :max       (+ lon-value lon-bin-width)}})))))

(mu/defn zoom-in-geographic-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.zoom-in.geographic]
  "Return a `:drill-thru/zoom-in.geographic` drill if appropriate. See docstring
  for [[metabase.lib.drill-thru.zoom-in-geographic]] for more information on what circumstances this is returned in
  and what it means to apply this drill."
  [query                        :- ::lib.schema/query
   stage-number                 :- :int
   {:keys [value], :as context} :- ::lib.schema.drill-thru/context]
  (when value
    (when-let [context (context-with-lat-lon query stage-number context)]
      (some (fn [f]
              (f context))
            [country->binned-lat-lon-drill
             state->binned-lat-lon-drill
             city->binned-lat-lon-drill
             (partial binned-lat-lon->binned-lat-lon-drill query)]))))

;;;
;;; Application
;;;

(mu/defn ^:private add-or-update-binning :- ::lib.schema/query
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- ::lib.schema.metadata/column
   bin-width    :- pos?]
  (let [binning {:strategy  :bin-width
                 :bin-width bin-width}]
    (if-let [existing-breakout (first (lib.breakout/existing-breakouts query stage-number column))]
      (let [new-breakout (lib.binning/with-binning existing-breakout binning)]
        (lib.remove-replace/replace-clause query stage-number existing-breakout new-breakout))
      (lib.breakout/breakout query stage-number (lib.binning/with-binning column binning)))))

(mu/defn ^:private add-or-update-lat-lon-binning :- ::lib.schema/query
  [query                                                :- ::lib.schema/query
   stage-number                                         :- :int
   {{lat :column, lat-bin-width :bin-width} :latitude
    {lon :column, lon-bin-width :bin-width} :longitude} :- ::lib.schema.drill-thru/drill-thru.zoom-in.geographic]
  (-> query
      (add-or-update-binning stage-number lat lat-bin-width)
      (add-or-update-binning stage-number lon lon-bin-width)))

(mu/defn ^:private apply-country-state-city->binned-lat-lon-drill :- ::lib.schema/query
  [query                             :- ::lib.schema/query
   stage-number                      :- :int
   {:keys [column value], :as drill} :- ::lib.schema.drill-thru/drill-thru.zoom-in.geographic.country-state-city->binned-lat-lon]
  (-> query
      (lib.breakout/remove-existing-breakouts-for-column stage-number column)
      ;; TODO -- remove/update existing filter?
      (lib.filter/filter stage-number (lib.filter/= column value))
      (add-or-update-lat-lon-binning stage-number drill)))

(mu/defn ^:private apply-binned-lat-lon->binned-lat-lon-drill :- ::lib.schema/query
  [query        :- ::lib.schema/query
   stage-number :- :int
   {{lat :column, lat-min :min, lat-max :max} :latitude
    {lon :column, lon-min :min, lon-max :max} :longitude
    :as drill} :- ::lib.schema.drill-thru/drill-thru.zoom-in.geographic.binned-lat-lon->binned-lat-lon]
  (-> query
      ;; TODO -- remove/update existing filters on these columns?
      (lib.filter/filter stage-number (lib.filter/>= lat lat-min))
      (lib.filter/filter stage-number (lib.filter/<  lat lat-max))
      (lib.filter/filter stage-number (lib.filter/>= lon lon-min))
      (lib.filter/filter stage-number (lib.filter/<  lon lon-max))
      (add-or-update-lat-lon-binning stage-number drill)))

(mu/defmethod lib.drill-thru.common/drill-thru-method :drill-thru/zoom-in.geographic :- ::lib.schema/query
  [query                        :- ::lib.schema/query
   stage-number                 :- :int
   {:keys [subtype], :as drill} :- ::lib.schema.drill-thru/drill-thru.zoom-in.geographic]
  (case subtype
    :drill-thru.zoom-in.geographic/country-state-city->binned-lat-lon
    (apply-country-state-city->binned-lat-lon-drill query stage-number drill)

    :drill-thru.zoom-in.geographic/binned-lat-lon->binned-lat-lon
    (apply-binned-lat-lon->binned-lat-lon-drill query stage-number drill)))

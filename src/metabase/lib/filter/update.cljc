(ns metabase.lib.filter.update
  "Conveniences for adding or updating certain types of filters, used to power the drag-and-drop 'brush' zoom-in
  filtering in the frontend. For example the user might drag the mouse between two points on a timeseries
  visualization, and we use these functions to update the query accordingly and add a filter between the start and end
  points.

  There are three types of brush filters:

  - [[update-temporal-filter]], which works on a single temporal column (e.g. zooming in on certain range in a
    timeseries visualization)

  - [[update-numeric-filter]], which works on a single numeric column

  - [[update-lat-lon-filter]], which works on a latitude and longitude column pair. This is used with map visualizations --
    draw a box between two points to zoom in to that part of the map.

  If there is no existing filter on the column(s), these add a new filter. Existing filters are replaced."
  (:require
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.remove-replace :as lib.remove-replace]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.literal :as lib.schema.literal]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.time :as shared.ut]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(defn- is-ref-for-column? [expr column]
  (and (lib.util/clause-of-type? expr :field)
       (lib.equality/find-matching-column expr [column])))

(mu/defn ^:private remove-existing-filters-against-column :- ::lib.schema/query
  "Remove any existing filters clauses that use `column` as the first arg in a stage of a `query`."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- ::lib.schema.metadata/column]
  (reduce
   (fn [query [_tag _opts expr :as filter-clause]]
     (if (is-ref-for-column? expr column)
       (lib.remove-replace/remove-clause query stage-number filter-clause)
       query))
   query
   (lib.filter/filters query stage-number)))

(mu/defn update-numeric-filter :- ::lib.schema/query
  "Add or update a filter against `numeric-column`. Adapted from
  https://github.com/metabase/metabase/blob/98bcd7fc3102bd7c07e8b68878c3738f3cb8727b/frontend/src/metabase-lib/queries/utils/actions.js#L151-L154"
  ([query numeric-column start end]
   (update-numeric-filter query -1 numeric-column start end))

  ([query          :- ::lib.schema/query
    stage-number   :- :int
    numeric-column :- ::lib.schema.metadata/column
    start          :- number?
    end            :- number?]
   (let [[start end] (sort [start end])]
     (-> query
         (remove-existing-filters-against-column stage-number numeric-column)
         (lib.filter/filter stage-number (lib.filter/between numeric-column start end))))))

;;; points in this case correspond to the number of rows returned by a query if there are no gaps. E.g. if we have a
;;; query like
;;;
;;;    orders, count aggregation, broken out by month(created_at) between 2024-01 and 2024-03 (inclusive)
;;;
;;; we would have at most 3 rows returned -- the value for 2024-01, the value for 2024-02, and the value for 2024-03.
;;; If no rows have a created_at in that month, then those rows may not get returned. However, the FE should
;;; interpolate the missing values and still include points with values of zero; that's what we mean when we
;;; say "points" below.
(def ^:private temporal-filter-min-num-points
  "Minimum number of points an updated query should return; if it will return less than this, switch to
  the [[unit->next-unit]]. E.g. if we zoom in on a query using unit is `:day` and the zoomed in query would
  only return 2 points, switch the unit to `:minute`."
  4)

(def ^:private unit->next-unit
  "E.g. the next unit after `:hour` is `:minute`."
  (let [units [:minute :hour :day :week :month :quarter :year]]
    (zipmap units (cons nil units))))

(mu/defn ^:private temporal-filter-find-best-breakout-unit :- ::lib.schema.temporal-bucketing/unit.date-time.truncate
  "If the current breakout `unit` will not return at least [[temporal-filter-min-num-points]], find the largest unit
  that will."
  [unit  :- ::lib.schema.temporal-bucketing/unit.date-time.truncate
   start :- ::lib.schema.literal/temporal
   end   :- ::lib.schema.literal/temporal]
  (loop [unit unit]
    (let [num-points      (shared.ut/unit-diff unit start end)
          too-few-points? (< num-points temporal-filter-min-num-points)]
      (if-let [next-largest-unit (when too-few-points?
                                   (unit->next-unit unit))]
        (recur next-largest-unit)
        unit))))

(mu/defn ^:private temporal-filter-update-breakouts :- ::lib.schema/query
  "Update the first breakout against `column` so it uses `new-unit` rather than the original unit (if any); remove all
  other breakouts against that column."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- ::lib.schema.metadata/column
   new-unit     :- ::lib.schema.temporal-bucketing/unit.date-time.truncate]
  (transduce
   identity
   (fn
     ([{:keys [query]}]
      query)
     ([{:keys [query has-seen-column?], :as m} breakout]
      (if (is-ref-for-column? breakout column)
        (let [query' (if has-seen-column?
                       ;; already seen a breakout for this column: remove other breakouts.
                       (lib.remove-replace/remove-clause query stage-number breakout)
                       ;; this is the first breakout we've seen for this column: replace it with one that uses
                       ;; `new-unit`.
                       (let [col-ref (lib.ref/ref (lib.temporal-bucket/with-temporal-bucket column new-unit))]
                         (lib.remove-replace/replace-clause query stage-number breakout col-ref)))]
          {:query query', :has-seen-column? true})
        ;; not a breakout against `column`: ignore it
        m)))
   {:query query, :has-seen-column? false}
   (lib.breakout/breakouts query stage-number)))

;;; just for [[update-temporal-filter]], we will also support plain JavaScript `Date`s and moment.js Moments. We
;;; should probably do this more generally, since `::lib.schema.literal/temporal` accepts `java.time` instances in
;;; JVM... this is experimental for now to see if this works without too much trouble, we can generalize this more in
;;; the future if it works nicely.
(mr/def ::temporal-literal
  #?(:clj
     ::lib.schema.literal/temporal

     :cljs
     [:or
      ::lib.schema.literal/temporal
      [:fn
       {:error/message "Instance of a JS Date"}
       #(instance? js/Date %)]]))

(mu/defn update-temporal-filter :- ::lib.schema/query
  "Add or update a filter against `temporal-column`. Modify the temporal unit for any breakouts. For use powering the
  brush zoom-in in timeseries visualizations.

  This is adapted from old MLv1 code here
  https://github.com/metabase/metabase/blob/98bcd7fc3102bd7c07e8b68878c3738f3cb8727b/frontend/src/metabase-lib/queries/utils/actions.js#L75-L132"
  ([query temporal-column start end]
   (update-temporal-filter query -1 temporal-column start end))

  ([query           :- ::lib.schema/query
    stage-number    :- :int
    temporal-column :- ::lib.schema.metadata/column
    start           :- ::temporal-literal
    end             :- ::temporal-literal]
   (let [query        (remove-existing-filters-against-column query stage-number temporal-column)
         unit         (lib.temporal-bucket/raw-temporal-bucket temporal-column)
         ;; convert start and end to plain strings if they are JavaScript Date instances. The truncation stuff will
         ;; work better because the ISO-8601 Strings let us differentiate between Dates/DateTimes/Times better than
         ;; raw Date does. Also, the FE won't have to worry about converting it later
         maybe-string #?(:clj identity
                         :cljs (fn [t]
                                 (cond-> t
                                   (not (string? t))
                                   (shared.ut/format-for-base-type ((some-fn :effective-type :base-type) temporal-column)))))
         start        (maybe-string start)
         end          (maybe-string end)]
     (if-not unit
       ;; Temporal column is not bucketed: we don't need to update any temporal units here. Add/update a `:between`
       ;; filter.
       (lib.filter/filter query stage-number (lib.filter/between temporal-column start end))
       ;; temporal-column IS bucketed: need to update the breakout(s) against this column.
       (let [;; clamp range to unit to ensure we select exactly what's represented by the dots/bars. E.g. if I draw my
             ;; filter from `2024-01-02` to `2024-03-05` and the unit is `:month`, we should only show the months
             ;; between those two values, i.e. only `2024-02` and `2024-03`.
             start         (shared.ut/truncate (shared.ut/add start unit 1) unit)
             end           (shared.ut/truncate end unit)
             ;; update the breakout unit if appropriate.
             breakout-unit (temporal-filter-find-best-breakout-unit unit start end)
             query         (if (= unit breakout-unit)
                             query
                             (temporal-filter-update-breakouts query stage-number temporal-column breakout-unit))]
         ;; TODO: This "same unit or multiple units" logic exists in `shared.ut` somewhere; reuse it here.
         (if (= (str start) (str end))
           ;; is the start and end are the same (in whatever the original unit was) then just do an "="
           (lib.filter/filter query stage-number (lib.filter/= temporal-column start))
           ;; otherwise do a between (which is inclusive)
           (lib.filter/filter query stage-number (lib.filter/between temporal-column start end))))))))

(mr/def ::lat-lon.bounds
  [:map
   [:north number?]
   [:east  number?]
   [:south number?]
   [:west  number?]])

(mu/defn update-lat-lon-filter :- ::lib.schema/query
  "For use powering the brush zoom-in behavior in map visualizations. Adapted from
  https://github.com/metabase/metabase/blob/98bcd7fc3102bd7c07e8b68878c3738f3cb8727b/frontend/src/metabase-lib/queries/utils/actions.js#L134-L149"
  ([query latitude-column longitude-column bounds]
   (update-lat-lon-filter query -1 latitude-column longitude-column bounds))

  ([query                                        :- ::lib.schema/query
    stage-number                                 :- :int
    latitude-column                              :- ::lib.schema.metadata/column
    longitude-column                             :- :some
    {:keys [north east south west], :as _bounds} :- [:ref ::lat-lon.bounds]]
   (-> query
       (remove-existing-filters-against-column stage-number latitude-column)
       (remove-existing-filters-against-column stage-number longitude-column)
       (lib.filter/filter stage-number (let [[lat-min lat-max] (sort [north south])
                                             [lon-min lon-max] (sort [east west])]
                                         (lib.filter/inside latitude-column longitude-column lat-max lon-min lat-min lon-max))))))

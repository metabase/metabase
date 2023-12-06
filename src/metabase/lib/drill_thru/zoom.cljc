(ns metabase.lib.drill-thru.zoom
  "A `:zoom` drill is a 'View details' drill when you click on the value of a PK column in a Table that has EXACTLY ONE
  PK column. In MLv2, it is a no-op; in the frontend it changes the URL to take you to the 'object details' view for
  the row in question. For Tables with multiple PK columns, a [[metabase.lib.drill-thru.pk]] drill is returned
  instead.

  We will only possibly return one of the 'object details'
  drills ([[metabase.lib.drill-thru.pk]], [[metabase.lib.drill-thru.fk-details]],
  or [[metabase.lib.drill-thru.zoom]]); see [[metabase.lib.drill-thru.object-details]] for the high-level logic that
  calls out to the individual implementations."
  (:require
   [medley.core :as m]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]))

(defn- zoom-drill* [column value]
  {:lib/type  :metabase.lib.drill-thru/drill-thru
   :type      :drill-thru/zoom
   :column    column
   :object-id value
   :many-pks? false})

(mu/defn zoom-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.zoom]
  "Return a `:zoom` drill when clicking on the value of a PK column in a Table that has only one PK column."
  [query                                   :- ::lib.schema/query
   _stage-number                           :- :int
   {:keys [column value row] :as _context} :- ::lib.schema.drill-thru/context]

  (when (and
         ;; ignore clicks on headers (value = nil rather than :null)
         (some? value)
         ;; if this table has more than one PK we should be returning a [[metabase.lib.drill-thru.pk]] instead.
         (not (lib.drill-thru.common/many-pks? query)))
    (if (lib.types.isa/primary-key? column)
      ;; PK column was clicked. Ignore NULL values.
      (when-not (= value :null)
        (zoom-drill* column value))
      ;; some other column was clicked. Find the PK column and create a filter for its value.
      (let [[pk-column] (lib.metadata.calculation/primary-keys query)]
        (when-let [pk-value (->> row
                                 (m/find-first #(-> % :column :name (= (:name pk-column))))
                                 :value)]
          (zoom-drill* pk-column pk-value))))))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/zoom
  [_query _stage-number drill-thru]
  (select-keys drill-thru [:many-pks? :object-id :type]))

(mu/defmethod lib.drill-thru.common/drill-thru-method :drill-thru/zoom :- ::lib.schema/query
  [query         :- ::lib.schema/query
   _stage-number :- :int
   _drill        :- ::lib.schema.drill-thru/drill-thru.zoom]
  ;; this is just an identity transformation, see
  ;; https://metaboat.slack.com/archives/C04CYTEL9N2/p1693965932617369
  query)

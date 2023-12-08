(ns metabase.lib.drill-thru.pk
  "A `:pk` drill is a 'View details' (AKA object details) drill that adds filter(s) for the value(s) of a PK(s). It is
  only presented for Tables that have multiple PKs; for Tables with a single PK you'd instead
  see [[metabase.lib.drill-thru.zoom]].

  We will only possibly return one of the 'object details'
  drills ([[metabase.lib.drill-thru.pk]], [[metabase.lib.drill-thru.fk-details]],
  or [[metabase.lib.drill-thru.zoom]]); see [[metabase.lib.drill-thru.object-details]] for the high-level logic that
  calls out to the individual implementations."
  (:require
   [medley.core :as m]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]))

(mu/defn pk-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.pk]
  "'View details' drill when you click on a value in a table that has MULTIPLE PKs. There are two subtypes of PK
  drills:

  1) if you click on a PK column value, then we return a drill that will add a filter for that PK column/value

  2) if you click a non-PK column value, then we return a drill that will add filters for the PK columns/values in the
     row. This is never returned for FK columns; we return [[metabase.lib.drill-thru.fk-details]] drills instead."
  [query                                   :- ::lib.schema/query
   stage-number                            :- :int
   {:keys [column value row] :as _context} :- ::lib.schema.drill-thru/context]
  (when (and
         ;; ignore column header clicks (value = nil). NULL values (value = :null) are ok if this is a click on a
         ;; non-PK column.
         (some? value)
         (lib.drill-thru.common/mbql-stage? query stage-number)
         ;; `:pk` drills are only for Tables with multiple PKs. For Tables with one PK, we do
         ;; a [[metabase.lib.drill-thru.zoom]] drill instead.
         (lib.drill-thru.common/many-pks? query)
         ;; if this is an FK column we should return an [[metabase.lib.drill-thru.fk-details]] drill instead.
         (not (lib.types.isa/foreign-key? column)))
    (if (lib.types.isa/primary-key? column)
      ;; 1) we clicked on a PK column: return a drill thru for that PK column + value. Ignore `nil` values.
      (when (and (some? value)
                 (not= value :null))
        {:lib/type   :metabase.lib.drill-thru/drill-thru
         :type       :drill-thru/pk
         :dimensions [{:column column
                       :value  value}]})
      ;; 2) we clicked on a non-PK column: return a drill for ALL of the PK columns + values. Ignore any
      ;;   `nil` (`:null`) values.
      (let [pk-columns (lib.metadata.calculation/primary-keys query)
            dimensions (for [pk-column pk-columns
                             :let      [value (->> row
                                                   (m/find-first #(-> % :column :name (= (:name pk-column))))
                                                   :value)]
                             ;; ignore any PKs that don't have a value in this row.
                             :when     value]
                         {:column pk-column, :value value})]
        (when (seq dimensions)
          {:lib/type   :metabase.lib.drill-thru/drill-thru
           :type       :drill-thru/pk
           ;; return the dimensions sorted by column ID so the return value is determinate.
           :dimensions (vec (sort-by #(get-in % [:column :id]) dimensions))})))))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/pk
  [_query _stage-number drill-thru]
  (select-keys drill-thru [:type :dimensions]))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/pk
  [query stage-number {:keys [dimensions], :as _pk-drill}]
  (reduce
   (fn [query {:keys [column value], :as _dimension}]
     (lib.filter/filter query stage-number (lib.filter/= column value)))
   query
   dimensions))

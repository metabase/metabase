(ns metabase.lib.drill-thru.sort
  (:require
   [medley.core :as m]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.remove-replace :as lib.remove-replace]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.schema.order-by :as lib.schema.order-by]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]))

(defn- orderable-column?
  "Is `column` orderable? (Does it appear in [[lib.order-by/orderable-columns]]?)"
  [query stage-number column]
  (lib.equality/find-matching-column query
                                     stage-number
                                     (lib.ref/ref column)
                                     (lib.order-by/orderable-columns query stage-number)))

(mu/defn ^:private existing-order-by-clause :- [:maybe ::lib.schema.order-by/order-by]
  [query stage-number column]
  (m/find-first (fn [[_direction _opts expr, :as _asc-or-desc-clause]]
                  (lib.equality/find-matching-column query stage-number expr [column]))
                (lib.order-by/order-bys query stage-number)))

(mu/defn ^:private existing-order-by-direction :- [:maybe ::lib.schema.order-by/direction]
  [query stage-number column]
  (when-let [[direction _opts _expr] (existing-order-by-clause query stage-number column)]
    direction))

(mu/defn sort-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.sort]
  "Sorting on a clicked column."
  [query                                :- ::lib.schema/query
   stage-number                         :- :int
   {:keys [column value], :as _context} :- ::lib.schema.drill-thru/context]
  ;; if we have a context with a `:column`, but no `:value`...
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (nil? value)
             (not (lib.types.isa/structured? column)))
    ;; ...and the column is orderable, we can return a sort drill-thru.
    (when (orderable-column? query stage-number column)
      ;; check and see if there is already a sort on this column. If there is, we should only suggest flipping the
      ;; direction to the opposite of what it is now. If there is no existing sort, then return both directions as
      ;; options.
      (let [existing-direction (existing-order-by-direction query stage-number column)]
        {:lib/type        :metabase.lib.drill-thru/drill-thru
         :type            :drill-thru/sort
         :column          column
         :sort-directions (case existing-direction
                            :asc  [:desc]
                            :desc [:asc]
                            [:asc :desc])}))))

(mu/defmethod lib.drill-thru.common/drill-thru-method :drill-thru/sort
  ([query stage-number drill]
   (lib.drill-thru.common/drill-thru-method query stage-number drill :asc))

  ([query                        :- ::lib.schema/query
    stage-number                 :- :int
    {:keys [column], :as _drill} :- ::lib.schema.drill-thru/drill-thru.sort
    direction                    :- ::lib.schema.order-by/direction]
   ;; if you have an existing order by, the drill thru returned by [[sort-drill]] would only be one that would suggest
   ;; changing it to the opposite direction, so we can safely assume we want to change the direction and
   ;; use [[lib.order-by/change-direction]] here.
   (if-let [existing-clause (existing-order-by-clause query stage-number column)]
     (lib.remove-replace/replace-clause query existing-clause (lib.order-by/order-by-clause column (keyword direction)))
     (lib.order-by/order-by query stage-number column (keyword direction)))))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/sort
  [_query _stage-number {directions :sort-directions}]
  {:type       :drill-thru/sort
   :directions directions})

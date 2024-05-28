(ns metabase.lib.drill-thru.object-details
  (:require
   [metabase.lib.drill-thru.fk-details :as lib.drill-thru.fk-details]
   [metabase.lib.drill-thru.pk :as lib.drill-thru.pk]
   [metabase.lib.drill-thru.zoom :as lib.drill-thru.zoom]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.util.malli :as mu]))

(mu/defn object-detail-drill :- [:maybe [:or
                                         ::lib.schema.drill-thru/drill-thru.pk
                                         ::lib.schema.drill-thru/drill-thru.zoom
                                         ::lib.schema.drill-thru/drill-thru.fk-details]]
  "When clicking a foreign key or primary key value, drill through to the details for that specific object.

  Contrast [[metabase.lib.drill-thru.fk-filter/fk-filter-drill]], which filters this query to only those rows with a
  specific value for a FK column."
  [query        :- ::lib.schema/query
   stage-number :- :int
   context      :- ::lib.schema.drill-thru/context]
  (some (fn [f]
          (f query stage-number context))
        [lib.drill-thru.fk-details/fk-details-drill
         lib.drill-thru.pk/pk-drill
         lib.drill-thru.zoom/zoom-drill]))

(ns metabase.lib.drill-thru.fk-details
  "An FK details drill is one where you click a foreign key value in a table view e.g. ORDERS.USER_ID and choose the
  'View details' option, then it shows you the PEOPLE record in question (e.g. Person 5 if USER_ID was 5).

  We will only possibly return one of the 'object details'
  drills ([[metabase.lib.drill-thru.pk]], [[metabase.lib.drill-thru.fk-details]],
  or [[metabase.lib.drill-thru.zoom]]); see [[metabase.lib.drill-thru.object-details]] for the high-level logic that
  calls out to the individual implementations."
  (:require
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]))

(mu/defn fk-details-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.fk-details]
  "Return an `:fk-details` 'View details' drill when clicking on the value of a FK column."
  [query                               :- ::lib.schema/query
   _stage-number                       :- :int
   {:keys [column value] :as _context} :- ::lib.schema.drill-thru/context]
  (when (and (lib.types.isa/foreign-key? column)
             (some? value)
             (not= value :null))
    {:lib/type  :metabase.lib.drill-thru/drill-thru
     :type      :drill-thru/fk-details
     :column    column
     :object-id value
     :many-pks? (lib.drill-thru.common/many-pks? query)}))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/fk-details
  [_query _stage-number drill-thru]
  (select-keys drill-thru [:many-pks? :object-id :type]))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/fk-details
  [query stage-number {:keys [column object-id]} & _]
  ;; generate a NEW query against the FK target table and column, e.g. if the original query was
  ;; ORDERS/ORDERS.USER_ID, the new query should by PEOPLE/PEOPLE.ID.
  (let [fk-column-id    (:fk-target-field-id column)
        fk-column       (some->> fk-column-id (lib.metadata/field query))
        fk-column-table (some->> (:table-id fk-column) (lib.metadata/table query))]
    (-> (lib.query/query query fk-column-table)
        (lib.filter/filter stage-number (lib.filter/= fk-column object-id)))))

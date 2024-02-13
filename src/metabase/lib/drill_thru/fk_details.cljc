(ns metabase.lib.drill-thru.fk-details
  "An FK details drill is one where you click a foreign key value in a table view e.g. ORDERS.USER_ID and choose the
  'View details' option, then it shows you the PEOPLE record in question (e.g. Person 5 if USER_ID was 5).

  [[metabase.lib.drill-thru.object-details/object-detail-drill]] has the logic for determining whether to return this
  drill as an option or not."
  (:require
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]))

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

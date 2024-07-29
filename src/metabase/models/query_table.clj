(ns metabase.models.query-table
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/QueryTable [_model] :query_table)

(doto :model/QueryField
  (derive :metabase/model))

;;; Updating QueryTable from card

(defn update-query-tables-for-card!
  "Clears QueryTables associated with this card and creates fresh, up-to-date-ones.

  Returns `nil` (and logs the error) if there was a parse error."
  [card-id query-table-rows]
  (t2/with-transaction [_conn]
    (t2/delete! :model/QueryTable :card_id card-id)
    (t2/insert! :model/QueryTable query-table-rows)))

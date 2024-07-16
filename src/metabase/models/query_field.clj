(ns metabase.models.query-field
  (:require
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/QueryField [_model] :query_field)

(doto :model/QueryField
  (derive :metabase/model))

;;; Updating QueryField from card

(defn update-query-fields-for-card!
  "Clears QueryFields associated with this card and creates fresh, up-to-date-ones.

  Returns `nil` (and logs the error) if there was a parse error."
  [card-id query-field-rows]
  (t2/with-transaction [_conn]
    (let [existing            (t2/select :model/QueryField :card_id card-id)
          {:keys [to-update
                  to-create
                  to-delete]} (u/row-diff existing query-field-rows
                                          {:id-fn      :field_id
                                           :to-compare #(dissoc % :id :card_id :field_id)})]
      (when (seq to-delete)
        ;; this deletion seems to break transaction (implicit commit or something) on MySQL, and this `diff`
        ;; algo drops its frequency by a lot - which should help with transactions affecting each other a
        ;; lot. Parallel tests in `metabase.models.query.permissions-test` were breaking when delete was
        ;; executed unconditionally on every query change.
        (t2/delete! :model/QueryField :card_id card-id :field_id [:in (map :field_id to-delete)]))
      (when (seq to-create)
        (t2/insert! :model/QueryField to-create))
      (doseq [item to-update]
        (t2/update! :model/QueryField {:card_id card-id :field_id (:field_id item)}
                    (select-keys item [:explicit_reference]))))))

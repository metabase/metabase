(ns metabase.models.query-field
  (:require
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/QueryField [_model] :query_field)

(doto :model/QueryField
  (derive :metabase/model))

(def ^:private reference-error-joins
  [[(t2/table-name :model/QueryField) :qf]
   [:and
    [:= :qf.card_id :c.id]
    [:= :qf.explicit_reference true]]

   [(t2/table-name :model/Field) :f]
   [:and
    [:= :qf.field_id :f.id]
    [:= :f.active false]]])

(defn cards-with-reference-errors
  "Given some HoneySQL query map with :model/Card bound as :c, restrict this query to only return cards
  with invalid references.
  For now this only handles inactive references, but in future it will also handle unknown references too."
  [card-query-map]
  ;; NOTE: We anticipate a schema change to support missing references that will result in left-joins and
  ;; where clauses being appended as well.
  (update card-query-map :join concat reference-error-joins))

(defn reference-errors
  "Given a seq of cards, return a map of card-id => reference errors"
  [cards]
  (when (seq cards)
    (->> (t2/select :model/QueryField
                    {:select [:qf.card_id
                              [:f.name :field]
                              [:t.name :table]
                              [:t.active :table_active]]
                     :from   [[(t2/table-name :model/QueryField) :qf]]
                     :join   [[(t2/table-name :model/Field) :f] [:= :f.id :qf.field_id]
                              [(t2/table-name :model/Table) :t] [:= :t.id :f.table_id]]
                     :where  [:and
                              [:= :qf.explicit_reference true]
                              [:= :f.active false]
                              [:in :card_id (map :id cards)]]})
         (map (fn [{:keys [card_id table field table_active]}]
                [card_id {:type  (if table_active
                                   :inactive-field
                                   :inactive-table)
                          :table table
                          :field field}]))
         (reduce (fn [acc [id error]]
                   (update acc id u/conjv error))
                 {}))))

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

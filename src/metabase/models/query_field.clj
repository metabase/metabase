(ns metabase.models.query-field
  (:require
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/QueryField [_model] :query_field)

(doto :model/QueryField
  (derive :metabase/model))

(defn- coerce-boolean [x]
  (if (= 0 x) false x))

(defn- coerce-booleans [m]
  (update-vals m coerce-boolean))

(defn cards-with-reference-errors
  "Given some HoneySQL query map with :model/Card bound as :c, restrict this query to only return cards
  with invalid references."
  [card-query-map]
  (-> card-query-map
      (update :join concat
              [[(t2/table-name :model/QueryField) :qf]
               [:and
                [:= :qf.card_id :c.id]
                [:= :qf.explicit_reference true]]])
      (update :left-join concat
              [[(t2/table-name :model/Field) :f]
               [:= :qf.field_id :f.id]])
      (update :where
              (fn [existing-where]
                [:and
                 existing-where
                 [:or
                  [:= :f.id nil]
                  [:= :f.active false]]]))))

(defn reference-errors
  "Given a seq of cards, return a map of card-id => reference errors"
  [cards]
  (when (seq cards)
    (->> (t2/query {:select    [:qf.card_id
                                [:qf.column :field]
                                [:qf.table :table]
                                [[:= :t.id nil] :table_unknown]
                                [[:= :f.id nil] :field_unknown]
                                [[:not [:coalesce :t.active true]] :table_inactive]
                                [[:not [:coalesce :f.active true]] :field_inactive]]
                    :from      [[(t2/table-name :model/QueryField) :qf]]
                    :left-join [[(t2/table-name :model/Field) :f] [:= :f.id :qf.field_id]
                                [(t2/table-name :model/Table) :t] [:= :t.id :qf.table_id]]
                    :where     [:and
                                [:= :qf.explicit_reference true]
                                [:or
                                 [:= :t.id nil]
                                 [:= :f.id nil]
                                 [:= :t.active false]
                                 [:= :f.active false]]
                                [:in :card_id (map :id cards)]]
                    :order-by  [:qf.card_id :table :field]})
         (map coerce-booleans)
         (map (fn [{:keys [card_id table field
                           table_unknown
                           field_unknown
                           table_inactive
                           field_inactive]}]
                [card_id (merge
                          {:type  (cond
                                    ;; TODO swap around naming?
                                    table_unknown  :unknown-table
                                    table_inactive :inactive-table
                                    field_unknown  :unknown-field
                                    field_inactive :inactive-field
                                    ;; This shouldn't be reachable
                                    :else          :unknown-error)
                           :table table}
                          (when (not (or table_unknown table_inactive))
                            {:field field}))]))
         #_(t2/query {:select    [:dt.card_id
                                [:qt.table :table]
                                [[:= :t.id nil] :table_unknown]
                                [[:not [:coalesce :t.active true]] :table_inactive]]
                    :from      [[(t2/table-name :model/QueryField) :qf]]
                    :left-join [[(t2/table-name :model/Table) :t] [:= :t.id :qt.table_id]]
                    :where     [:and
                                [:or
                                 [:= :t.id nil]
                                 [:= :t.active false]]
                                [:in :card_id (map :id cards)]]
                    :order-by  [:qt.card_id :table :field]})
         distinct
         (reduce (fn [acc [id error]]
                   (update acc id u/conjv error))
                 {}))))

;;; Updating QueryField from card

(defn update-query-fields-for-card!
  "Clears QueryFields associated with this card and creates fresh, up-to-date-ones.

  Returns `nil` (and logs the error) if there was a parse error."
  [card-id query-field-rows]
  (t2/with-transaction [_conn]
    (t2/delete! :model/QueryField :card_id card-id)
    (t2/insert! :model/QueryField query-field-rows)))

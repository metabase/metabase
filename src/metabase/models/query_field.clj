(ns metabase.models.query-field
  (:require
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/QueryField [_model] :query_field)

(doto :model/QueryField
  (derive :metabase/model))

(defn- coerce-boolean [x]
  (cond
    (= 0 x) false
    (= 0M x) false
    :else x))

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
    (->> (t2/select :model/QueryField
                    {:select    [:qf.card_id
                                 [:qf.column :field]
                                 [:qf.table :table]
                                 [[:= :f.id nil] :field_unknown]
                                 [[:coalesce :t.active false] :table_active]]
                     :from      [[(t2/table-name :model/QueryField) :qf]]
                     :left-join [[(t2/table-name :model/Field) :f] [:= :f.id :qf.field_id]
                                 [(t2/table-name :model/Table) :t] [:= :t.id :f.table_id]]
                     :where     [:and
                                 [:= :qf.explicit_reference true]
                                 [:or
                                  [:= :f.id nil]
                                  [:= :f.active false]]
                                 [:in :card_id (map :id cards)]]
                     :order-by  [:qf.card_id :field :table]})
         (map coerce-booleans)
         (map (fn [{:keys [card_id table field field_unknown table_active]}]
                [card_id {:type  (cond
                                   field_unknown :unknown-field
                                   table_active  :inactive-field
                                   :else         :inactive-table)
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
    (t2/delete! :model/QueryField :card_id card-id)
    (t2/insert! :model/QueryField query-field-rows)

    ;; let's wait and see if we get flakes again.
    ;; the following diff algorithm broke once we could no longer depend on :field_id being non-null

    #_(let [existing            (t2/select :model/QueryField :card_id card-id)
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

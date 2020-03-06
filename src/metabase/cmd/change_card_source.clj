(ns metabase.cmd.change-card-source
  (:require [clojure.walk :as walk]
            [metabase.models
             [card :as card]
             [field :as field]]
            [toucan.db :as tdb]))

(defn add-field-mapping
  "Given a user mapping of old/new table and database, plus field names,
  finds field ids to be remapped"
  [{:keys [table] :as user-mapping}]
  (let [old-fields (tdb/select field/Field :table_id (:old table))
        new-fields (group-by :name (tdb/select field/Field :table_id (:new table)))]
    (reduce (fn [field-map old-field]
              (let [new-field-name (get-in user-mapping [:fields (:name old-field)])]
                (assoc-in field-map
                          [:fields (:id old-field)]
                          (or (:id (first (get new-fields new-field-name)))
                              (:id old-field)))))
            user-mapping
            old-fields)))

(defn remap-card
  "Updates table_id, database_id, and field_ids in card"
  [mapping original-card]
  (let [db-id         (:new (:database mapping))
        table-id      (:new (:table mapping))]
    (-> original-card
        (assoc :table_id    table-id
               :database_id db-id)
        (assoc-in [:dataset_query :database] db-id)
        (assoc-in [:dataset_query :query :source-table] table-id)
        (update-in [:dataset_query :query]
                   (fn [query]
                     (walk/postwalk (fn [x]
                                      (if (and (vector? x)
                                               (= :field-id (first x)))
                                        (update x 1 (fn [old-field-id]
                                                      (get-in mapping [:fields old-field-id])))
                                        x))
                                    query))))))

(defn remap-cards
  "Finds all relevant cards, remaps them

  Example mapping:

  {:table    {:old 1572
            :new 1586}
  :database {:old 1429
            :new 1430}
  :fields   {\"ts\"               \"created_at\"
             \"dislikes_comment\" \"dislikes_comments\"}}
  "
  [mapping]
  (let [original-cards (tdb/select card/Card :table_id (:old (:table mapping)))
        full-mapping   (add-field-mapping mapping)]
    (map #(remap-card full-mapping %) original-cards)))

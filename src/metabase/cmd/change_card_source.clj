(ns metabase.cmd.change-card-source
  (:require [clojure.walk :as walk]
            [toucan.db :as tdb]
            [metabase.models.card :as card]
            [metabase.models.field :as field]))

(defn build-mapping
  "Given a user mapping of old/new table and database, plus field names,
  finds field ids to be remapped"
  [{:keys [table] :as user-mapping}]
  (let [old-fields (tdb/select field/Field :table_id (:old table))
        new-fields (group-by :name (tdb/select field/Field :table_id (:new table)))]

    (reduce (fn [field-map old-field]
              (let [new-field-name (get-in user-mapping [:fields (:name old-field)] (:name old-field))]
                (assoc-in field-map [:fields (:id old-field)] (:id (first (get new-fields new-field-name))))))
            user-mapping
            old-fields)))

(defn remap-card
  "Updates table_id, database_id, and field_ids in card"
  [mapping card-id]
  (let [original-card (tdb/select-one card/Card :id card-id)
        db-id         (:new (:database mapping))
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


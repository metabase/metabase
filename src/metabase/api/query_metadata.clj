(ns metabase.api.query-metadata
  (:require
   [clojure.set :as set]
   [metabase.api.database :as api.database]
   [metabase.api.field :as api.field]
   [metabase.api.table :as api.table]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- fields->fk-target-field-ids
  [fields]
  (->> fields
       (filter #(:fk_target_field_id %))
       (map :fk_target_field_id)))

(defn- field-ids->table-ids
  [field-ids]
  (if (seq field-ids)
    (t2/select-fn-set :table_id :model/Field :id [:in field-ids])
    []))

(defn batch-fetch-query-metadata
  [queries]
  (let [source-ids (->> (mapcat #(lib.util/collect-source-tables (:query %)) queries)
                        (distinct))
        source-table-ids (remove lib.util/legacy-string-table-id->card-id source-ids)
        source-card-ids (keep lib.util/legacy-string-table-id->card-id source-ids)
        source-tables (concat (api.table/batch-fetch-table-query-metadatas source-table-ids)
                              (api.table/batch-fetch-card-query-metadatas source-card-ids))
        fk-target-field-ids (->> (fields->fk-target-field-ids (mapcat :fields source-tables))
                                 (distinct))
        fk-target-table-ids (set/difference (set (field-ids->table-ids fk-target-field-ids))
                                            (set source-table-ids))
        fk-target-tables (api.table/batch-fetch-table-query-metadatas fk-target-table-ids)
        tables (concat source-tables fk-target-tables)]
    {:databases [] :tables tables :fields []}))

(defn batch-fetch-card-metadata
  [cards]
  (let [queries (concat (map :dataset_query cards)
                        (->> (filter #(= (:type %) :model) cards)
                             (map (fn [card] {:source-table (str "card__" (u/the-id card))}))))]
    (batch-fetch-query-metadata [queries])))

(defn batch-fetch-dashboard-metadata
  [dashboard]
  (let [dashcards (:dashcards dashboard)
        cards (->> (for [{:keys [card series]} dashcards
                          :let [all (conj series card)]
                          card all]
                     card)
                   (filter :dataset_query))]
    (batch-fetch-card-metadata cards)))

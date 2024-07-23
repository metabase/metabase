(ns metabase.api.query-metadata
  (:require
   [metabase.api.database :as api.database]
   [metabase.api.table :as api.table]
   [metabase.lib.util :as lib.util]
   [metabase.model.interface :as mi]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- xform-fields->fk-target-field-ids
  [fields]
  (into #{} (keep :fk_target_field_id) fields))

(defn- field-ids->table-ids
  [field-ids]
  (if (seq field-ids)
    (t2/select-fn-set :table_id :model/Field :id [:in field-ids])
    #{}))

(defn- split-tables-and-legacy-card-refs [source-ids]
  (-> (reduce (fn [m src]
                (if-let [card-id (lib.util/legacy-string-table-id->card-id src)]
                  (update m :cards conj! card-id)
                  (update m :tables conj! src)))
              {:cards  (transient #{})
               :tables (transient #{})}
              source-ids)
      (update-vals persistent!)))

(defn batch-fetch-query-metadata
  "Fetch dependent metadata for ad-hoc queries."
  [queries]
  (let [source-ids                (into #{} (mapcat #(lib.util/collect-source-tables (:query %)))
                                        queries)
        {source-table-ids :tables
         source-card-ids  :cards} (split-tables-and-legacy-card-refs source-ids)
        source-tables             (concat (api.table/batch-fetch-table-query-metadatas source-table-ids)
                                          (api.table/batch-fetch-card-query-metadatas source-card-ids))
        fk-target-field-ids       (into #{} (comp (mapcat :fields)
                                                  xform-fields->fk-target-field-ids)
                                        source-tables)
        fk-target-table-ids       (into #{} (remove source-table-ids)
                                        (field-ids->table-ids fk-target-field-ids))
        fk-target-tables          (api.table/batch-fetch-table-query-metadatas fk-target-table-ids)
        tables                    (concat source-tables fk-target-tables)]
    {;; TODO: This is naive and issues multiple queries currently. That's probably okay for most dashboards,
     ;; since they tend to query only a handful of databases at most.
     :databases (for [id (into #{} (map :db_id) tables)]
                  (api.database/get-database id {}))
     :tables    tables
     :fields    []}))

(defn batch-fetch-card-metadata
  "Fetch dependent metadata for cards."
  [cards]
  (let [queries (concat (map :dataset_query cards)
                        (->> (filter #(= (:type %) :model) cards)
                             (map (fn [card] {:query {:source-table (str "card__" (u/the-id card))}}))))]
    (batch-fetch-query-metadata queries)))

(defn- click-behavior->link-details
  [{:keys [linkType type targetId] :as _click-behavior}]
  (when (= type "link")
    (when-let [link-type (case linkType
                           "question"  :card
                           "dashboard" :dashboard
                           nil)]
      {:type link-type
       :id   targetId})))

(defn- get-cards
  [ids]
  (when (seq ids)
    (let [cards (into [] (filter mi/can-read?)
                      (t2/select :model/Card :id [:in ids]))]
      (t2/hydrate cards :can_write))))

(defn- dashcard->click-behaviors [dashcard]
  (let [viz-settings        (:visualization_settings dashcard)
        top-click-behavior  (:click_behavior viz-settings)
        col-click-behaviors (keep (comp :click_behavior val)
                                  (:column_settings viz-settings))]
    (conj col-click-behaviors top-click-behavior)))

(defn- batch-fetch-linked-dashboards
  [dashboard-ids]
  (when (seq dashboard-ids)
    (let [dashboards (->> (t2/select :model/Dashboard :id [:in dashboard-ids])
                          (filter mi/can-read?))]
      (t2/hydrate dashboards
                  :can_write
                  :param_fields))))

(defn- batch-fetch-dashboard-links
  [dashcards]
  (let [links      (group-by :type
                             (into #{} (comp (mapcat dashcard->click-behaviors)
                                             (keep click-behavior->link-details))
                                   dashcards))
        link-cards (get-cards (into #{} (map :id) (:cards links)))
        dashboards (->> (:dashboard links)
                        (into #{} (map :id))
                        batch-fetch-linked-dashboards)]
    {:cards      link-cards
     :dashboards dashboards}))

(defn batch-fetch-dashboard-metadata
  "Fetch dependent metadata for dashboards."
  [dashboards]
  (let [dashcards (mapcat :dashcards dashboards)
        cards     (for [{:keys [card series]} dashcards
                        :let   [all (conj series card)]
                        card all
                        :when (:dataset_query card)]
                    card)
        link-cards ]
    (merge (batch-fetch-card-metadata cards)
           {:cards      []
            :dashboards []})))

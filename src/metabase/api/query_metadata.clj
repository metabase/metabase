(ns metabase.api.query-metadata
  (:require
    [metabase.api.database :as api.database]
    [metabase.api.field :as api.field]
    [metabase.api.table :as api.table]
    [metabase.lib.core :as lib]
    [metabase.lib.metadata.jvm :as lib.metadata.jvm]
    [metabase.lib.util :as lib.util]
    [metabase.util.log :as log]))

(defn- fetch-or-warn
  [{entity-type :type entity-id :id} f & f-args]
  (try
    (apply f entity-id f-args)
    (catch Exception e
      (log/warnf "Error in dashboard metadata %s %s: %s" entity-type entity-id (ex-message e)))))

(defn- metadata-for-dependents [dependents]
  {:tables (->> (:table dependents)
                ;; Can be int or "card__<id>"
                (sort-by (comp str :id))
                (into []
                      (keep #(fetch-or-warn
                               %
                               (fn [card-or-table-id]
                                 (if-let [card-id (lib.util/legacy-string-table-id->card-id card-or-table-id)]
                                   (api.table/fetch-card-query-metadata card-id)
                                   (api.table/fetch-table-query-metadata card-or-table-id {})))))))
   :databases (->> (:database dependents)
                   (sort-by :id)
                   (into []
                         (keep #(fetch-or-warn % api.database/get-database {}))))
   :fields (->> (:field dependents)
                (sort-by :id)
                (into []
                      (keep #(fetch-or-warn % api.field/get-field {}))))})

(defn- dependents-for-cards [cards]
  (let [database-ids (set (map :database_id cards))
        db->mp (into {} (map (juxt identity lib.metadata.jvm/application-database-metadata-provider)
                             database-ids))]
    (group-by :type (set (mapcat (fn [card]
                                   (let [database-id (:database_id card)
                                         mp (db->mp database-id)
                                         query (lib/query mp (:dataset_query card))]
                                     (lib/dependent-metadata query (:id card) (:type card)))) cards)))))

(defn dashboard-metadata
  "Fetches dependent query-metadata for a given dashboard"
  [dashboard]
  (let [dashcards (:dashcards dashboard)
        links (group-by :type (set (for [dashcard dashcards
                                         :let [top-click-behavior (get-in dashcard [:visualization_settings :click_behavior])
                                               col-click-behaviors (keep (comp :click_behavior val)
                                                                         (get-in dashcard [:visualization_settings :column_settings]))]
                                         {:keys [linkType type targetId]} (conj col-click-behaviors top-click-behavior)
                                         :when (and (= type "link")
                                                    (contains? #{"question" "dashboard"} linkType))]
                                     {:type (case linkType
                                              "question" :card
                                              "dashboard" :dashboard)
                                      :id targetId})))
        link-cards (->> (:card links)
                        (sort-by :id)
                        (into []
                              (keep #(fetch-or-warn % (requiring-resolve 'metabase.api.card/get-card)))))
        cards (->> (concat
                     (for [{:keys [card series]} dashcards
                           :let [all (conj series card)]
                           card all]
                       card)
                     link-cards)
                   (filter :dataset_query))
        dependents (dependents-for-cards cards)
        dashboard-specific {:cards link-cards
                            :dashboards (->> (:dashboard links)
                                             (sort-by :id)
                                             (into []
                                                   (keep #(fetch-or-warn % (requiring-resolve 'metabase.api.dashboard/get-dashboard)))))}]
    (merge (metadata-for-dependents dependents)
           dashboard-specific)))

(defn card-metadata
  "Fetches dependent query-metadata for a given card."
  [card]
  (metadata-for-dependents (dependents-for-cards [card])))

(ns metabase.api.query-metadata
  (:require
   [medley.core :as m]
   [metabase.api.database :as api.database]
   [metabase.api.field :as api.field]
   [metabase.api.table :as api.table]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.util :as lib.util]
   [metabase.models.card :as card]
   [metabase.models.collection.root :as collection.root]
   [metabase.models.interface :as mi]
   [metabase.models.revision.last-edit :as last-edit]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- fetch-or-warn
  [{entity-type :type entity-id :id} f & f-args]
  (try
    (apply f entity-id f-args)
    (catch Exception e
      (log/warnf "Error in dashboard metadata %s %s: %s" entity-type entity-id (ex-message e)))))

(defn- partition-table-ids
  [ids]
  {:card-ids  (keep lib.util/legacy-string-table-id->card-id ids)
   :table-ids (remove lib.util/legacy-string-table-id->card-id ids)})

(defn- metadata-for-table-dependents
  [table-dependents]
  (let [{:keys [card-ids table-ids]} (partition-table-ids (map :id table-dependents))
        card-metadatas (api.table/batch-fetch-card-query-metadatas card-ids)
        table-metadatas (api.table/batch-fetch-table-query-metadatas table-ids)
        all-metadatas (-> []
                          (into (sort-by :id table-metadatas))
                          (into (sort-by :id card-metadatas)))]
    (when (< (count all-metadatas) (count table-dependents))
      (log/warn "Some (possibly virtual) tables are not readable by the current user"))
    all-metadatas))

(defn- metadata-for-field-dependents
  [field-dependents]
  (let [metadatas (api.field/get-fields (map :id field-dependents))]
    (when (< (count metadatas) (count field-dependents))
      (log/warn "Some fields are not readable by the current user"))
    (vec (sort-by :id metadatas))))

(defn- metadata-for-dependents [dependents]
  {:tables (->> (:table dependents)
                ;; Can be int or "card__<id>"
                metadata-for-table-dependents)
   :databases (->> (:database dependents)
                   (sort-by :id)
                   (into []
                         (keep #(fetch-or-warn % api.database/get-database {}))))
   :fields (->> (:field dependents)
                metadata-for-field-dependents)})

(defn- collect-source-tables
  [query]
  (let [from-joins (mapcat collect-source-tables (:joins query))]
    (if-let [source-query (:source-query query)]
      (concat (collect-source-tables source-query) from-joins)
      (cond->> from-joins
        (:source-table query) (cons (:source-table query))))))

(defn- dependents-for-cards [cards]
  (let [cards-by-db (group-by :database_id cards)
        db->mp (into {} (map (juxt identity lib.metadata.jvm/application-database-metadata-provider)
                             (keys cards-by-db)))]
    (doseq [[database-id cards] cards-by-db]
      (let [{:keys [card-ids table-ids]}
            (->> cards
                 (mapcat (comp collect-source-tables #(-> % :dataset_query :query)))
                 partition-table-ids)
            real-card-ids (filter pos-int? (concat (map :id cards) card-ids)) ; xray cards don't have real ids
            mp (db->mp database-id)]
        (lib.metadata.protocols/metadatas mp :metadata/card real-card-ids)
        (lib.metadata.protocols/metadatas mp :metadata/table table-ids)))
    (group-by :type (set (mapcat (fn [{card-type :type card-id :id :keys [database_id dataset_query]}]
                                   (let [mp (db->mp database_id)
                                         query (lib/query mp dataset_query)]
                                     (if (and (pos-int? card-id) (some? card-type))
                                       (lib/dependent-metadata query card-id card-type)
                                       ;; xray cards don't have real ids
                                       (lib/dependent-metadata query nil :question)))) cards)))))

(defn- hydrate-persisted-for-models
  [cards]
  (let [models (m/index-by :id (t2/hydrate (filter card/model? cards) :persisted))]
    (map #(get models (:id %) %) cards)))

(defn- get-cards
  [ids]
  (when (seq ids)
    (let [root-collection
          (collection.root/hydrated-root-collection)
          with-last-edit-info #(last-edit/with-last-edit-info % :card)
          hydrate #(t2/hydrate %
                               :based_on_upload
                               :creator
                               :dashboard_count
                               :can_write
                               :can_run_adhoc_query
                               :average_query_time
                               :last_query_start
                               :parameter_usage_count
                               :can_restore
                               [:collection :is_personal]
                               [:moderation_reviews :moderator_details])]
      (->> (t2/select :model/Card :id [:in ids])
           (filter mi/can-read?)
           hydrate
           hydrate-persisted-for-models
           with-last-edit-info
           (map #(collection.root/hydrate-root-collection % root-collection))))))

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
                        (map :id)
                        get-cards
                        (sort-by :id)
                        vec)
        cards (->> (concat
                    (for [{:keys [card series]} dashcards
                          :let [all (conj series card)]
                          card all]
                      card)
                    link-cards)
                   (filter :dataset_query)
                   (into []))
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

(defn adhoc-query-metadata
  "Fetches dependent query-metadata for a given ad-hoc query."
  [{:keys [database] :as dataset-query}]
  (let [mp (lib.metadata.jvm/application-database-metadata-provider database)
        query (lib/query mp dataset-query)
        dependents (lib/dependent-metadata query nil :question)]
    (metadata-for-dependents (group-by :type dependents))))

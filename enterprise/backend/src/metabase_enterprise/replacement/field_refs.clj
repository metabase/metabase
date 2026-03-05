(ns metabase-enterprise.replacement.field-refs
  (:require
   [medley.core :as m]
   [metabase-enterprise.replacement.schema :as replacement.schema]
   [metabase-enterprise.replacement.util :as replacement.util]
   [metabase-enterprise.replacement.viz :as replacement.viz]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.models.visualization-settings :as vs]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn- card-upgrade-field-refs!
  [card]
  (when (replacement.util/valid-query? (:dataset_query card))
    (let [query         (:dataset_query card)
          query'        (lib-be/upgrade-field-refs-in-query query)
          viz-settings  (:visualization_settings card)
          viz-settings' (some->> viz-settings vs/db->norm (replacement.viz/update-card-viz-settings query') vs/norm->db)
          changes       (cond-> {}
                          (not= query query') (assoc :dataset_query query')
                          (not= viz-settings viz-settings') (assoc :visualization_settings viz-settings'))
          ;; result_metadata is set to nil for native queries if not present in changes
          changes       (cond-> changes
                          (and (seq changes)
                               (lib/native-only-query? query'))
                          (assoc :result_metadata (:result_metadata card)))]
      (when (seq changes)
        (t2/update! :model/Card (:id card) changes)))))

(defn- transform-upgrade-field-refs!
  [transform]
  (let [source (:source transform)]
    (when (and (= :query (:type source))
               (replacement.util/valid-query? (:query source)))
      (let [query (:query source)
            query' (lib-be/upgrade-field-refs-in-query query)]
        (when (not= query query')
          (t2/update! :model/Transform (:id transform) {:source (assoc source :query query')}))))))

(defn- segment-upgrade-field-refs!
  [segment]
  (when (replacement.util/valid-query? (:definition segment))
    (let [query  (:definition segment)
          query' (lib-be/upgrade-field-refs-in-query query)]
      (when (not= query query')
        (t2/update! :model/Segment (:id segment) {:definition query'})))))

(defn- measure-upgrade-field-refs!
  [measure]
  (when (replacement.util/valid-query? (:definition measure))
    (let [query  (:definition measure)
          query' (lib-be/upgrade-field-refs-in-query query)]
      (when (not= query query')
        (t2/update! :model/Measure (:id measure) {:definition query'})))))

(defn- dashcard-upgrade-parameter-mappings
  [parameter-mappings card-id->query]
  (mapv (fn [mapping]
          (or (when-let [query (get card-id->query (:card_id mapping))]
                (m/update-existing mapping :target #(lib-be/upgrade-field-ref-in-parameter-target query %)))
              mapping))
        parameter-mappings))

(defn- dashcard-upgrade-field-refs!
  [dashcard card-id->query]
  (let [parameter-mappings  (:parameter_mappings dashcard)
        parameter-mappings' (dashcard-upgrade-parameter-mappings parameter-mappings card-id->query)
        viz-settings        (:visualization_settings dashcard)
        viz-settings'       (some-> viz-settings
                                    vs/db->norm
                                    (replacement.viz/update-dashcard-viz-settings card-id->query lib-be/upgrade-field-ref-in-parameter-target)
                                    vs/norm->db)
        changes (cond-> {}
                  (not= parameter-mappings parameter-mappings')
                  (assoc :parameter_mappings parameter-mappings')
                  (not= viz-settings viz-settings')
                  (assoc :visualization_settings viz-settings'))]
    (when (seq changes)
      (t2/update! :model/DashboardCard (:id dashcard) changes))))

(defn dashboard-upgrade-field-refs!
  "Upgrade field refs in parameter_mappings and column_settings for all dashcards in a dashboard.
   Each parameter_mapping's :card_id determines which card's query to use for the upgrade."
  [dashboard-id]
  (let [dashcards    (t2/select :model/DashboardCard :dashboard_id dashboard-id)
        all-card-ids (into #{}
                           (comp (mapcat (fn [dashcard]
                                           (cons (:card_id dashcard)
                                                 (concat
                                                  (keep :card_id (:parameter_mappings dashcard))
                                                  (replacement.viz/dashboard-viz-settings->card-ids (-> dashcard :visualization_settings vs/db->norm))))))
                                 (remove nil?))
                           dashcards)
        card-id->query (when (seq all-card-ids)
                         (t2/select-pk->fn :dataset_query :model/Card :id [:in all-card-ids]))]
    (doseq [dashcard dashcards]
      (dashcard-upgrade-field-refs! dashcard card-id->query))))

(mu/defn upgrade!
  "Upgrade field refs in an entity.

  `entity-ref` is a [type id] tuple like [:dashboard 123] or [:card 456].
  `loaded-object` is an optional pre-fetched entity map from bulk-load-metadata-for-entities!.
  Dashboards don't use loaded-object (not bulk-loaded)."
  ([entity-ref :- ::replacement.schema/entity-ref]
   (upgrade! entity-ref nil))
  ([entity-ref :- ::replacement.schema/entity-ref
    loaded-object]
   (let [[entity-type entity-id] entity-ref]
     (case entity-type
       :dashboard (dashboard-upgrade-field-refs! entity-id)
       :card      (card-upgrade-field-refs! (or loaded-object (t2/select-one :model/Card :id entity-id)))
       :transform (transform-upgrade-field-refs! (or loaded-object (t2/select-one :model/Transform :id entity-id)))
       :segment   (segment-upgrade-field-refs! (or loaded-object (t2/select-one :model/Segment :id entity-id)))
       :measure   (measure-upgrade-field-refs! (or loaded-object (t2/select-one :model/Measure :id entity-id)))
       ;; table - no-op
       nil))))

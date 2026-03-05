(ns metabase-enterprise.replacement.field-refs
  (:require
   [metabase-enterprise.replacement.util :as replacement.util]
   [metabase-enterprise.replacement.walk :as replacement.walk]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.util :as lib.util]
   [metabase.models.visualization-settings :as vs]
   [toucan2.core :as t2]))

(defn- ref->column-name
  "Resolve a `ref` to a deduplicated column name used in `:visualization_settings`."
  [query ref]
  (when (lib.util/field-clause? ref)
    (when-some [column (lib/resolve-field-ref query -1 ref)]
      ((some-fn :lib/deduplicated-name :name) column))))

(defn- card-upgrade-field-refs!
  "Upgrade field refs in `:dataset_query` and `:visualization_settings` for a card."
  [card]
  (when (replacement.util/valid-query? (:dataset_query card))
    (let [query         (:dataset_query card)
          query'        (lib-be/upgrade-field-refs-in-query query)
          viz-settings  (:visualization_settings card)
          viz-settings' (some-> viz-settings
                                vs/db->norm
                                (replacement.walk/walk-viz-settings-refs #(ref->column-name query %))
                                vs/norm->db)
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
  "Upgrade field refs in `:source` for a transform."
  [transform]
  (let [source (:source transform)]
    (when (and (= :query (:type source))
               (replacement.util/valid-query? (:query source)))
      (let [query (:query source)
            query' (lib-be/upgrade-field-refs-in-query query)]
        (when (not= query query')
          (t2/update! :model/Transform (:id transform) {:source (assoc source :query query')}))))))

(defn- segment-upgrade-field-refs!
  "Upgrade field refs in `:definition` for a segment."
  [segment]
  (when (replacement.util/valid-query? (:definition segment))
    (let [query  (:definition segment)
          query' (lib-be/upgrade-field-refs-in-query query)]
      (when (not= query query')
        (t2/update! :model/Segment (:id segment) {:definition query'})))))

(defn- measure-upgrade-field-refs!
  "Upgrade field refs in `:definition` for a measure."
  [measure]
  (when (replacement.util/valid-query? (:definition measure))
    (let [query  (:definition measure)
          query' (lib-be/upgrade-field-refs-in-query query)]
      (when (not= query query')
        (t2/update! :model/Measure (:id measure) {:definition query'})))))

(defn- upgrade-parameter-target
  "Upgrade field refs in a parameter target."
  [target card-id card-id->card]
  (or (when-some [card (get card-id->card card-id)]
        (let [query (:dataset_query card)]
          (when (replacement.util/valid-query? query)
            (lib-be/upgrade-field-ref-in-parameter-target query target))))
      target))

(defn- dashcard-upgrade-field-refs!
  "Upgrade field refs in `:parameter_mappings` and `:visualization_settings` for a dashcard."
  [dashcard card-id->card]
  (let [parameter-mappings  (:parameter_mappings dashcard)
        parameter-mappings' (replacement.walk/walk-parameter-mapping-targets parameter-mappings
                                                                             #(upgrade-parameter-target %1 %2 card-id->card))
        viz-settings        (:visualization_settings dashcard)
        viz-settings'       (some-> viz-settings
                                    vs/db->norm
                                    (replacement.walk/walk-viz-settings-click-behaviors #(upgrade-parameter-target %1 %2 card-id->card))
                                    vs/norm->db)
        changes (cond-> {}
                  (not= parameter-mappings parameter-mappings')
                  (assoc :parameter_mappings parameter-mappings')
                  (not= viz-settings viz-settings')
                  (assoc :visualization_settings viz-settings'))]
    (when (seq changes)
      (t2/update! :model/DashboardCard (:id dashcard) changes))))

(defn dashboard-upgrade-field-refs!
  "Upgrade field refs in `:parameter_mappings` and `:visualization_settings` for all dashcards in a dashboard."
  [dashboard-id]
  (let [dashcards    (t2/select :model/DashboardCard :dashboard_id dashboard-id)
        all-card-ids (into #{}
                           (mapcat (fn [dashcard]
                                     (concat
                                      (replacement.walk/parameter-mapping-card-ids (:parameter_mappings dashcard))
                                      (replacement.walk/viz-settings-click-behavior-card-ids (-> dashcard :visualization_settings vs/db->norm)))))
                           dashcards)
        card-id->card (if (seq all-card-ids)
                        (t2/select-pk->fn :dataset_query :model/Card :id [:in all-card-ids])
                        {})]
    (doseq [dashcard dashcards]
      (dashcard-upgrade-field-refs! dashcard card-id->card))))

(defn upgrade-field-refs!
  "Upgrade field refs in an entity.

  `entity-ref` is a [type id] tuple like [:dashboard 123] or [:card 456].
  `entity` is an optional pre-fetched entity from bulk-load-metadata-for-entities!.
  Dashboards don't use `entity`."
  ([[entity-type entity-id :as entity-ref]]
   (upgrade-field-refs! entity-ref (case entity-type
                                     :card      (t2/select-one :model/Card :id entity-id)
                                     :transform (t2/select-one :model/Transform :id entity-id)
                                     :segment   (t2/select-one :model/Segment :id entity-id)
                                     :measure   (t2/select-one :model/Measure :id entity-id)
                                     nil)))
  ([[entity-type entity-id] entity]
   (case entity-type
     :card      (card-upgrade-field-refs! entity)
     :transform (transform-upgrade-field-refs! entity)
     :segment   (segment-upgrade-field-refs! entity)
     :measure   (measure-upgrade-field-refs! entity)
     :dashboard (dashboard-upgrade-field-refs! entity-id)
     nil)))

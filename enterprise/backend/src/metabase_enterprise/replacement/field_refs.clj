(ns metabase-enterprise.replacement.field-refs
  (:require
   [metabase-enterprise.replacement.util :as replacement.util]
   [metabase-enterprise.replacement.walk :as replacement.walk]
   [metabase.lib.core :as lib]
   [metabase.lib.util :as lib.util]
   [metabase.models.visualization-settings :as vs]
   [metabase.source-swap.core :as source-swap]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- ref->column-name
  "Resolve a `ref` to a deduplicated column name used in `:visualization_settings`."
  [ref columns]
  (when-some [column (lib/find-matching-column ref columns)]
    ((some-fn :lib/deduplicated-name :name) column)))

(defn- upgrade-source-card-ref
  "Upgrade a ref used for a parameter source based on the card."
  [ref card-id card-id->card]
  (or (when (lib.util/field-clause? ref)
        (when-some [card (get card-id->card card-id)]
          (let [query (:dataset_query card)]
            (when (replacement.util/valid-query? query)
              (-> query
                  lib/append-stage
                  (source-swap/upgrade-field-ref -1 ref))))))
      ref))

(defn- card-upgrade-parameters
  "Upgrade refs in `:value_field` and `:label_field` in the `:values_source_config` for `parameters`."
  [parameters]
  (let [card-ids      (replacement.walk/parameter-source-card-ids parameters)
        card-id->card (when (seq card-ids)
                        (t2/select-pk->fn identity :model/Card :id [:in card-ids]))]
    (if (seq card-ids)
      (replacement.walk/walk-parameter-source-card-refs parameters #(upgrade-source-card-ref %1 %2 card-id->card))
      parameters)))

(defn- card-upgrade-field-refs!
  "Upgrade field refs in `:dataset_query` and `:visualization_settings` for a card."
  [card]
  (let [query         (:dataset_query card)
        valid-query?  (replacement.util/valid-query? query)
        query'        (if valid-query?
                        (source-swap/upgrade-field-refs-in-query query)
                        query)
        viz-settings  (:visualization_settings card)
        viz-settings' (if valid-query?
                        (let [columns (lib/returned-columns query')]
                          (lib/with-aggregation-list (lib/aggregations query')
                            (some-> viz-settings
                                    vs/db->norm
                                    (replacement.walk/walk-viz-settings-refs #(ref->column-name % columns))
                                    vs/norm->db)))
                        viz-settings)
        parameters    (:parameters card)
        parameters'   (if (seq parameters)
                        (card-upgrade-parameters parameters)
                        parameters)
        changes       (cond-> {}
                        (not= query query') (assoc :dataset_query query')
                        (not= viz-settings viz-settings') (assoc :visualization_settings viz-settings')
                        (not= parameters parameters') (assoc :parameters parameters'))
        ;; `:result_metadata` is set to nil for native queries if not present in changes.
        ;; `:verified-result-metadata?` prevents the Card model hooks from clearing it.
        changes       (cond-> changes
                        (and (seq changes)
                             (lib/native-only-query? query'))
                        (assoc :result_metadata (:result_metadata card)
                               :verified-result-metadata? true))]
    (when (seq changes)
      (t2/update! :model/Card (:id card) changes))))

(defn- transform-upgrade-field-refs!
  "Upgrade field refs in `:source` for a transform."
  [transform]
  (let [source (:source transform)]
    (when (and (= :query (:type source))
               (replacement.util/valid-query? (:query source)))
      (let [query (:query source)
            query' (source-swap/upgrade-field-refs-in-query query)]
        (when (not= query query')
          (t2/update! :model/Transform (:id transform) {:source (assoc source :query query')}))))))

(defn- segment-upgrade-field-refs!
  "Upgrade field refs in `:definition` for a segment."
  [segment]
  (when (replacement.util/valid-query? (:definition segment))
    (let [query  (:definition segment)
          query' (source-swap/upgrade-field-refs-in-query query)]
      (when (not= query query')
        (t2/update! :model/Segment (:id segment) {:definition query'})))))

(defn- measure-upgrade-field-refs!
  "Upgrade field refs in `:definition` for a measure."
  [measure]
  (when (replacement.util/valid-query? (:definition measure))
    (let [query  (:definition measure)
          query' (source-swap/upgrade-field-refs-in-query query)]
      (when (not= query query')
        (t2/update! :model/Measure (:id measure) {:definition query'})))))

(defn- upgrade-parameter-target
  "Upgrade field refs in a parameter target."
  [target card-id card-id->card]
  (or (when-some [card (get card-id->card card-id)]
        (let [query (:dataset_query card)]
          (when (replacement.util/valid-query? query)
            (source-swap/upgrade-field-ref-in-parameter-target query target))))
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
  "Upgrade field refs in `:parameters` for the `dashboard`, `:parameter_mappings` and `:visualization_settings` for all dashcards in the `dashboard`."
  [dashboard]
  (let [dashcards     (t2/select :model/DashboardCard :dashboard_id (:id dashboard))
        parameters    (or (:parameters dashboard) [])
        all-card-ids  (into (replacement.walk/parameter-source-card-ids parameters)
                            (mapcat (fn [dashcard]
                                      (concat
                                       (replacement.walk/parameter-mapping-card-ids (:parameter_mappings dashcard))
                                       (replacement.walk/viz-settings-click-behavior-card-ids (-> dashcard :visualization_settings vs/db->norm)))))
                            dashcards)
        card-id->card (if (seq all-card-ids)
                        (t2/select-pk->fn identity :model/Card :id [:in all-card-ids])
                        {})
        parameters'   (replacement.walk/walk-parameter-source-card-refs parameters #(upgrade-source-card-ref %1 %2 card-id->card))
        changes       (cond-> {}
                        (not= parameters parameters')
                        (assoc :parameters parameters'))]
    (when (seq changes)
      (t2/update! :model/Dashboard (:id dashboard) changes))
    (doseq [dashcard dashcards]
      (dashcard-upgrade-field-refs! dashcard card-id->card))))

(defn upgrade-field-refs!
  "Upgrade field refs in an entity.

  `entity-ref` is a [type id] tuple like [:dashboard 123] or [:card 456].
  `entity` is an optional pre-fetched entity from bulk-load-metadata-for-entities!."
  ([[entity-type entity-id :as entity-ref]]
   (upgrade-field-refs! entity-ref (case entity-type
                                     :card      (t2/select-one :model/Card :id entity-id)
                                     :transform (t2/select-one :model/Transform :id entity-id)
                                     :segment   (t2/select-one :model/Segment :id entity-id)
                                     :measure   (t2/select-one :model/Measure :id entity-id)
                                     :dashboard (t2/select-one :model/Dashboard :id entity-id)
                                     nil)))
  ([[entity-type _entity-id] entity]
   (case entity-type
     :card      (card-upgrade-field-refs! entity)
     :transform (transform-upgrade-field-refs! entity)
     :segment   (segment-upgrade-field-refs! entity)
     :measure   (measure-upgrade-field-refs! entity)
     :dashboard (dashboard-upgrade-field-refs! entity)
     nil)))

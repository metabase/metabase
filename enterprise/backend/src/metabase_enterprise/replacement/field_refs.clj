(ns metabase-enterprise.replacement.field-refs
  (:require
   [metabase-enterprise.replacement.db :as replacement.db]
   [metabase-enterprise.replacement.entity :as replacement.entity]
   [metabase.lib.core :as lib]
   [metabase.lib.util :as lib.util]
   [metabase.replacement.core :as replacement]
   [metabase.replacement.util :as replacement.util]
   [metabase.replacement.walk :as replacement.walk]))

(set! *warn-on-reflection* true)

(defn- upgrade-source-card-ref
  "Upgrade a ref used for a parameter source based on the card."
  [ref card-id card-id->card]
  (or (when (lib.util/field-clause? ref)
        (when-some [card (get card-id->card card-id)]
          (let [query (:dataset_query card)]
            (when (replacement.util/valid-query? query)
              (-> query
                  lib/append-stage
                  (replacement/upgrade-field-ref -1 ref))))))
      ref))

(defn- transform-upgrade-field-refs!
  "Upgrade field refs in `:source` for a transform."
  [transform]
  (let [source (:source transform)]
    (when (and (= :query (:type source))
               (replacement.util/valid-query? (:query source)))
      (let [query (:query source)
            query' (replacement/upgrade-field-refs-in-query query)]
        (when (not= query query')
          (replacement.db/update-transform! (:id transform) {:source (assoc source :query query')}))))))

(defn- segment-upgrade-field-refs!
  "Upgrade field refs in `:definition` for a segment."
  [segment]
  (when (replacement.util/valid-query? (:definition segment))
    (let [query  (:definition segment)
          query' (replacement/upgrade-field-refs-in-query query)]
      (when (not= query query')
        (replacement.db/update-segment! (:id segment) {:definition query'})))))

(defn- measure-upgrade-field-refs!
  "Upgrade field refs in `:definition` for a measure."
  [measure]
  (when (replacement.util/valid-query? (:definition measure))
    (let [query  (:definition measure)
          query' (replacement/upgrade-field-refs-in-query query)]
      (when (not= query query')
        (replacement.db/update-measure! (:id measure) {:definition query'})))))

(defn- upgrade-parameter-target
  "Upgrade field refs in a parameter target."
  [target card-id card-id->card]
  (or (when-some [card (get card-id->card card-id)]
        (let [query (:dataset_query card)]
          (when (replacement.util/valid-query? query)
            (replacement/upgrade-field-ref-in-parameter-target query target))))
      target))

(defn- dashcard-upgrade-field-refs!
  "Upgrade field refs in `:parameter_mappings` and `:visualization_settings` for a dashcard."
  [dashcard card-id->card]
  (let [parameter-mappings  (:parameter_mappings dashcard)
        parameter-mappings' (replacement.walk/walk-parameter-mapping-targets parameter-mappings
                                                                             #(upgrade-parameter-target %1 %2 card-id->card))
        viz-settings        (:visualization_settings dashcard)
        viz-settings'       (some-> viz-settings
                                    (replacement.walk/walk-viz-settings-click-behaviors #(upgrade-parameter-target %1 %2 card-id->card)))
        changes (cond-> {}
                  (not= parameter-mappings parameter-mappings')
                  (assoc :parameter_mappings parameter-mappings')
                  (not= viz-settings viz-settings')
                  (assoc :visualization_settings viz-settings'))]
    (when (seq changes)
      (replacement.db/update-dashboard-card! (:id dashcard) changes))))

(defn dashboard-upgrade-field-refs!
  "Upgrade field refs in `:parameters` for the `dashboard`, `:parameter_mappings` and `:visualization_settings` for all dashcards in the `dashboard`."
  [dashboard]
  (let [dashcards     (replacement.db/dashboard-cards (:id dashboard))
        parameters    (or (:parameters dashboard) [])
        all-card-ids  (into (replacement.walk/parameter-source-card-ids parameters)
                            (mapcat (fn [dashcard]
                                      (concat
                                       (replacement.walk/parameter-mapping-card-ids (:parameter_mappings dashcard))
                                       (replacement.walk/viz-settings-click-behavior-card-ids (:visualization_settings dashcard)))))
                            dashcards)
        card-id->card (if (seq all-card-ids)
                        (replacement.db/cards-by-id all-card-ids)
                        {})
        parameters'   (replacement.walk/walk-parameter-source-card-refs parameters #(upgrade-source-card-ref %1 %2 card-id->card))
        changes       (cond-> {}
                        (not= parameters parameters')
                        (assoc :parameters parameters'))]
    (when (seq changes)
      (replacement.db/update-dashboard! (:id dashboard) changes))
    (doseq [dashcard dashcards]
      (dashcard-upgrade-field-refs! dashcard card-id->card))))

(defn- upgrade-field-refs-by-spec!
  "Apply the writes of the `:upgrade-field-refs` of the replacement spec of `entity-type` to `row`, if any."
  [entity-type row]
  (let [spec (replacement.entity/entity-spec entity-type)]
    (when-let [upgrade (and row (:upgrade-field-refs spec))]
      (replacement.entity/apply-writes! (upgrade (replacement.entity/hydrated spec row))))))

(defn upgrade-field-refs!
  "Upgrade field refs in an entity.

  `entity-ref` is a [type id] tuple like [:dashboard 123] or [:card 456].
  `entity` is an optional pre-fetched entity from bulk-load-metadata-for-entities!."
  ([[entity-type entity-id :as entity-ref]]
   (upgrade-field-refs! entity-ref (case entity-type
                                     :card      (replacement.entity/row entity-ref)
                                     :transform (replacement.db/transform entity-id)
                                     :segment   (replacement.db/segment entity-id)
                                     :measure   (replacement.db/measure entity-id)
                                     :dashboard (replacement.db/dashboard entity-id)
                                     nil)))
  ([[entity-type _entity-id] entity]
   (case entity-type
     :card      (upgrade-field-refs-by-spec! entity-type entity)
     :transform (transform-upgrade-field-refs! entity)
     :segment   (segment-upgrade-field-refs! entity)
     :measure   (measure-upgrade-field-refs! entity)
     :dashboard (dashboard-upgrade-field-refs! entity)
     nil)))

(ns metabase-enterprise.dependencies.result-metadata
  "Re-derives the result metadata of the MBQL cards whose ResultMetadataStatus a write marked stale, which a write of
  what they read does; native cards are left alone, since their result metadata comes from running them."
  (:require
   [clojure.core.cache.wrapped :as cache.wrapped]
   [malli.error :as me]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.result-metadata-status :as models.result-metadata-status]
   [metabase-enterprise.dependencies.schema :as dependencies.schema]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.queries.core :as queries]
   [metabase.types.core :as types]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.match :as match]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private compared-column-keys
  "The result metadata column keys that the queries using a card as a source see."
  [:name :display_name :description :semantic_type :fk_target_field_id :id :settings :visibility_type
   :base_type :effective_type :unit :inherited_temporal_unit])

(def ^:private measured-column-keys
  "The result metadata column keys a run of the card measures, within the type that inference gets right."
  [:base_type :effective_type :database_type])

(def ^:private Column
  "A result metadata column, as a card stores or inference returns it, valid or not."
  [:fn {:error/message "a map"} map?])

(def ^:private TypeName
  "A type, as a keyword or as the string a stored column may hold it as."
  [:maybe [:or :keyword :string]])

(mu/defn- normalize-column :- Column
  "The result metadata column `col` with its unqualified keys in snake_case."
  [col :- Column]
  (update-keys col #(cond-> % (not (qualified-keyword? %)) u/->snake_case_en)))

(mu/defn- comparable-metadata :- [:vector [:map-of :keyword :any]]
  "The [[compared-column-keys]] of the result metadata `cols` with a value, with keyword values as strings."
  [cols :- [:sequential Column]]
  (mapv (fn [col]
          (into {}
                (keep (fn [k]
                        (when-some [v (get col k)]
                          [k (match/replace-all v #'keyword? (u/qualified-name &match))])))
                compared-column-keys))
        cols))

(mu/defn same-output? :- :boolean
  "Whether the result metadata `before` and `after` show the queries using the card the same columns."
  [before :- [:maybe [:sequential Column]]
   after  :- [:maybe [:sequential Column]]]
  (= (comparable-metadata (map normalize-column before))
     (comparable-metadata (map normalize-column after))))

(mu/defn- same-root-type? :- [:maybe :boolean]
  "Whether the types `x` and `y` share an ancestor below `:type/*`, like integers and decimals do."
  [x :- TypeName
   y :- TypeName]
  (and x y (not= :type/* (types/most-specific-common-ancestor (keyword x) (keyword y)))))

(mu/defn- measured-by-a-run? :- [:maybe :boolean]
  "Whether the stored column `stored-col` holds what a run measured for the inferred column `col`: a run stored its
  source type, they have types of the same root, and the column's source type is unchanged or unknown."
  [stored-col :- Column
   col        :- Column]
  (and (some? (:database_type stored-col))
       (same-root-type? (:base_type stored-col) (:base_type col))
       (or (nil? (:database_type col))
           (= (:database_type col) (:database_type stored-col)))))

(mu/defn- patch-result-metadata :- [:vector Column]
  "The inferred result metadata `inferred`, each column keeping the [[measured-column-keys]] of the stored column of
  `stored` it stands for when a run measured them, and only that column's fingerprint, so that the job never shows a
  fingerprint the card's runs and saves did not store."
  [stored   :- [:sequential Column]
   inferred :- [:sequential Column]]
  (mapv (fn [col stored-col]
          (cond-> (dissoc col :fingerprint)
            (and stored-col (measured-by-a-run? stored-col col))
            (merge (select-keys stored-col measured-column-keys))

            (some? (:fingerprint stored-col))
            (assoc :fingerprint (:fingerprint stored-col))))
        inferred
        (lib/match-returned-columns stored inferred)))

(mu/defn- rederived-result-metadata :- [:maybe ::lib.schema.metadata/card.result-metadata]
  "The re-derived result metadata of the MBQL `card`, inferred as no user so no one's permissions decide it, or nil
  when what the queries using it see is unchanged."
  [{query :dataset_query, stored :result_metadata, :keys [id], :as card} :- (ms/InstanceOf :model/Card)]
  (let [stored   (mapv normalize-column stored)
        metadata (patch-result-metadata
                  stored
                  (or (queries/infer-metadata-with-model-overrides query card)
                      (throw (ex-info "Could not infer the result metadata of the card" {:card-id id}))))]
    (when (not= (comparable-metadata stored) (comparable-metadata metadata))
      (when-let [error (me/humanize (mr/explain ::lib.schema.metadata/card.result-metadata metadata))]
        (throw (ex-info "Invalid re-derived result metadata" {:card-id id :error error})))
      metadata)))

(mu/defn- store-result-metadata!
  "Mark the entities directly depending on the Card with `card-id` stale, then, under the card's row lock, store its
  re-derived result metadata `metadata` through the Card model when the card is still in the `state` it was re-derived
  from, or else mark the card stale, so it is re-derived from what a save or a run stored meanwhile."
  [card-id  :- ::lib.schema.id/card
   state    :- ::dependencies.schema/card-state
   metadata :- ::lib.schema.metadata/card.result-metadata]
  (t2/with-transaction [_]
    (dependencies.db/mark-dependents-result-metadata-statuses-stale! :card #{card-id})
    (dependencies.db/mark-dependents-analysis-finding-statuses-stale! :card #{card-id})
    (if (= state (dependencies.db/card-state card-id true))
      (dependencies.db/set-card-result-metadata! card-id metadata)
      (dependencies.db/mark-result-metadata-statuses-stale! {:card #{card-id}}))))

(mu/defn- rederive-card!
  "Re-derive the result metadata of the MBQL `card` in `state`, as the batch read them, and store it when it changed."
  [card  :- [:maybe (ms/InstanceOf :model/Card)]
   state :- [:maybe ::dependencies.schema/card-state]]
  (let [metadata (when (and card (not= :native (:query_type card)) (seq (:dataset_query card)))
                   (rederived-result-metadata card))]
    (when (and state metadata)
      (store-result-metadata! (:id card) state metadata)
      ;; the batch's cards share a metadata cache, and the ones after this read its new metadata
      (some-> (lib-be/metadata-provider-cache) (cache.wrapped/evict (:database_id card))))))

(mu/defn- record-failure! :- :nil
  [card-id :- ::lib.schema.id/card
   e       :- (ms/InstanceOfClass Throwable)]
  (log/warnf "Failed to re-derive the result metadata of card %s: %s" card-id (ex-message e))
  (when (dependencies.db/record-result-metadata-failure! card-id (deps.settings/dependency-max-failures))
    (log/warnf "Giving up on the result metadata of card %s until it changes" card-id))
  nil)

(mu/defn- cards-with-states :- [:sequential [:map {:closed true}
                                             [:card-id ::lib.schema.id/card]
                                             [:card    [:maybe (ms/InstanceOf :model/Card)]]
                                             [:state   [:maybe ::dependencies.schema/card-state]]]]
  [card-ids :- [:set ::lib.schema.id/card]]
  (let [card-ids (vec card-ids)
        ;; states before cards: a write in between leaves a card newer than its state, which fails the store, rather
        ;; than storing what an older query returns
        states   (dependencies.db/card-states-by-id card-ids)
        cards    (dependencies.db/cards-by-id card-ids)]
    (mapv (fn [card-id] {:card-id card-id :card (cards card-id) :state (states card-id)}) card-ids)))

(mu/defn update-result-metadata! :- nat-int?
  "Delete the statuses of deleted cards, then re-derive up to `batch-size` MBQL cards whose ResultMetadataStatus counts
  a write, is missing or is outdated, clearing each one's `stale` count unless a write raised it meanwhile, or counting
  its failure, returning how many statuses it took, deleted ones included."
  [batch-size :- ms/PositiveInt]
  (let [deleted-ids (dependencies.db/result-metadata-deleted-card-ids batch-size)
        statuses    (dependencies.db/take-pending-result-metadata-statuses!
                     batch-size models.result-metadata-status/current-result-metadata-version
                     models.dependency/current-dependency-analysis-version)]
    (when (seq deleted-ids)
      (dependencies.db/delete-result-metadata-statuses! deleted-ids))
    (lib-be/with-metadata-provider-cache
      (let [read (into {}
                       (map (juxt :card-id identity))
                       (dependencies.db/readable-entities
                        cards-with-states (into #{} (map :entity_id) statuses) record-failure!))]
        ;; an unreadable card already counted its failure
        (doseq [{card-id :entity_id, :keys [stale]} (filterv (comp read :entity_id) statuses)]
          (try
            ;; one commit for the metadata and the status
            (t2/with-transaction [_]
              (let [{:keys [card state]} (read card-id)]
                (rederive-card! card state))
              (dependencies.db/clear-result-metadata-status!
               card-id stale models.result-metadata-status/current-result-metadata-version))
            (catch Throwable e
              (dependencies.db/throw-unless-app-db-reachable! e)
              (record-failure! card-id e)
              (when-not (instance? Exception e)
                (throw e)))))))
    (+ (count deleted-ids) (count statuses))))

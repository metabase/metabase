(ns metabase-enterprise.dependencies.result-metadata
  "Re-derives the result metadata of the MBQL cards whose ResultMetadataStatus a write marked stale, which a write of
  what they read does; native cards are left alone, since their result metadata comes from running them."
  (:require
   [malli.error :as me]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.models.analysis-finding-status :as models.analysis-finding-status]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.result-metadata-status :as models.result-metadata-status]
   [metabase-enterprise.dependencies.schema :as dependencies.schema]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase-enterprise.dependencies.task.util :as task.util]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.queries.core :as queries]
   [metabase.queries.models.card :as queries.card]
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

(mu/defn- store-result-metadata! :- :nil
  "Lock the rows of the Cards `card-id->update`, a map of Card id to its `:state` and re-derived result metadata
  `:metadata`, in the order of their ids, as a save locks its Card before its dependents, mark the entities directly
  depending on them stale, then store the metadata through the Card model of those still in the state it was
  re-derived from with one call, or else mark them stale, so they are re-derived from what a save or a run stored
  meanwhile."
  [card-id->update :- [:map-of ::lib.schema.id/card [:map {:closed true}
                                                     [:state    ::dependencies.schema/card-state]
                                                     [:metadata ::lib.schema.metadata/card.result-metadata]]]]
  (let [card-ids (set (keys card-id->update))]
    (t2/with-transaction [_]
      (let [current           (dependencies.db/card-states (vec card-ids) true)
            {same true
             changed false} (group-by (fn [[card-id {:keys [state]}]] (= state (get current card-id)))
                                      card-id->update)]
        (models.result-metadata-status/mark-dependents-result-metadata-statuses-stale! :card card-ids)
        (models.analysis-finding-status/mark-dependents-analysis-finding-statuses-stale! :card card-ids)
        (when (seq same)
          (queries.card/update-cards! (mapv (fn [[card-id {:keys [metadata]}]]
                                              {:id card-id :result_metadata metadata :updated_at :updated_at})
                                            same)
                                      {:writer :sync}))
        (when (seq changed)
          (models.result-metadata-status/mark-result-metadata-statuses-stale! {:card (set (map key changed))}))))
    nil))

(mu/defn- rederived-card-metadata :- [:maybe ::lib.schema.metadata/card.result-metadata]
  "The re-derived result metadata of the Card `card`, or nil when it needs none."
  [card :- [:maybe (ms/InstanceOf :model/Card)]]
  (when (and card (not= :native (:query_type card)) (seq (:dataset_query card)))
    (rederived-result-metadata card)))

(mu/defn- cards-with-states
  "The `:state` and `:card` of each of the Cards `card-ids`, as Card id and map pairs."
  [card-ids :- [:set ::lib.schema.id/card]]
  (let [ids    (vec card-ids)
        states (dependencies.db/card-states ids false)
        cards  (dependencies.db/cards ids)]
    (map (fn [id] [id {:state (get states id) :card (get cards id)}]) ids)))

(mu/defn- record-failure! :- :nil
  "Count a failure to re-derive the result metadata of the Card `card-id`."
  [card-id :- ::lib.schema.id/card]
  (when (models.result-metadata-status/record-result-metadata-failure! card-id (deps.settings/dependency-max-failures))
    (log/warnf "Giving up on the result metadata of card %s until it changes" card-id))
  nil)

(mu/defn- handle-failure! :- :nil
  "Count the failure `e` to re-derive the result metadata of the Card `card-id`, rethrowing an Error."
  [card-id :- ::lib.schema.id/card
   e       :- (ms/InstanceOfClass Throwable)]
  (dependencies.db/throw-unless-app-db-reachable! e)
  (log/warnf "Failed to re-derive the result metadata of card %s: %s" card-id (ex-message e))
  (record-failure! card-id)
  (when-not (instance? Exception e)
    (throw e)))

(mu/defn- handle-unreadable! :- :nil
  "Count the failure `e` to read the Card `card-id`."
  [card-id :- ::lib.schema.id/card
   e       :- (ms/InstanceOfClass Exception)]
  (log/warnf "Failed to read card %s: %s" card-id (ex-message e))
  (record-failure! card-id))

(mu/defn update-result-metadata! :- nat-int?
  "Delete the statuses of deleted cards, then re-derive up to `batch-size` MBQL cards whose ResultMetadataStatus
  counts a write, is missing or is outdated, clearing each one's `stale` count unless a write raised it meanwhile, or
  counting its failure, returning how many statuses it took, deleted ones included, the re-derived metadata stored
  together, or for each card when that fails."
  [batch-size :- ms/PositiveInt]
  (let [deleted-ids (dependencies.db/result-metadata-deleted-card-ids batch-size)
        statuses    (models.result-metadata-status/take-pending-result-metadata-statuses!
                     batch-size models.result-metadata-status/current-result-metadata-version
                     models.dependency/current-dependency-analysis-version)]
    (when (seq deleted-ids)
      (models.result-metadata-status/delete-result-metadata-statuses! deleted-ids))
    (when (seq statuses)
      (let [stale    (into {} (map (juxt :entity_id :stale)) statuses)
            ;; a card's query keeps the metadata provider it was read with, so the read shares the batch's cache too
            derived  (lib-be/with-metadata-provider-cache
                       (into {}
                             (task.util/compute-in-parallel
                              (fn [[card-id {:keys [state card]}]]
                                [card-id {:state state :metadata (rederived-card-metadata card)}])
                              (fn [[card-id _] e]
                                (handle-failure! card-id e))
                              (dependencies.db/readable-entities cards-with-states
                                                                 (set (map :entity_id statuses))
                                                                 handle-unreadable!))))
            updates  (into {} (filter (comp (every-pred :state :metadata) val)) derived)
            stored   (if (seq updates)
                       (try
                         (store-result-metadata! updates)
                         (set (keys updates))
                         (catch Throwable e
                           (when-not (instance? Exception e)
                             (throw e))
                           (into #{}
                                 (keep (fn [[card-id card-update]]
                                         (try
                                           (store-result-metadata! {card-id card-update})
                                           card-id
                                           (catch Throwable e
                                             (handle-failure! card-id e)
                                             nil))))
                                 updates)))
                       #{})
            cleared  (into {}
                           (comp (filter (fn [[card-id _]] (or (contains? stored card-id) (not (contains? updates card-id)))))
                                 (map (fn [[card-id _]] [card-id (stale card-id)])))
                           derived)]
        (when (seq cleared)
          (models.result-metadata-status/clear-result-metadata-statuses!
           cleared models.result-metadata-status/current-result-metadata-version))))
    (+ (count deleted-ids) (count statuses))))

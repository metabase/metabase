(ns metabase-enterprise.dependencies.result-metadata
  "Re-derives the result metadata of the MBQL cards whose ResultMetadataStatus a write marked stale, which a write of
  what they read does; native cards are left alone, since their result metadata comes from running them."
  (:require
   [clojure.walk :as walk]
   [malli.error :as me]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.result-metadata-status :as models.result-metadata-status]
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
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private compared-column-keys
  "The result metadata column keys that the queries using a card as a source see."
  [:name :display_name :description :semantic_type :fk_target_field_id :id :settings :visibility_type
   :base_type :effective_type :unit :inherited_temporal_unit])

(def ^:private measured-column-keys
  "The result metadata column keys a run of the card measures, within the type that inference gets right."
  [:base_type :effective_type :database_type :fingerprint])

(defn- normalize-column
  "The result metadata column `col` with its unqualified keys in snake_case."
  [col]
  (update-keys col #(cond-> % (not (qualified-keyword? %)) u/->snake_case_en)))

(defn- comparable-metadata
  "The [[compared-column-keys]] of the result metadata `cols` with a value, with keyword values as strings."
  [cols]
  (mapv (fn [col]
          (into {}
                (keep (fn [k]
                        (when-some [v (get col k)]
                          [k (walk/postwalk #(cond-> % (keyword? %) u/qualified-name) v)])))
                compared-column-keys))
        cols))

(defn- same-root-type?
  "Whether the types `x` and `y` share an ancestor below `:type/*`, like integers and decimals do."
  [x y]
  (and x y (not= :type/* (types/most-specific-common-ancestor (keyword x) (keyword y)))))

(defn- measured-by-a-run?
  "Whether the stored column `stored-col` holds what a run measured for the inferred column `col`: a run stored its
  source type, they have types of the same root, and the column's source type is unchanged or unknown."
  [stored-col col]
  (and (some? (:database_type stored-col))
       (same-root-type? (:base_type stored-col) (:base_type col))
       (or (nil? (:database_type col))
           (= (:database_type col) (:database_type stored-col)))))

(defn- patch-result-metadata
  "The inferred result metadata `inferred`, each column keeping the [[measured-column-keys]] of the stored column of
  `stored` it stands for when a run measured them."
  [stored inferred]
  (mapv (fn [col stored-col]
          (cond-> col
            (and stored-col (measured-by-a-run? stored-col col))
            (merge (select-keys stored-col measured-column-keys))))
        inferred
        (lib/match-stored-columns stored inferred)))

(defn- rederived-result-metadata
  "The re-derived result metadata of the MBQL `card`, inferred like a save through the Card model, or nil when what the
  queries using it see is unchanged."
  [{query :dataset_query, stored :result_metadata, :keys [id], :as card}]
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
  "Mark the entities directly depending on the `card` stale, then store its re-derived result metadata `metadata`
  through the Card model, whose hooks update the parameters taking values from the columns it drops, in one
  transaction under the card's row lock; when a save or a run changed its query or result metadata since it was read,
  mark the card stale instead, so it is re-derived from what they stored."
  [{:keys [id] :as card} :- [:fn {:error/message "a Card"} map?]
   metadata              :- ::lib.schema.metadata/card.result-metadata]
  (t2/with-transaction [_]
    (if (= (select-keys card [:dataset_query :result_metadata])
           (dependencies.db/locked-card-query-and-metadata id))
      (do
        (dependencies.db/mark-dependents-result-metadata-stale! :card id)
        (dependencies.db/mark-dependents-analysis-findings-stale! :card id)
        (dependencies.db/update-card-result-metadata! id metadata))
      (dependencies.db/mark-result-metadata-statuses-stale! {:card #{id}}))))

(mu/defn- rederived-card-metadata
  "The Card with `card-id` paired with its re-derived result metadata, or nil when it is native, unchanged or gone,
  logging a failure."
  [card-id :- ::lib.schema.id/card]
  (try
    (lib-be/with-metadata-provider-cache
      (when-let [card (dependencies.db/card card-id)]
        (when-let [metadata (when (and (not= :native (:query_type card)) (seq (:dataset_query card)))
                              (rederived-result-metadata card))]
          [card metadata])))
    (catch Exception e
      (log/warnf "Failed to re-derive the result metadata of card %s: %s" card-id (ex-message e))
      nil)))

(mu/defn update-result-metadata! :- nat-int?
  "Claim up to `batch-size` MBQL cards whose ResultMetadataStatus is stale, missing or outdated, and re-derive their
  result metadata, storing each that changed, returning how many it took."
  [batch-size :- ms/PositiveInt]
  (when-let [card-ids (not-empty (dependencies.db/result-metadata-deleted-card-ids batch-size))]
    (dependencies.db/delete-result-metadata-statuses! card-ids))
  (let [card-ids (dependencies.db/result-metadata-pending-card-ids
                  batch-size models.result-metadata-status/current-result-metadata-version
                  models.dependency/current-dependency-analysis-version)]
    (when (seq card-ids)
      (dependencies.db/claim-result-metadata-statuses!
       card-ids models.result-metadata-status/current-result-metadata-version))
    (doseq [card-id        card-ids
            :let           [[card metadata] (rederived-card-metadata card-id)]
            :when          card]
      (store-result-metadata! card metadata))
    (count card-ids)))

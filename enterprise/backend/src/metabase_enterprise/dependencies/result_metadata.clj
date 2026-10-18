(ns metabase-enterprise.dependencies.result-metadata
  "Re-derives the result metadata of the transitive MBQL dependents of entities that changed since their dependents
  were last re-derived, without re-deriving or passing native cards, whose result metadata comes from running them."
  (:require
   [clojure.walk :as walk]
   [java-time.api :as t]
   [malli.error :as me]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.dependents :as deps.dependents]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.result-metadata-status :as deps.result-metadata-status]
   [metabase.graph.core :as graph]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.queries.core :as queries]
   [metabase.types.core :as types]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
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

(defn- mbql-dependents
  "The MBQL cards and measures that directly depend on the entity `entity-type` `entity-id`, as
  `[[entity-type entity-id]]`."
  [entity-type entity-id]
  (let [node     [entity-type entity-id]
        graph    (models.dependency/filtered-graph-dependents {:types deps.result-metadata-status/derived-types})
        nodes    (get (graph/children-of graph [node]) node)
        card-ids (into #{} (keep (fn [[node-type id]] (when (= node-type :card) id))) nodes)
        native   (set (when (seq card-ids) (dependencies.db/native-card-ids card-ids)))]
    (remove (fn [[node-type id]] (and (= node-type :card) (native id))) nodes)))

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

(defn- store-result-metadata!
  "Store the re-derived result metadata `metadata` of `card` through the Card model, whose hooks update the parameters
  taking values from the columns it drops, unless the card's `updated_at` changed since it was read, returning whether
  it stored it."
  [{:keys [id updated_at]} metadata]
  (t2/with-transaction [_]
    (when (some-> (dependencies.db/locked-card-updated-at id) t/instant (= (t/instant updated_at)))
      (dependencies.db/update-card-result-metadata! id metadata)
      true)))

(defn- rederive-card!
  "Re-derive and store the result metadata of the Card with `card-id` when it is an MBQL card, returning `:changed`,
  `:unchanged`, or `:conflict` without storing it when the card changed since it was read."
  [card-id]
  (let [card     (dependencies.db/card card-id)
        metadata (when (and card (not= :native (:query_type card)) (seq (:dataset_query card)))
                   (rederived-result-metadata card))]
    (cond
      (nil? metadata)                         :unchanged
      (store-result-metadata! card metadata) :changed
      :else                                   :conflict)))

(def ^:private conflict-attempts
  "How many times a card that keeps changing while it is re-derived is re-derived before it counts as failed."
  3)

(defn- rederive-card-retrying!
  "Re-derive the Card with `card-id`, again while it changed as it was re-derived, throwing when it kept changing."
  [card-id]
  (loop [attempt 1]
    (when (= :conflict (lib-be/with-metadata-provider-cache (rederive-card! card-id)))
      (if (< attempt conflict-attempts)
        (recur (inc attempt))
        (throw (ex-info "The card kept changing while it was re-derived" {:card-id card-id}))))))

(defn- dependents-breadth-first
  "The transitive MBQL dependents of the entities `nodes`, `[[entity-type entity-id]]`, breadth first and each once,
  including those of `nodes` that depend on others."
  [nodes]
  (loop [frontier nodes, seen #{}, ordered []]
    (let [next-nodes (into [] (comp (mapcat #(apply mbql-dependents %)) (distinct) (remove seen)) frontier)]
      (if (empty? next-nodes)
        ordered
        (recur next-nodes (into seen next-nodes) (into ordered next-nodes))))))

(defn rederive-dependent!
  "Re-derive the MBQL card `entity-type` `entity-id`, measures needing nothing, logging a failure."
  [[entity-type entity-id]]
  (when (= entity-type :card)
    (try
      (rederive-card-retrying! entity-id)
      (catch Exception e
        (log/warnf "Failed to re-derive the result metadata of card %s: %s" entity-id (ex-message e))))))

(defn update-result-metadata!
  "Re-derive the transitive MBQL dependents of up to `batch-size` entities that changed since their dependents were
  last re-derived, each once, then record the versions they were re-derived from, returning how many entities it took."
  [batch-size]
  (deps.dependents/process-changed-dependents!
   :model/ResultMetadataStatus deps.result-metadata-status/entity-types batch-size
   (fn [_deleted nodes]
     (run! rederive-dependent! (dependents-breadth-first nodes)))))
